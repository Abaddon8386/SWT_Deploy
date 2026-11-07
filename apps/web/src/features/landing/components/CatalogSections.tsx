import { useSourceLanguage, sourceText, sourceFormat } from "../../shop/shopI18n";
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicCatalog } from '../publicCatalog';
import { sessionDate } from '../publicCatalog';
import { formatPrice, getPackageDetails, isTrialPackage } from '../../../shared/lib/membershipPresentation';
import { RoundArrow } from './PublicLayout';
import { coachIllustration, coachPortrait } from '../../../shared/lib/coachIllustration';
import { LoadingSkeleton } from '../../../shared/ui/LoadingSkeleton';
import { LoadingImage } from '../../../shared/ui/LoadingImage';
import { DISCIPLINES, isStandardDiscipline, matchesDiscipline, type DisciplineId } from '../../../shared/lib/disciplines';

export function CatalogStatus({ loading, retry, kind = 'schedule' }: {
  loading: boolean; retry: () => void; kind?: 'packages' | 'trainers' | 'schedule';
}) {
  useSourceLanguage();
  if (loading) return <LoadingSkeleton label={sourceText("Đang tải thông tin…")} variant="cards"
    count={kind === 'trainers' ? 2 : 3} className={`fit-catalog-skeleton fit-catalog-skeleton--${kind}`} />;
  return <div className="fit-catalog-state" role="alert">
    <p>{sourceText("Chưa tải được thông tin mới nhất. Vui lòng thử lại.")}</p>
    <button type="button" className="fit-pill" onClick={retry}>{sourceText("Thử lại")}</button>
  </div>;
}

