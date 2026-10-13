(() => {
  'use strict';
  const root = document.querySelector('[data-hero-carousel]');
  if (!root) return;
  const slides = [...root.querySelectorAll('.hero-slide')];
  const dots = [...root.querySelectorAll('.hero-dot')];
  const pauseButton = root.querySelector('.hero-pause');
  const count = root.querySelector('[data-hero-count]');
  const status = root.querySelector('[data-hero-status]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fr = document.documentElement.lang === 'fr';
  const interval = Number(root.dataset.interval) || 3000;
  let current = 0;
  let timer = null;
  let paused = reducedMotion.matches;
  let ready = false;
  let readingLink = false;
  let touchStart = null;

  function schedule() {
    window.clearTimeout(timer);
    timer = null;
    if (ready && !paused && !document.hidden && !readingLink) {
      timer = window.setTimeout(() => { show(current + 1); schedule(); }, interval);
    }
  }

  function show(index, announce = false) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === current;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
      slide.inert = !active;
      dots[i].classList.toggle('is-active', active);
      dots[i].setAttribute('aria-current', String(active));
    });
    count.textContent = String(current + 1).padStart(2, '0');
    if (announce) status.textContent = `${fr ? 'Diapositive' : 'Folie'} ${current + 1} ${fr ? 'sur' : 'von'} ${slides.length}`;
  }

  function move(index) { show(index, true); schedule(); }
  function updatePause() {
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.setAttribute('aria-label', paused
      ? (fr ? 'Reprendre le défilement automatique' : 'Automatischen Wechsel starten')
      : (fr ? 'Mettre le défilement en pause' : 'Automatischen Wechsel pausieren'));
    pauseButton.querySelector('path').setAttribute('d', paused ? 'M8 4l12 8-12 8Z' : 'M9 5v14M15 5v14');
    root.classList.toggle('is-paused', paused);
  }

  dots.forEach((dot, i) => dot.addEventListener('click', () => move(i)));
  root.querySelector('.hero-previous').addEventListener('click', () => move(current - 1));
  root.querySelector('.hero-next').addEventListener('click', () => move(current + 1));
  pauseButton.addEventListener('click', () => { paused = !paused; updatePause(); schedule(); });
  root.querySelector('.hero-controls').addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    move(current + (event.key === 'ArrowRight' ? 1 : -1));
    dots[current].focus();
  });

  // Keep a focused call-to-action in place while a keyboard user reads it.
  root.addEventListener('focusin', event => {
    readingLink = !!event.target.closest('.hero-slide');
    schedule();
  });
  root.addEventListener('focusout', () => {
    queueMicrotask(() => {
      readingLink = !!document.activeElement?.closest('.hero-slide');
      schedule();
    });
  });
  document.addEventListener('visibilitychange', schedule);
  reducedMotion.addEventListener('change', event => { paused = event.matches; updatePause(); schedule(); });
  window.addEventListener('pagehide', () => window.clearTimeout(timer));
  window.addEventListener('pageshow', schedule);

  root.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || event.target.closest('a,button')) return;
    touchStart = { x: event.clientX, y: event.clientY };
  }, {passive: true});
  root.addEventListener('pointercancel', () => { touchStart = null; });
  root.addEventListener('pointerup', event => {
    if (!touchStart) return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) move(current + (dx < 0 ? 1 : -1));
  }, {passive: true});

  show(0);
  updatePause();
  // Decode all three bundled pictures before starting, so no slide appears empty.
  Promise.all([...root.querySelectorAll('img')].map(img => {
    if (typeof img.decode === 'function') return img.decode().catch(() => {});
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => { img.addEventListener('load', resolve, {once:true}); img.addEventListener('error', resolve, {once:true}); });
  })).then(() => { ready = true; schedule(); });
})();
