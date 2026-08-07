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

  const updateCurrentSection = () => {
    const navHeight = document.querySelector('.site-nav')?.offsetHeight ?? 0;
    const marker = window.scrollY + navHeight + 32;
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
