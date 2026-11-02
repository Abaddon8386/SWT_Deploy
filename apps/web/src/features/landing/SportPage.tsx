import { LoadingImage } from '../../shared/ui/LoadingImage';
import { usePublicCatalog } from './publicCatalog';
import { CatalogSchedule, CatalogStatus } from './components/CatalogSections';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getCurrentUser, homePath } from '../../shared/api/client';
import { PublicLayout, RoundArrow } from './components/PublicLayout';

interface SportPageData {
  id: 'swimming' | 'tennis';
  path: string;
  kicker: string;
  title: string;
  subtitle: string;
  image: string;
  stats: { value: string; label: string }[];
  programs: { code: string; title: string; tag: string }[];
}

const SPORT_PAGES: Record<'swimming' | 'tennis', SportPageData> = {
  swimming: {
    id: 'swimming',
    path: '/swimming',
    kicker: 'AQUATICS CLUB',
    title: 'Hồ Bơi Bốn Mùa',
    subtitle: 'Bơi lội · Sức bền · Thả lỏng',
    image: '/images/fitness/aquatics-pool.jpg',
    stats: [
      { value: '06 Làn', label: 'Phân luồng tốc độ' },
      { value: 'Nước Ấm', label: 'Bơi thoải mái 4 mùa' },
      { value: '06:00 — 22:00', label: 'Mở cửa mỗi ngày' },
    ],
    programs: [
      { code: '01', title: 'Làm Quen & Nhịp Thở', tag: 'Dành cho người mới' },
      { code: '02', title: 'Bơi Sải & Sức Bền', tag: 'Kỹ thuật lướt nước' },
      { code: '03', title: 'Thả Lỏng Dưới Nước', tag: 'Phục hồi sau buổi tập' },
    ],
  },
  tennis: {
    id: 'tennis',
    path: '/tennis',
    kicker: 'TENNIS CLUB',
    title: 'Sân Tennis Câu Lạc Bộ',
    subtitle: 'Kỹ thuật · Bộ chân · Đánh đôi',
    image: '/images/fitness/tennis-court.jpg',
    stats: [
      { value: '02 Sân', label: 'Mặt sân tiêu chuẩn' },
      { value: 'Máy Tập', label: 'Hỗ trợ tập cá nhân' },
      { value: '06:00 — 22:00', label: 'Mở cửa mỗi ngày' },
    ],
    programs: [
      { code: '01', title: 'Nhập Môn & Cầm Vợt', tag: 'Cảm giác bóng cơ bản' },
      { code: '02', title: 'Giao Bóng & Lên Lưới', tag: 'Forehand · Backhand · Serve' },
      { code: '03', title: 'Bộ Chân & Đánh Đôi', tag: 'Giao lưu cuối tuần' },
    ],
  },
};

export function SportPage({ forcedSport }: { forcedSport?: 'swimming' | 'tennis' }) {
  const { sportId } = useParams<{ sportId?: string }>();
  const { pathname } = useLocation();
  const key: 'swimming' | 'tennis' =
    forcedSport ?? (sportId === 'tennis' || pathname.includes('tennis') ? 'tennis' : 'swimming');
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
              <Link
                to="/swimming"
                className={`fit-trainer-switch-pill ${sport.id === 'swimming' ? 'is-active' : ''}`}
                aria-current={sport.id === 'swimming' ? 'page' : undefined}
              >
                <span>Hồ Bơi</span>
                <small>Aquatics Club</small>
              </Link>
              <Link
                to="/tennis"
                className={`fit-trainer-switch-pill ${sport.id === 'tennis' ? 'is-active' : ''}`}
                aria-current={sport.id === 'tennis' ? 'page' : undefined}
              >
                <span>Sân Tennis</span>
                <small>Tennis Club</small>
              </Link>
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

