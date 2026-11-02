import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RoundArrow } from './PublicLayout';
import { PRIMARY_DISCIPLINES, type PrimaryDisciplineId } from '../../../shared/lib/disciplines';
import { LoadingImage } from '../../../shared/ui/LoadingImage';
import './sport-stack.css';

const content: Record<PrimaryDisciplineId, { image: string; summary: string; programs: string[] }> = {
  gym: {
    image: '/images/fitness/gym-floor.jpg',
    summary: 'Xây dựng sức mạnh và thể lực với các bài tập tạ.',
    programs: ['Kỹ thuật tập tạ', 'Sức mạnh toàn thân', 'Thể lực và sức bền'],
  },
  yoga: {
    image: '/images/yoga-aerial-silk-studio.jpg',
    summary: 'Kết hợp hơi thở, tư thế và chuyển động linh hoạt.',
    programs: ['Hơi thở và tư thế', 'Thăng bằng và linh hoạt', 'Giãn cơ và thư giãn'],
  },
  pilates: {
    image: '/images/pilates-reformer-studio.jpg',
    summary: 'Rèn khả năng kiểm soát chuyển động và sức mạnh vùng core.',
    programs: ['Kiểm soát vùng core', 'Tư thế và thăng bằng', 'Chuyển động trên Reformer'],
  },
  boxing: {
    image: '/images/hero-options/opt5-boxing.jpg',
    summary: 'Tập kỹ thuật đấm, phản xạ và thể lực qua từng hiệp.',
    programs: ['Kỹ thuật đấm cơ bản', 'Bộ chân và phản xạ', 'Thể lực theo hiệp'],
  },
};
const sports = PRIMARY_DISCIPLINES.map(sport => ({ ...sport, ...content[sport.id] }));
// The existing import remains stable; this section now uses a scrolling story rather than a deck.
export function SportStack({ classPath, heading }: { classPath: string; heading?: ReactNode }) {
  const story = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = story.current!;
    const steps = [...section.querySelectorAll<HTMLElement>('.fit-sport-story-step')];
    const visuals = [...section.querySelectorAll<HTMLElement>('.fit-sport-story-visual')];
    const dots = [...section.querySelectorAll<HTMLElement>('.fit-sport-story-dots i')];
    const marker = section.querySelector<HTMLElement>('.fit-sport-story-rail i')!;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const header = section.closest('.fit-site')?.querySelector<HTMLElement>('.fit-header');
    let active = 0;
    let displayed = 0;
    let timer = 0;
    const show = (index: number) => {
      window.clearTimeout(timer);
      timer = 0;
      visuals.forEach((visual, i) => {
        visual.classList.toggle('is-active', i === index);
        visual.classList.remove('is-leaving');
      });
      displayed = index;
    };
    const select = (index: number) => {
      active = index;
      steps.forEach((step, i) => step.classList.toggle('is-active', i === index));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
      marker.style.top = `${index / (sports.length - 1) * 100}%`;
      if (preference.matches || index === displayed) {
        show(index);
        return;
      }
      // Match the reference's exit-before-enter transition; rapid scroll always selects the latest step.
      visuals[displayed].classList.add('is-leaving');
      if (!timer) timer = window.setTimeout(() => show(active), 500);
    };
    let observer: IntersectionObserver | null = null;
    const focus = (event: FocusEvent) => {
      const index = steps.findIndex(step => step.contains(event.target as Node));
      if (index >= 0) select(index);
    };
    const measure = () => {
      const top = header ? Math.ceil(header.getBoundingClientRect().height) + 12 : 90;
      section.style.setProperty('--sport-story-top', `${top}px`);
      observer?.disconnect();
      if (typeof IntersectionObserver !== 'undefined') {
        // Vertical percentage root margins resolve against width; use pixels for a true middle 10% band.
        const inset = Math.round(window.innerHeight * .45);
        observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) select(steps.indexOf(entry.target as HTMLElement));
          });
        }, { rootMargin: `-${inset}px 0px -${inset}px 0px`, threshold: 0 });
        steps.forEach(step => observer!.observe(step));
        section.classList.add('is-enhanced');
      }
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (header) resize?.observe(header);
    const motion = () => show(active);
    section.addEventListener('focusin', focus);
    preference.addEventListener('change', motion);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      resize?.disconnect();
      section.removeEventListener('focusin', focus);
      preference.removeEventListener('change', motion);
      window.removeEventListener('resize', measure);
      section.classList.remove('is-enhanced');
    };
  }, []);

  const illustration = (sport: typeof sports[number]) => <>
    <LoadingImage src={sport.image} alt={`Ảnh minh họa không gian ${sport.name.toLowerCase()}`} loading="lazy" decoding="async" />
    <figcaption>Ảnh minh họa · {sport.name}</figcaption>
  </>;

  return <div className="fit-sport-story" ref={story} role="region" aria-label="Khám phá bốn bộ môn">
    {heading}
    <p className="fit-sport-story-hint">Cuộn xem các bộ môn <span aria-hidden="true">↓</span></p>
    <div className="fit-sport-story-layout">
      <div className="fit-sport-story-steps">
        <div className="fit-sport-story-rail" aria-hidden="true"><i style={{ top: '0%' }} /></div>
        {sports.map((sport, index) => <article key={sport.id}
          className={`fit-sport-story-step${index === 0 ? ' is-active' : ''}`}
          data-sport={sport.id} aria-labelledby={`sport-story-${sport.id}`}>
          <span className="fit-sport-story-number" aria-hidden="true">0{index + 1}</span>
          <h3 id={`sport-story-${sport.id}`}>{sport.name}</h3>
          <p className="fit-sport-story-summary">{sport.summary}</p>
          <ul className="fit-sport-story-programs">{sport.programs.map(program => <li key={program}>{program}</li>)}</ul>
          <div className="fit-sport-story-footer">
            <Link className="fit-pill" to={classPath}>Xem lịch học<RoundArrow diagonal /></Link>
          </div>
          <figure className="fit-sport-story-inline" data-reveal="image">{illustration(sport)}</figure>
        </article>)}
      </div>
      <div className="fit-sport-story-sticky" aria-hidden="true">
        <div className="fit-sport-story-panel">
          {sports.map((sport, index) => <figure key={sport.id} data-sport={sport.id}
            className={`fit-sport-story-visual${index === 0 ? ' is-active' : ''}`}>
            {illustration(sport)}
          </figure>)}
          <div className="fit-sport-story-dots">{sports.map((sport, index) =>
            <i key={sport.id} className={index === 0 ? 'is-active' : ''} />)}</div>
        </div>
      </div>
    </div>
  </div>;
}
