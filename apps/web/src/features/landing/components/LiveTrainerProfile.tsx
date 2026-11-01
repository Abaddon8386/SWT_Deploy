import { LoadingImage } from '../../../shared/ui/LoadingImage';
import { Link, useParams } from 'react-router-dom';
import { getCurrentUser, homePath } from '../../../shared/api/client';
import { coachIllustration } from '../../../shared/lib/coachIllustration';
import { PublicLayout, RoundArrow } from './PublicLayout';
import { CatalogSchedule, CatalogStatus } from './CatalogSections';
import { usePublicCatalog } from '../publicCatalog';

export function LiveTrainerProfile() {
  const { trainerId } = useParams<{ trainerId?: string }>();
  const { catalog, error, retry } = usePublicCatalog();
  const coach = catalog?.coaches.find(item => String(item.id) === trainerId);
  const user = getCurrentUser();
  const classPath = user ? user.role === 'MEMBER' ? '/member/classes' : homePath(user.role) : '/login';
  return <PublicLayout>
    <main id="public-main" className="fit-trainer-story-page">
      <section className="fit-section fit-trainer-story-hero" aria-labelledby="trainer-story-title">
        <Link to="/#trainers" className="fit-text-link fit-back-link">← Đội ngũ huấn luyện viên</Link>
        {!catalog ? <><h1 id="trainer-story-title">Hồ sơ huấn luyện viên</h1><CatalogStatus loading={!error} retry={retry} /></> : !coach ? <>
          <h1 id="trainer-story-title">Không tìm thấy huấn luyện viên</h1>
          <p className="fit-catalog-state" role="status">Hồ sơ này hiện chưa được công khai hoặc không còn hoạt động.</p>
        </> : <>
          <div className="fit-trainer-switcher" aria-label="Chọn huấn luyện viên">{catalog.coaches.map(item => <Link key={item.id} to={`/trainers/${item.id}`} className={`fit-trainer-switch-pill ${item.id === coach.id ? 'is-active' : ''}`} aria-current={item.id === coach.id ? 'page' : undefined}>{item.name}</Link>)}</div>
          <div className="fit-trainer-hero-grid" key={coach.id}>
            <div className="fit-trainer-portrait-card" data-reveal="image">
              <LoadingImage src={coach.avatarUrl || coachIllustration(coach.specialization)} alt={coach.avatarUrl ? coach.name : 'Ảnh minh họa huấn luyện viên theo bộ môn'} />
              {!coach.avatarUrl && <span className="fit-image-caption">Ảnh minh họa</span>}
            </div>
            <div className="fit-trainer-hero-copy" data-reveal="soft">
              <span className="fit-kicker">HUẤN LUYỆN VIÊN SÖL</span>
              <h1 id="trainer-story-title">{coach.name}<span className="fit-title-dot">.</span><small>{coach.specialization || 'Huấn luyện thể thao'}</small></h1>
              <p className="fit-coach-bio">{coach.bio || 'Thông tin giới thiệu đang được cập nhật.'}</p>
              {coach.certification && <div className="fit-trainer-specialty-box"><span className="fit-kicker">CHỨNG CHỈ</span><p>{coach.certification}</p></div>}
              <Link to={classPath} className="fit-pill">Xem lịch & đặt lớp<RoundArrow diagonal /></Link>
            </div>
          </div>
          <h2 className="fit-catalog-heading">Lịch lớp của {coach.name}</h2>
          <CatalogSchedule catalog={catalog} coachId={coach.id} joinPath={classPath} />
        </>}
      </section>
    </main>
  </PublicLayout>;
}
