import { LoadingImage } from '../../shared/ui/LoadingImage';
import { usePublicCatalog } from './publicCatalog';
import { CatalogSchedule, CatalogStatus } from './components/CatalogSections';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getCurrentUser, homePath } from '../../shared/api/client';
import { PublicLayout, RoundArrow } from './components/PublicLayout';
import { SPORT_PAGES, SPORT_PAGE_LIST, sportIdFromPath, type SportPageId } from './sportPages';

export function SportPage({ forcedSport }: { forcedSport?: SportPageId }) {
  const { sportId } = useParams<{ sportId?: string }>();
  const { pathname } = useLocation();
  const key: SportPageId = forcedSport ?? sportIdFromPath(sportId ? `/sports/${sportId}` : pathname) ?? 'swimming';
  const sport = SPORT_PAGES[key];
  const { catalog, error, retry } = usePublicCatalog();
  const user = getCurrentUser();
  const joinPath = user ? (user.role === 'MEMBER' ? '/member/packages' : homePath(user.role)) : '/register';

  return (
    <PublicLayout>
      <main id="public-main" className="fit-trainer-story-page fit-sport-page">
        <section className="fit-section fit-trainer-story-hero" aria-labelledby="sport-page-title">
          <div className="fit-trainer-story-topbar" data-reveal="soft">
            <Link to="/#multisport" className="fit-text-link fit-back-link">
              ← Quay lại Trang chủ
            </Link>
            <div className="fit-trainer-switcher" role="navigation" aria-label="Chọn bộ môn">
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

              <div className="fit-trainer-stats-row">
                {sport.stats.map((st) => (
                  <div key={st.label} className="fit-trainer-stat-box">
                    <strong>{st.value}</strong>
                    <span>{st.label}</span>
                  </div>
                ))}
              </div>

              <div className="fit-sport-page-programs">
                <span className="fit-kicker">CHƯƠNG TRÌNH TẬP LUYỆN</span>
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

              {catalog ? <CatalogSchedule catalog={catalog} sport={sport.id} joinPath={user?.role === 'MEMBER' ? '/member/classes' : '/login'} /> : <CatalogStatus loading={!error} retry={retry} />}

              <div className="fit-trainer-hero-actions">
                <Link to={joinPath} className="fit-pill">
                  Xem gói tập
                  <RoundArrow diagonal />
                </Link>
                <Link to="/#trainers" className="fit-text-link">
                  Đội ngũ huấn luyện viên <RoundArrow diagonal />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}