export function CatalogPackages({ catalog, joinPath }: { catalog: PublicCatalog; joinPath: string }) {
  useSourceLanguage();
  const [longTerm, setLongTerm] = useState(false);

  const packages = catalog.packages.filter(pkg => {
    if (pkg.status !== 'active') return false;
    if (isTrialPackage(pkg)) return false;
    // Trang đầu: chỉ hiển thị 3 gói 1 tháng (Bạc, Vàng, Platinum)
    if (!longTerm) return pkg.durationDays < 90;
    // Đồng hành dài hạn: các gói từ 90 ngày trở lên (hiện là 3 gói 12 tháng)
    return pkg.durationDays >= 90;
  });

  return <>
    <div className="fit-pricing-switch" data-reveal="soft" aria-label={sourceText("Lọc thời hạn gói tập")}>
      <button type="button" aria-pressed={!longTerm} onClick={() => setLongTerm(false)}>{sourceText("Gói 1 tháng")}</button>
      <button type="button" aria-pressed={longTerm} onClick={() => setLongTerm(true)}>{sourceText("Đồng hành dài hạn")}</button>
    </div>
    {packages.length === 0 && <p className="fit-catalog-state" role="status">{sourceText("Chưa có gói tập phù hợp.")}</p>}
    <div className="fit-pricing-grid" key={String(longTerm)}>
      {packages.map((pkg, index) => {
        const details = getPackageDetails(pkg);
        const isFeatured = index === 1;
        return <article key={pkg.id} className={`fit-plan ${isFeatured ? 'fit-plan-featured' : ''}`} data-reveal="lift">
          <h3>{pkg.name}</h3>
          <div className="fit-plan-price">{formatPrice(pkg.price)}<span>/ {pkg.durationDays} {sourceText(" ngày")}</span></div>
          <p className="fit-plan-summary">{details.summary}</p>
          <ul>{details.benefits.slice(0, 3).map(benefit => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul>
          {details.benefits.length > 3 && <details className="fit-plan-more">
            <summary>{sourceText("Xem thêm ")}{details.benefits.length - 3} {sourceText(" quyền lợi")}</summary>
            <ul>{details.benefits.slice(3).map(benefit => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul>
          </details>}
          <Link
            className="fit-pill"
            to={joinPath === '/register' || joinPath === '/login' ? `${joinPath}?returnTo=${encodeURIComponent(`/member/packages?packageId=${pkg.id}`)}` : joinPath === '/member/packages' ? `${joinPath}?packageId=${pkg.id}` : joinPath}
          >
            <span>{sourceText("Chọn gói tập")}</span>
            <RoundArrow diagonal />
          </Link>
        </article>;
      })}
    </div>
  </>;
}

export function CatalogSchedule({ catalog, joinPath, coachId, sport }: {
  catalog: PublicCatalog; joinPath: string; coachId?: number; sport?: DisciplineId;
}) {
  useSourceLanguage();
  const [discipline, setDiscipline] = useState('all');
  const sportName = DISCIPLINES.find((item) => item.id === sport)?.name;
  const matchesSport = (value: string) => sportName ? matchesDiscipline(value, sportName) : isStandardDiscipline(value);
  const sessions = catalog.sessions.filter(session => matchesSport(session.disciplineName)
    && (!coachId || session.coachId === coachId));
  const disciplines = [...new Set(sessions.map(session => session.disciplineName))];
  const activeDiscipline = disciplines.includes(discipline) ? discipline : 'all';
  const visible = sessions.filter(session => activeDiscipline === 'all' || session.disciplineName === activeDiscipline);
  return <>
    <p className="fit-catalog-caption">{sourceText("Lịch trong 7 ngày tới · đặt chỗ qua portal khi gói tập còn hiệu lực.")}</p>
    {disciplines.length > 1 && <div className="fit-pricing-switch fit-schedule-switch" aria-label={sourceText("Lọc bộ môn trong lịch lớp")}>
      {['all', ...disciplines].map(value => <button type="button" key={value} aria-pressed={activeDiscipline === value} onClick={() => setDiscipline(value)}>{value === 'all' ? sourceText('Tất cả bộ môn') : value}</button>)}
    </div>}
    {visible.length === 0 && <p className="fit-catalog-state" role="status">{sourceText("Chưa có lịch lớp phù hợp trong 7 ngày tới.")}</p>}
    <div className="fit-schedule-grid" key={activeDiscipline}>
      {visible.map(session => <article key={session.id} className="fit-schedule-card" data-reveal="lift">
        <div className="fit-schedule-top"><span className="fit-schedule-time">{sessionDate(session.sessionDate)} · {session.startTime.slice(0, 5)} — {session.endTime.slice(0, 5)}</span>
          <span className="fit-schedule-spots">{Math.max(0, session.capacity - session.bookedCount)}{sourceText(" chỗ trống")}</span></div>
        <h3>{session.className}</h3><p className="fit-schedule-meta">{session.disciplineName} · {session.roomName}</p>
        <Link to={`/trainers/${session.coachId}`} className="fit-text-link">{sourceText("HLV: ")}{session.coachName}</Link>
        <Link to={joinPath} className="fit-text-link">{session.bookedCount >= session.capacity ? sourceText('Đã đầy chỗ') : sourceText('Đặt lớp')}<RoundArrow diagonal /></Link>
      </article>)}
    </div>
  </>;
}

export function CatalogTrainers({ catalog }: { catalog: PublicCatalog }) {
  useSourceLanguage();
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(catalog.coaches.length / 2);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  return <>
    {catalog.coaches.length === 0 && <p className="fit-catalog-state" role="status">{sourceText("Chưa có huấn luyện viên đang hoạt động.")}</p>}
    {pageCount > 1 && <div className="fit-slider-controls" aria-label={sourceText("Chọn nhóm huấn luyện viên")}>{Array.from({ length: pageCount }, (_, index) => <button type="button" key={index} className={currentPage === index ? 'is-active' : ''} aria-label={sourceFormat("Nhóm huấn luyện {0}", index + 1)} aria-pressed={currentPage === index} onClick={() => setPage(index)} />)}</div>}
    <div className="fit-trainer-grid" key={currentPage}>
      {catalog.coaches.slice(currentPage * 2, currentPage * 2 + 2).map(coach => <article className="fit-trainer-card" data-reveal="lift" key={coach.id}>
        <Link to={`/trainers/${coach.id}`} className="fit-trainer-card-link" aria-label={sourceFormat("Xem hồ sơ của {0}", coach.name)}>
          <LoadingImage src={coach.avatarUrl || coachIllustration(coach.specialization, coach.name)} alt={coach.avatarUrl || coachPortrait(coach.name) ? coach.name : sourceText('Ảnh minh họa huấn luyện viên theo bộ môn')} loading="lazy" />
          {!coach.avatarUrl && !coachPortrait(coach.name) && <span className="fit-image-caption">{sourceText("Ảnh minh họa")}</span>}
          <div className="fit-trainer-card-info"><span className="fit-trainer-vn-name">{sourceText("Huấn luyện viên")}</span><h3>{coach.name}</h3><p>{coach.specialization || sourceText('Huấn luyện thể thao')}</p><span className="fit-trainer-story-cta">{sourceText("Xem hồ sơ & lịch lớp →")}</span></div>
          <RoundArrow diagonal />
        </Link>
      </article>)}
    </div>
  </>;
}
