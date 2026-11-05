import { useLayoutEffect, type RefObject } from 'react';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Replay entrances on viewport re-entry and drive scroll-linked UI progress; document scrolling stays native. */
export function useComponentReveal(container: RefObject<HTMLDivElement | null>, route: string) {
  useLayoutEffect(() => {
    const root = container.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const targets = new Set<HTMLElement>();
    const heroSelector = '.fit-hero-title, .fit-hero-copy, .fit-hero-athlete, .fit-hero-anatomy-stage, .fit-hero-action';
    const selector = `[data-reveal], ${heroSelector}`;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer: IntersectionObserver | undefined;
    let sectionObserver: IntersectionObserver | undefined;
    let previousScrollY = window.scrollY;
    let direction: 'up' | 'down' = 'down';

    const header = root.querySelector<HTMLElement>('.fit-header');
    const progressBar = root.querySelector<HTMLElement>('.fit-scroll-progress');
    const benefits = root.querySelector<HTMLElement>('.fit-benefits');
    const benefitsTrack = benefits?.querySelector<HTMLElement>('.fit-benefits-track');
    const hero = root.querySelector<HTMLElement>('.fit-hero');
    const finalCta = root.querySelector<HTMLElement>('.fit-final-cta');
    const manifestos = [...root.querySelectorAll<HTMLElement>('[data-scroll-scrub="manifesto"]')]
      .map(element => ({ element, words: [...element.querySelectorAll<HTMLElement>('.fit-manifesto-word > span')] }));
    let scrollFrame = 0;
    const setProperty = (element: HTMLElement | null | undefined, name: string, value: string) => {
      if (element && element.style.getPropertyValue(name) !== value) element.style.setProperty(name, value);
    };
    const syncScrollEffects = () => {
      // Read geometry first. Writing inherited styles between reads forces repeated layouts.
      const currentScrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - viewportHeight);
      const progress = preference.matches ? 0 : clamp(currentScrollY / maxScroll, 0, 1);
      const benefitRect = benefits?.getBoundingClientRect();
      const benefitHeight = benefits?.offsetHeight ?? 0;
      const maxShift = benefits && benefitsTrack && window.innerWidth > 1100
        ? Math.max(0, benefitsTrack.scrollWidth - benefits.clientWidth) : 0;
      const heroHeight = hero?.offsetHeight ?? 1;
      const manifestoRects = preference.matches ? [] : manifestos.map(({ element }) => element.getBoundingClientRect());
      const ctaRect = !preference.matches ? finalCta?.getBoundingClientRect() : undefined;

      // The progress bar consumes this value directly; changing a variable on root invalidates the whole page.
      setProperty(progressBar, 'transform', `scaleX(${progress.toFixed(4)})`);
      header?.classList.toggle('is-scrolled', currentScrollY > 36);
      if (benefits && benefitRect) {
        const benefitProgress = benefitHeight > viewportHeight * 1.15
          ? clamp(-benefitRect.top / Math.max(1, benefitHeight - viewportHeight), 0, 1)
          : clamp((viewportHeight * .72 - benefitRect.top) / Math.max(1, viewportHeight * .8), 0, 1);
        setProperty(benefits, '--fit-benefits-progress', benefitProgress.toFixed(4));
        setProperty(benefits, '--fit-benefits-shift', `${(-benefitProgress * maxShift).toFixed(1)}px`);
      }
      if (preference.matches) return;
      setProperty(hero, '--fit-hero-scroll', clamp(currentScrollY / Math.max(1, heroHeight), 0, 1).toFixed(3));
      manifestos.forEach(({ words }, i) => {
        const scrub = clamp((viewportHeight * .88 - manifestoRects[i].top) / Math.max(1, viewportHeight * .6), 0, 1);
        words.forEach((word, index) => {
          const wordStart = (index / Math.max(1, words.length)) * .76;
          const wordProgress = clamp((scrub - wordStart) / .24, 0, 1);
          setProperty(word, 'opacity', String(Number((.18 + wordProgress * .82).toFixed(3))));
        });
      });
      if (ctaRect) {
        const ctaProgress = clamp((viewportHeight - ctaRect.top) / Math.max(1, viewportHeight * .72), 0, 1);
        setProperty(finalCta, '--fit-cta-progress', ctaProgress.toFixed(3));
      }
    };
    const scheduleScrollEffects = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; syncScrollEffects(); });
    };

    const onScroll = () => {
      const currentScrollY = window.scrollY;
      scheduleScrollEffects();
      if (currentScrollY === previousScrollY) return;
      const nextDirection = currentScrollY < previousScrollY ? 'up' : 'down';
      previousScrollY = currentScrollY;
      if (nextDirection === direction) return;
      direction = nextDirection;
      targets.forEach((element) => {
        if (!element.classList.contains('is-visible')) element.dataset.revealDirection = direction;
      });
    };

    const reveal = (element: HTMLElement) => {
      if (preference.matches) return;
      element.classList.add('is-visible');
    };
    const register = (element: HTMLElement) => {
      if (preference.matches || targets.has(element)) return;
      if (element.matches(heroSelector)) element.dataset.reveal = 'hero';
      targets.add(element);
      element.classList.add('fit-reveal-ready');
      observer?.observe(element);
    };
    const unregister = (element: HTMLElement) => {
      observer?.unobserve(element);
      targets.delete(element);
      element.classList.remove('fit-reveal-ready', 'is-visible');
      delete element.dataset.revealDirection;
    };
    const visit = (node: Node, callback: (element: HTMLElement) => void) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.matches(selector)) callback(node);
      node.querySelectorAll<HTMLElement>(selector).forEach(callback);
    };
    const configure = () => {
      observer?.disconnect();
      sectionObserver?.disconnect();
      [...targets].forEach(unregister);
      if (preference.matches) {
        setProperty(progressBar, 'transform', 'scaleX(0)');
        root.querySelector<HTMLElement>('.fit-hero')?.style.removeProperty('--fit-hero-scroll');
        root.querySelectorAll<HTMLElement>('.fit-manifesto-word > span').forEach((word) => {
          word.style.opacity = '1';
        });
        root.querySelector<HTMLElement>('.fit-final-cta')?.style.removeProperty('--fit-cta-progress');
        syncScrollEffects();
        return;
      }
      observer = new IntersectionObserver((entries) => {
        if (preference.matches) return;
        onScroll();
        entries.forEach((entry) => {
          const element = entry.target as HTMLElement;
          if (entry.isIntersecting && entry.intersectionRatio >= .12) {
            if (!element.classList.contains('is-visible')) element.dataset.revealDirection = direction;
            reveal(element);
          } else if (!entry.isIntersecting) {
            element.dataset.revealDirection = entry.boundingClientRect.top < 0 ? 'up' : 'down';
            element.classList.remove('is-visible');
          }
        });
      }, { threshold: [0, .12] });
      root.querySelectorAll<HTMLElement>(selector).forEach(register);

      if (route === '/') {
        const trackedSections = root.querySelectorAll<HTMLElement>('section[id]');
        if (trackedSections.length > 0) {
          const mapSectionToNav = (id: string): string => {
            if (id === 'about' || id === 'multisport') return 'about';
            if (id === 'trainers' || id === 'journey') return 'trainers';
            if (id === 'packages' || id === 'benefits') return 'packages';

            return '';
          };
          sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) return;
              const id = entry.target.getAttribute('id');
              if (!id) return;
              const activeTarget = mapSectionToNav(id);
              root.querySelectorAll<HTMLElement>('.fit-nav a[data-nav-target]').forEach((link) => {
                link.classList.toggle('is-active', Boolean(activeTarget) && link.dataset.navTarget === activeTarget);
              });
            });
          }, { rootMargin: '-35% 0px -50% 0px' });
          trackedSections.forEach((section) => sectionObserver?.observe(section));
        }
      }

      syncScrollEffects();
    };
    const onFocus = (event: FocusEvent) => {
      const element = (event.target as HTMLElement).closest<HTMLElement>('[data-reveal]');
      if (element && root.contains(element)) reveal(element);
    };

    configure();
    const mutations = new MutationObserver((changes) => changes.forEach((change) => {
      change.removedNodes.forEach((node) => visit(node, unregister));
      change.addedNodes.forEach((node) => visit(node, register));
    }));
    mutations.observe(root, { childList: true, subtree: true });
    preference.addEventListener('change', configure);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', scheduleScrollEffects, { passive: true });
    root.addEventListener('focusin', onFocus);
    return () => {
      observer?.disconnect();
      sectionObserver?.disconnect();
      mutations.disconnect();
      preference.removeEventListener('change', configure);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', scheduleScrollEffects);
      cancelAnimationFrame(scrollFrame);
      root.removeEventListener('focusin', onFocus);
      [...targets].forEach(unregister);
    };
  }, [container, route]);
}
