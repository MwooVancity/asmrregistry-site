// Real request budget check (2026-11-27). Reads Cloudflare's own per-day Worker counts: asmrregistry shares the free
// 100,000 requests/day with riverwaterlevels, the owner's main income site. The older build check only counted sitemap
// URLs and passed on every day the limit broke; this one measures requests.
//   node tools/request-budget.mjs              exit 1 if yesterday was over, or today is on pace to be over
//   node tools/request-budget.mjs 2026-11-26   judge one past day (used to prove the check fails on a real breach)
// Limits: asmr 40,000/day (its worst day before 2026-11-15 was 26,560), whole account 70,000/day (30% headroom).
const ASMR_MAX = 40000, ACCOUNT_MAX = 70000, MIN_HOURS = 4;
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
if (!token || !account) { console.error('request-budget: CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing: cannot verify, treated as over'); process.exit(1); }
const day = (d) => d.toISOString().slice(0, 10);
const now = new Date(), arg = process.argv[2];
const from = arg || day(new Date(now - 864e5));
try {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `query{viewer{accounts(filter:{accountTag:"${account}"}){workersInvocationsAdaptive(limit:500,filter:{date_geq:"${from}"}){sum{requests}dimensions{date scriptName}}}}}` }),
  });
  const j = await r.json();
  if (j.errors?.length || !j.data) throw new Error(JSON.stringify(j.errors || j).slice(0, 200));
  const days = {};
  for (const g of j.data.viewer.accounts[0].workersInvocationsAdaptive) {
    const d = (days[g.dimensions.date] ||= { asmr: 0, total: 0 });
    d.total += g.sum.requests;
    if (g.dimensions.scriptName.startsWith('asmrregistry')) d.asmr += g.sum.requests;
  }
  const bad = [];
  const judge = (label, d, scale = 1) => {
    if (!d) return;
    const asmr = Math.round(d.asmr * scale), total = Math.round(d.total * scale);
    console.log(`request-budget: ${label}: asmr ${asmr.toLocaleString('en-US')} (max ${ASMR_MAX.toLocaleString('en-US')}), account ${total.toLocaleString('en-US')} (max ${ACCOUNT_MAX.toLocaleString('en-US')})`);
    if (asmr > ASMR_MAX) bad.push(`${label}: asmr over`);
    if (total > ACCOUNT_MAX) bad.push(`${label}: account over`);
  };
  if (arg) { if (!days[arg]) throw new Error(`no data for ${arg}`); judge(arg, days[arg]); }
  else {
    if (!days[from]) throw new Error(`no data for ${from}`);
    judge(from, days[from]);
    const hours = now.getUTCHours() + now.getUTCMinutes() / 60;
    if (hours >= MIN_HOURS) judge(`${day(now)} on pace`, days[day(now)], 24 / hours);
  }
  if (bad.length) { console.error(`request-budget FAIL: ${bad.join('; ')}. The main income site shares this budget.`); process.exit(1); }
  console.log('request-budget: within budget');
} catch (e) {
  console.error('request-budget: could not read counts, treated as over:', e.message);
  process.exit(1);
}
