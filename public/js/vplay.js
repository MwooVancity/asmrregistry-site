// Video cards on hub and best-of pages: a click swaps the thumbnail for the YouTube player, on this page.
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.vplay[data-v]');
  if (!b) return;
  const id = b.dataset.v;
  if (!/^[\w-]{11}$/.test(id)) return;
  const f = document.createElement('div');
  f.className = 'vplay-frame';
  f.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1" title="' + (b.getAttribute('aria-label') || 'Video').replace(/"/g, '&quot;') + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
  const thumb = b.querySelector('.video-thumb');
  if (!thumb) { b.replaceWith(f); return; }
  thumb.replaceWith(f);
  // A player cannot sit inside a button: move the contents into a div that keeps the card's layout classes.
  const w = document.createElement('div');
  // Copy the button's attributes (class and Astro's scoped-style data-astro-cid-*) so the card keeps its styling.
  for (const a of b.attributes) if (!['type', 'aria-label', 'data-v'].includes(a.name)) w.setAttribute(a.name, a.value);
  w.className = b.className.replace(/\bvplay\b/, '').trim();
  w.append(...b.childNodes);
  b.replaceWith(w);
});
