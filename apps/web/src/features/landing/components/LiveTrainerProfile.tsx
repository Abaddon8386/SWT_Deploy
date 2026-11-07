import { useSourceLanguage, sourceText } from "../../shop/shopI18n";
import { LoadingImage } from '../../../shared/ui/LoadingImage';
import { Link, useParams } from 'react-router-dom';
import { getCurrentUser, homePath } from '../../../shared/api/client';
import { coachIllustration, coachPortrait } from '../../../shared/lib/coachIllustration';
import { PublicLayout, RoundArrow } from './PublicLayout';
import { CatalogSchedule, CatalogStatus } from './CatalogSections';
import { usePublicCatalog } from '../publicCatalog';

export function LiveTrainerProfile() {
  useSourceLanguage();
  const { trainerId } = useParams<{ trainerId?: string }>();
  const { catalog, error, retry } = usePublicCatalog();
  const coach = trainerId ? catalog?.coaches.find(item => String(item.id) === trainerId) : catalog?.coaches[0];
  const user = getCurrentUser();
  const classPath = user ? user.role === 'MEMBER' ? '/member/classes' : homePath(user.role) : '/login';
  return <PublicLayout>
    <main id="public-main" className="fit-trainer-story-page">
      <section className="fit-section fit-trainer-story-hero" aria-labelledby="trainer-story-title">
        <Link to="/#trainers" className="fit-text-link fit-back-link">{sourceText("← Đội ngũ huấn luyện viên")}</Link>
        {!catalog ? <><h1 id="trainer-story-title">{sourceText("Hồ sơ huấn luyện viên")}</h1><CatalogStatus loading={!error} retry={retry} /></> : !coach ? <>
          <h1 id="trainer-story-title">{sourceText("Không tìm thấy huấn luyện viên")}</h1>
          <p className="fit-catalog-state" role="status">{sourceText("Hồ sơ này hiện chưa được công khai hoặc không còn hoạt động.")}</p>
        </> : <>
          <div className="fit-trainer-switcher" aria-label={sourceText("Chọn huấn luyện viên")}>{catalog.coaches.map(item => <Link key={item.id} to={`/trainers/${item.id}`} className={`fit-trainer-switch-pill ${item.id === coach.id ? 'is-active' : ''}`} aria-current={item.id === coach.id ? 'page' : undefined}>{item.name}</Link>)}</div>
          <div className="fit-trainer-hero-grid" key={coach.id}>
            <div className="fit-trainer-portrait-card" data-reveal="image">
              <LoadingImage src={coach.avatarUrl || coachIllustration(coach.specialization, coach.name)} alt={coach.avatarUrl || coachPortrait(coach.name) ? coach.name : sourceText('Ảnh minh họa huấn luyện viên theo bộ môn')} />
              {!coach.avatarUrl && !coachPortrait(coach.name) && <span className="fit-image-caption">{sourceText("Ảnh minh họa")}</span>}
            </div>
            <div className="fit-trainer-hero-copy" data-reveal="soft">
              <span className="fit-kicker">{sourceText("HUẤN LUYỆN VIÊN SÖL")}</span>
              <h1 id="trainer-story-title">{coach.name}<span className="fit-title-dot">.</span><small>{coach.specialization || sourceText('Huấn luyện thể thao')}</small></h1>
              <p className="fit-coach-bio">{coach.bio || sourceText('Thông tin giới thiệu đang được cập nhật.')}</p>
              {coach.certification && <div className="fit-trainer-specialty-box"><span className="fit-kicker">{sourceText("CHỨNG CHỈ")}</span><p>{coach.certification}</p></div>}
              <Link to={classPath} className="fit-pill">{sourceText("Xem lịch & đặt lớp")}<RoundArrow diagonal /></Link>
            </div>
          </div>
          <h2 className="fit-catalog-heading">{sourceText("Lịch lớp của ")}{coach.name}</h2>
          <CatalogSchedule catalog={catalog} coachId={coach.id} joinPath={classPath} />
        </>}
      </section>
    </main>
  </PublicLayout>;
}
