// Creator page tools (2026-11-15): search, length/trigger/year filters, sort, hide Shorts, play all (YouTube embed
// queue, 50 max), surprise me, watch later (this browser only). Data: <script id="cv-data" type="application/json">.
(() => {
  const root = document.getElementById('cv-tools');
  const raw = document.getElementById('cv-data');
  if (!root || !raw) return;
  const slug = root.dataset.slug;
  const all = JSON.parse(raw.textContent); // [id, title, views, seconds, date]
  const TRIG = { whispering: /whisper/i, tapping: /tap(ping)?\b/i, 'mouth sounds': /mouth sound/i, 'ear cleaning': /ear clean/i, 'ear licking': /ear lick|licking/i, kisses: /kiss/i, massage: /massage/i, 'hair play': /hair (play|brush)|scalp/i, roleplay: /role ?play|\brp\b/i, 'soft spoken': /soft[ -]?spoken/i, 'no talking': /no talking/i, eating: /eating|mukbang/i, rain: /\brain\b/i, sleep: /sleep/i };
  const $ = (s) => root.querySelector(s);
  const q = $('#cv-q'), len = $('#cv-len'), trig = $('#cv-trig'), year = $('#cv-year'), sort = $('#cv-sort'), shorts = $('#cv-shorts'), out = $('#cv-list'), count = $('#cv-count');
  const present = Object.keys(TRIG).filter((k) => all.some((v) => TRIG[k].test(v[1])));
  trig.innerHTML = '<option value="">Any trigger</option>' + present.map((k) => `<option>${k}</option>`).join('');
  const years = [...new Set(all.map((v) => v[4].slice(0, 4)))].sort().reverse();
  year.innerHTML = '<option value="">Any year</option>' + years.map((y) => `<option>${y}</option>`).join('');
  const fmtLen = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 60 ? `${Math.round(s / 60)} min` : `${s} sec`);
  const big = (x) => (x == null ? '' : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M views` : x >= 1e3 ? `${Math.round(x / 1e3)}K views` : `${x} views`);
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = { get() { try { return JSON.parse(localStorage.getItem('wl') || '[]'); } catch { return null; } }, set(v) { try { localStorage.setItem('wl', JSON.stringify(v)); } catch {} } };
  let shown = [];
  function filtered() {
    const term = q.value.trim().toLowerCase(), L = len.value, T = trig.value, Y = year.value;
    let r = all.filter((v) => (!term || v[1].toLowerCase().includes(term)) && (!T || TRIG[T].test(v[1])) && (!Y || v[4].startsWith(Y)) && (shorts.checked || v[3] > 180) &&
      (!L || (L === 'u10' ? v[3] < 600 : L === '10-30' ? v[3] >= 600 && v[3] < 1800 : L === '30-60' ? v[3] >= 1800 && v[3] < 3600 : v[3] >= 3600)));
    const S = sort.value;
    r = [...r].sort((a, b) => S === 'new' ? b[4].localeCompare(a[4]) : S === 'old' ? a[4].localeCompare(b[4]) : S === 'long' ? b[3] - a[3] : S === 'short' ? a[3] - b[3] : (b[2] ?? -1) - (a[2] ?? -1));
    return r;
  }
  function render() {
    shown = filtered();
    const wl = store.get() || [];
    count.textContent = `${shown.length.toLocaleString('en-US')} videos`;
    out.innerHTML = shown.slice(0, 300).map((v) => `<li><a href="/creators/${slug}/v/${v[0]}/">${esc(v[1])}</a> <span class="vm">${fmtLen(v[3])}${v[2] != null ? ' · ' + big(v[2]) : ''} · ${v[4].slice(0, 4)}</span> <button type="button" class="cv-wl" data-id="${v[0]}" aria-pressed="${wl.includes(v[0])}">${wl.includes(v[0]) ? 'Saved' : 'Watch later'}</button></li>`).join('') +
      (shown.length > 300 ? `<li class="vm">Showing 300 of ${shown.length.toLocaleString('en-US')}. Narrow the filters to see the rest.</li>` : '');
  }
  function play(ids) {
    if (!ids.length) return;
    const box = $('#cv-player');
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ids[0]}?autoplay=1&playlist=${ids.slice(1, 50).join(',')}" title="Play queue" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  [q, len, trig, year, sort, shorts].forEach((e) => e.addEventListener(e === q ? 'input' : 'change', render));
  $('#cv-play').addEventListener('click', () => play(shown.map((v) => v[0])));
  $('#cv-random').addEventListener('click', () => { if (shown.length) play([shown[Math.floor(Math.random() * shown.length)][0]]); });
  $('#cv-saved').addEventListener('click', () => { const wl = store.get() || []; play(all.filter((v) => wl.includes(v[0])).map((v) => v[0])); });
  out.addEventListener('click', (e) => {
    const b = e.target.closest('.cv-wl'); if (!b) return;
    const wl = store.get(); if (!wl) { b.textContent = 'Not available'; return; }
    const id = b.dataset.id, i = wl.indexOf(id);
    if (i >= 0) wl.splice(i, 1); else wl.push(id);
    store.set(wl.slice(-200)); render();
  });
  if (store.get() === null) $('#cv-saved').hidden = true;
  root.hidden = false;
  render();
})();
