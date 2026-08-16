const year = document.querySelector('[data-year]');

if (year) {
  year.textContent = new Date().getFullYear();
}

const sectionLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
const sectionTargets = sectionLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

if (sectionTargets.length) {
  const setCurrentLink = (sectionId) => {
    sectionLinks.forEach((link) => {
      if (link.getAttribute('href') === `#${sectionId}`) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  };

  // Must stay in step with html { scroll-padding-top } so a section is marked
  // current the moment it lands, not 11px later.
  const ANCHOR_GAP = 20;

  const updateCurrentSection = () => {
    const navHeight = document.querySelector('.site-nav')?.offsetHeight ?? 0;
    const marker = window.scrollY + navHeight + ANCHOR_GAP + 4;
    const positionedTargets = sectionTargets
      .map((section) => ({
        section,
        top: section.getBoundingClientRect().top + window.scrollY,
      }))
      .sort((a, b) => a.top - b.top);
    let current = positionedTargets[0].section;

    positionedTargets.forEach(({ section, top }) => {
      if (top <= marker) {
        current = section;
      }
    });

    const atPageEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atPageEnd) {
      current = positionedTargets[positionedTargets.length - 1].section;
    }

    setCurrentLink(current.id);
  };

  let updateQueued = false;
  const queueSectionUpdate = () => {
    if (updateQueued) return;
    updateQueued = true;
    window.requestAnimationFrame(() => {
      updateCurrentSection();
      updateQueued = false;
    });
  };

  updateCurrentSection();
  window.addEventListener('scroll', queueSectionUpdate, { passive: true });
  window.addEventListener('resize', queueSectionUpdate);
}

/* ---------------------------------------------------------------------------
   Motion
   The CSS holds every element's start and end state; this only decides when
   an element has arrived. Under prefers-reduced-motion nothing is observed at
   all — the stylesheet already resolves each element to its finished state.
   --------------------------------------------------------------------------- */
(() => {
  const root = document.documentElement;
  if (!root.classList.contains('js')) return;

  const stillPreferred = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Sticky nav gains elevation only once content is passing beneath it.
  const nav = document.querySelector('.site-nav');
  if (nav) {
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
    document.body.prepend(sentinel);
    new IntersectionObserver(
      ([entry]) => nav.classList.toggle('is-stuck', !entry.isIntersecting),
      { rootMargin: '0px' },
    ).observe(sentinel);
  }

  if (stillPreferred.matches) return;

  const targets = [
    ...document.querySelectorAll(
      '[data-reveal], [data-reveal-group], .section-body, .timeline, .section-heading, .sidebar-heading, .gallery-grid figure, .campaign-card',
    ),
  ];
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const reveal = (el) => {
    el.classList.add('is-visible');
    observer.unobserve(el);
  };

  // threshold 0 with no negative rootMargin: an element reveals the instant any
  // part of it touches the viewport. A shrunken root would leave a band at the
  // bottom of the screen where an element is on screen but not yet triggered.
  const observer = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && reveal(e.target)),
    { rootMargin: '0px', threshold: 0 },
  );

  targets.forEach((el) => observer.observe(el));

  // Anything already on screen at load reveals without waiting for a scroll
  // that may never come.
  const revealVisible = () => {
    targets.forEach((el) => {
      if (el.classList.contains('is-visible')) return;
      const box = el.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) reveal(el);
    });
  };
  requestAnimationFrame(revealVisible);
  window.addEventListener('load', revealVisible);

  // Belt and braces. If the observer is ever stalled or unsupported in some
  // way we did not anticipate, scrolling still reveals whatever it reaches, so
  // no content can end up permanently invisible.
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      revealVisible();
      queued = false;
      if (!targets.some((el) => !el.classList.contains('is-visible'))) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
})();
