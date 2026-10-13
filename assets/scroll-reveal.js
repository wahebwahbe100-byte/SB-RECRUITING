/* Refined, restrained section entrance animations inspired by premium business websites. */
(() => {
  'use strict';
  const doc = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches || !('IntersectionObserver' in window)) return;

  // Avoid animating the hero carousel, navigation, or entire main containers.
  const rules = [
    ['main .section-intro', 'reveal-up'],
    ['main .guide-heading', 'reveal-up'],
    ['main .pathway-card', 'reveal-up'],
    ['main .requirement-panel', 'reveal-up'],
    ['main .guide-law-aside', 'reveal-left'],
    ['main .guide-accordion details', 'reveal-up'],
    ['main .docs-intro', 'reveal-left'],
    ['main .application-list li', 'reveal-up'],

    ['main .audience', 'reveal-up'],
    ['main .process .step', 'reveal-up'],
    ['main .philosophy-grid > .bridge-visual', 'reveal-left'],
    ['main .philosophy-grid > .philosophy-copy', 'reveal-right'],
    ['main .highlight-media', 'reveal-left'],
    ['main .highlight-contact', 'reveal-right'],
    ['main .inner-grid > *', 'reveal-up'],
    ['main .split > *', 'reveal-up'],
    ['main .sector', 'reveal-up'],
    ['main .value', 'reveal-up'],
    ['main .statement', 'reveal-up'],
    ['main .faq-layout > *', 'reveal-up'],
    ['main .faq-list details', 'reveal-up'],
    ['main .contact-grid > *', 'reveal-up'],
    ['main .contact-intro > *', 'reveal-up'],
    ['main .contact-info', 'reveal-up'],
    ['main .legal-content', 'reveal-up'],
    ['main .path-choice', 'reveal-up'],
    ['.site-footer .footer-col', 'reveal-up'],
    ['.site-footer .footer-bottom-bar', 'reveal-up']
  ];

  const candidates = new Map();
  for (const [selector, direction] of rules) {
    document.querySelectorAll(selector).forEach(el => {
      if (!candidates.has(el)) candidates.set(el, direction);
    });
  }
  // Animate a container OR its descendants, never both (prevents double fades).
  const selected = [...candidates].filter(([el]) =>
    ![...candidates.keys()].some(parent => parent !== el && parent.contains(el))
  );
  if (!selected.length) return;

  let observer;
  const reveal = el => el.classList.add('is-revealed');
  observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      reveal(entry.target);
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.06, rootMargin: '0px 0px -6% 0px' });

  const viewportHeight = window.innerHeight;
  selected.forEach(([el, direction]) => {
    el.classList.add('scroll-reveal', direction);
    const siblingGroup = [...el.parentElement.children].filter(node => candidates.has(node));
    const slot = Math.max(0, siblingGroup.indexOf(el));
    const process = Boolean(el.closest('.process'));
    // Richer staggered entrances without holding content for too long.
    const delay = process ? Math.min(slot, 3) * 190 : Math.min(slot, 4) * 125;
    el.style.setProperty('--reveal-delay', `${delay}ms`);

    const bounds = el.getBoundingClientRect();
    // Keep items already in view fully visible at initial paint or on deep links.
    if (bounds.top < viewportHeight * 0.9 && bounds.bottom > 0) {
      reveal(el);
    } else {
      observer.observe(el);
    }
  });
  doc.classList.add('scroll-reveal-ready');

  const revealAll = () => {
    observer.disconnect();
    doc.classList.remove('scroll-reveal-ready');
    selected.forEach(([el]) => reveal(el));
  };
  reduceMotion.addEventListener('change', e => { if (e.matches) revealAll(); });
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    selected.forEach(([el]) => {
      const box = el.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) reveal(el);
    });
  });
})();
