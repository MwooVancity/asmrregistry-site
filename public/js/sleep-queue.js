// Home page "play a queue" (2026-11-22). Data is inlined in <script id="sq-data"> at build time: no fetch, no new URL.
// Hidden unless the data is under 30 days old (YouTube API rule: stored data must be refreshed or removed).
// Nothing plays until a reader taps a button (no autoplay on landing).
(() => {
  const box = document.getElementById('sleepq');
  const raw = document.getElementById('sq-data');
  if (!box || !raw) return;
  let d;
  try { d = JSON.parse(raw.textContent); } catch { return; }
  const age = Date.now() - Date.parse(d.built);
  if (!(age <= 30 * 864e5)) return; // stale or missing date: stay hidden
  const note = document.getElementById('sq-note');
  const out = document.getElementById('sq-player');
  const btns = [...box.querySelectorAll('button[data-q]')].filter((b) => d.queues && d.queues[b.dataset.q]);
  if (!btns.length) return;
  btns.forEach((b) => b.addEventListener('click', () => {
    const q = d.queues[b.dataset.q];
    const ids = (q.ids || []).filter((id) => /^[\w-]{11}$/.test(id));
    if (!ids.length) return;
    btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    out.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${ids[0]}?autoplay=1&playlist=${ids.slice(1, 50).join(',')}" title="${q.label}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    if (note) note.textContent = `${ids.length} played back to back, from ${q.n.toLocaleString('en-US')} videos in ${q.creators.toLocaleString('en-US')} creators' catalogs whose titles match. Tags come from titles, not listening. Turn off autoplay-next and set a sleep timer on your device.`;
  }));
  box.hidden = false;
})();
