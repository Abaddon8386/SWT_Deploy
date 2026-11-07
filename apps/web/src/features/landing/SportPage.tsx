import { useSourceLanguage, sourceText } from "../shop/shopI18n";
import { LoadingImage } from '../../shared/ui/LoadingImage';
import { usePublicCatalog } from './publicCatalog';
import { CatalogSchedule, CatalogStatus } from './components/CatalogSections';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getCurrentUser, homePath } from '../../shared/api/client';
import { PublicLayout, RoundArrow } from './components/PublicLayout';
import { DISCIPLINES } from '../../shared/lib/disciplines';
import { SPORT_PAGES, SPORT_PAGE_LIST, sportIdFromPath, type SportPageId } from './sportPages';

export function SportPage({ forcedSport }: { forcedSport?: SportPageId }) {
  useSourceLanguage();
  const { sportId } = useParams<{ sportId?: string }>();
  const { pathname } = useLocation();
  const key: SportPageId = forcedSport ?? sportIdFromPath(sportId ? `/sports/${sportId}` : pathname) ?? 'swimming';
  const sport = SPORT_PAGES[key];
  const { catalog, error, retry } = usePublicCatalog();
  const user = getCurrentUser();
  const joinPath = user ? (user.role === 'MEMBER' ? '/member/packages' : homePath(user.role)) : '/register';
  const sportName = DISCIPLINES.find((item) => item.id === sport.id)!.name;
  const classesPath = user ? (user.role === 'MEMBER' ? `/member/classes?discipline=${encodeURIComponent(sportName)}` : homePath(user.role)) : '/login';
  const hasCourts = ['tennis', 'badminton', 'swimming'].includes(sport.id);
  const bookPath = user?.role === 'MEMBER' && hasCourts ? `/member/courts?discipline=${encodeURIComponent(sportName)}` : classesPath;

  return (
    <PublicLayout>
      <main id="public-main" className="fit-trainer-story-page fit-sport-page">
        <section className="fit-section fit-trainer-story-hero" aria-labelledby="sport-page-title">
          <div className="fit-trainer-story-topbar" data-reveal="soft">
            <Link to="/#multisport" className="fit-text-link fit-back-link">
              {sourceText("← Quay lại Trang chủ")}</Link>
            <div className="fit-trainer-switcher" role="navigation" aria-label={sourceText("Chọn bộ môn")}>
              {SPORT_PAGE_LIST.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`fit-trainer-switch-pill ${sport.id === item.id ? 'is-active' : ''}`}
                  aria-current={sport.id === item.id ? 'page' : undefined}
                >
                  <span>{item.label}</span>
                  <small>{item.club}</small>
                </Link>
              ))}
            </div>
          </div>

          <div key={sport.id} className="fit-trainer-hero-grid fit-blur-morph">
            <div className="fit-trainer-portrait-card" data-reveal="image">
              <LoadingImage src={sport.image} alt={sport.title} />
              <div className="fit-trainer-portrait-badge">
                <span className="fit-kicker">{sport.kicker}</span>
                <strong>{sport.title}</strong>
                <span>{sport.subtitle}</span>
              </div>
            </div>

            <div className="fit-trainer-hero-copy" data-reveal="soft">
              <span className="fit-kicker">{sport.kicker}</span>
              <h1 id="sport-page-title">
                {sport.title}
                <span className="fit-title-dot">.</span>
                <small>{sport.subtitle}</small>
              </h1>

              <div className="fit-sport-page-programs">
                <span className="fit-kicker">{sourceText("CHƯƠNG TRÌNH TẬP LUYỆN")}</span>
                <div className="fit-sport-page-program-grid">
                  {sport.programs.map((prog) => (
                    <article key={prog.code} className="fit-sport-page-program-card">
                      <span className="fit-sport-pillar-code">{prog.code}</span>
                      <h2>{prog.title}</h2>
                      <span className="fit-sport-page-tag">{prog.tag}</span>
                    </article>
                  ))}
                </div>
              </div>

              {catalog ? <CatalogSchedule catalog={catalog} sport={sport.id} joinPath={classesPath} /> : <CatalogStatus loading={!error} retry={retry} />}

              <div className="fit-trainer-hero-actions">
                <Link to={bookPath} className="fit-pill">
                  {sourceText("Đặt lịch ")}{sportName}
                  <RoundArrow diagonal />
                </Link>
                <Link to={joinPath} className="fit-text-link">
                  {sourceText("Xem gói tập ")}<RoundArrow diagonal />
                </Link>
                {hasCourts && <Link to={classesPath} className="fit-text-link">{sourceText("Xem lịch lớp ")}<RoundArrow diagonal /></Link>}
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}

