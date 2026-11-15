#!/usr/bin/env node
// Shareable, linkable assets built as static files (free to serve, no Worker requests):
//   public/cards/<creator>.svg  stat card a creator can post or embed
//   public/badges/featured.svg  "Featured on ASMR Registry" badge
//   public/charts/*.svg          catalog charts for the statistics guide and data posts
//   public/data/asmr-trigger-stats.csv  our own per-trigger summary (no YouTube titles, IDs or view counts)
// Runs in prebuild after the hub and creator snapshots. Generated files are git-ignored.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const creators = read('src/lib/creators-data.json');
const hub = read('src/lib/hub-data-all.json');
const date = hub.catalogDate;
const month = new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const label = (t) => t.replace(/-/g, ' ');
const FONT = "font-family=\"system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans','Noto Sans CJK KR','Noto Sans JP',sans-serif\"";
for (const d of ['cards', 'badges', 'charts', 'data']) mkdirSync(join(root, 'public', d), { recursive: true });

// Creator stat cards (600x315, the common share-image shape).
let cards = 0;
for (const [slug, c] of Object.entries(creators)) {
  const styles = c.triggers.slice(0, 3).map(([t]) => label(t)).join(' · ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="315" viewBox="0 0 600 315" ${FONT}>
<rect width="600" height="315" rx="18" fill="#0f0f17"/><rect x="36" y="28" width="56" height="5" rx="2.5" fill="#8b7cf6"/>
<text x="36" y="62" fill="#a99cf8" font-size="15" font-weight="600" letter-spacing="1.5">ASMR REGISTRY · CREATOR PROFILE</text>
<text x="36" y="112" fill="#f4f4f8" font-size="38" font-weight="700">${esc(cut(c.name, 26))}</text>
<text x="36" y="150" fill="#c9c9d6" font-size="18">${esc(cut(styles, 52))}</text>
<g fill="#f4f4f8"><text x="36" y="222" font-size="40" font-weight="700">${c.count.toLocaleString('en-US')}</text><text x="236" y="222" font-size="40" font-weight="700">${c.medianMin} min</text>${c.firstYear ? `<text x="436" y="222" font-size="40" font-weight="700">${c.firstYear}</text>` : ''}</g>
<g fill="#8f8fa3" font-size="15"><text x="36" y="248">videos in our catalog</text><text x="236" y="248">typical length</text>${c.firstYear ? `<text x="436" y="248">first upload listed</text>` : ''}</g>
<text x="36" y="290" fill="#6f6f85" font-size="13">asmrregistry.com/creators/${esc(slug)}/ · ${esc(month)} · tags from titles</text>
</svg>`;
  writeFileSync(join(root, 'public/cards', `${slug}.svg`), svg); cards++;
}

writeFileSync(join(root, 'public/badges/featured.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="44" viewBox="0 0 220 44" ${FONT}>
<rect width="220" height="44" rx="10" fill="#0f0f17"/><rect x="10" y="10" width="24" height="24" rx="6" fill="#8b7cf6"/><text x="22" y="27" text-anchor="middle" fill="#fff" font-size="14" font-weight="700">~</text>
<text x="44" y="20" fill="#a99cf8" font-size="10" font-weight="600" letter-spacing="1">FEATURED ON</text><text x="44" y="35" fill="#f4f4f8" font-size="15" font-weight="700">ASMR Registry</text></svg>`);

// Horizontal bar chart from [label, value] rows.
const bars = (title, sub, rows, unit, src = 'asmrregistry.com/guides/asmr-statistics/') => {
  const max = Math.max(...rows.map((r) => r[1])), h = 70 + rows.length * 26 + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${h}" viewBox="0 0 720 ${h}" ${FONT}>
<rect width="720" height="${h}" fill="#ffffff"/><text x="24" y="36" font-size="20" font-weight="700" fill="#14141c">${esc(title)}</text><text x="24" y="58" font-size="13" fill="#5c5c70">${esc(sub)}</text>
${rows.map(([l, v], i) => { const y = 78 + i * 26, w = Math.max(2, Math.round((v / max) * 440)); return `<text x="190" y="${y + 14}" text-anchor="end" font-size="13" fill="#2a2a38">${esc(l)}</text><rect x="200" y="${y}" width="${w}" height="18" rx="3" fill="#8b7cf6"/><text x="${206 + w}" y="${y + 14}" font-size="12" fill="#2a2a38">${v.toLocaleString('en-US')}${unit}</text>`; }).join('\n')}
<text x="24" y="${h - 14}" font-size="12" fill="#5c5c70">Source: ASMR Registry catalog, ${esc(month)} (${src}). Tags from titles, not listening.</text></svg>`;
};
const stats = hub.catalogStats;
writeFileSync(join(root, 'public/charts/asmr-videos-by-trigger.svg'), bars('ASMR videos by main trigger', `Top 15 of ${stats.length} triggers with 30+ videos`, stats.slice(0, 15).map((s) => [label(s.trigger), s.count]), ''));
writeFileSync(join(root, 'public/charts/asmr-length-by-trigger.svg'), bars('How long ASMR videos run, by trigger', 'Median length in minutes, triggers with 30+ videos', [...stats].sort((a, b) => b.medianMin - a.medianMin).slice(0, 15).map((s) => [label(s.trigger), s.medianMin]), ' min'));
// Trend charts for /guides/asmr-trends/: completed upload years only (the current year is partial).
const TSRC = 'asmrregistry.com/guides/asmr-trends/';
const yrs = (hub.trends || []).filter((t) => t.year < date.slice(0, 4));
if (yrs.length >= 3) {
  writeFileSync(join(root, 'public/charts/asmr-median-length-by-year.svg'), bars('How long ASMR videos run, by upload year', 'Median length in minutes of catalog videos uploaded each year', yrs.map((t) => [`${t.year} (${t.count.toLocaleString('en-US')} videos)`, t.medianMin]), ' min', TSRC));
  writeFileSync(join(root, 'public/charts/asmr-eating-sounds-share-by-year.svg'), bars('Eating-sound ASMR, share of uploads by year', 'Percent of catalog videos each year whose main trigger is eating sounds', yrs.map((t) => [`${t.year} (${t.count.toLocaleString('en-US')} videos)`, t.triggers['eating-sounds']]), '%', TSRC));
}

// Paper charts (2026-11-13, links plan item 5): embeddable images with the source page inside the image.
if ((hub.titleClaims?.byTrigger || []).length >= 5) writeFileSync(join(root, 'public/charts/asmr-title-promises-by-trigger.svg'), bars('ASMR titles that promise a result, by trigger', 'Share of titles promising a cure, "instant" sleep, a guarantee or a frequency', hub.titleClaims.byTrigger.slice(0, 15).map((r) => [label(r.trigger), r.promisePct]), '%', 'asmrregistry.com/guides/is-asmr-good-for-you/'));
if ((hub.lengthChange?.rows || []).length >= 5) writeFileSync(join(root, 'public/charts/asmr-length-change-by-trigger.svg'), bars(`Typical ASMR video length, ${hub.lengthChange.late[0]}-${hub.lengthChange.late[1]}`, `Median minutes by trigger (it was the first number in brackets in ${hub.lengthChange.early[0]}-${hub.lengthChange.early[1]})`, hub.lengthChange.rows.slice(0, 15).map((r) => [`${label(r.trigger)} (${r.earlyMed})`, r.lateMed]), ' min', TSRC));

const csv = ['trigger,videos,median_minutes,share_over_30_min_pct,share_labelled_no_talking_pct', ...stats.map((s) => [s.trigger, s.count, s.medianMin, s.over30, s.noTalking].join(','))].join('\n');
writeFileSync(join(root, 'public/data/asmr-trigger-stats.csv'), `# ASMR Registry catalog summary, ${date}. Free to use with credit: "ASMR Registry (asmrregistry.com)". Our own classification from titles, not YouTube data.\n${csv}\n`);
// Year-by-year table for /guides/asmr-trends/ (counts and shares only).
const tcols = ['eating-sounds', 'whispering', 'tapping']
const tcsv = ['upload_year,videos,median_minutes,over_1_hour_pct,labelled_no_talking_pct,korean_pct,' + tcols.map(t => t.replace(/-/g, '_') + '_pct').join(','),
  ...(hub.trends || []).map(t => [t.year, t.count, t.medianMin, t.over60, t.noTalking, t.korean, ...tcols.map(c => t.triggers[c])].join(','))].join('\n')
writeFileSync(join(root, 'public/data/asmr-trends-by-year.csv'), `# ASMR Registry catalog by upload year, ${date}. Free to use with credit: "ASMR Registry (asmrregistry.com)". Popular videos still online, not every upload.\n${tcsv}\n`)
console.log(`prebuild-share: ${cards} creator cards, 1 badge, 2 charts, 1 CSV (${stats.length} triggers)`);
