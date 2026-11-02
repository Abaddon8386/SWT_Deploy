import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PublicCatalog } from '../publicCatalog';
import { sessionDate } from '../publicCatalog';
import { formatPrice, getPackageDetails } from '../../../shared/lib/membershipPresentation';
import { RoundArrow } from './PublicLayout';
import { coachIllustration } from '../../../shared/lib/coachIllustration';
import { LoadingSkeleton } from '../../../shared/ui/LoadingSkeleton';
import { LoadingImage } from '../../../shared/ui/LoadingImage';

export function CatalogStatus({ loading, retry, kind = 'schedule' }: {
  loading: boolean; retry: () => void; kind?: 'packages' | 'trainers' | 'schedule';
}) {
  if (loading) return <LoadingSkeleton label="Đang tải thông tin…" variant="cards"
    count={kind === 'trainers' ? 2 : 3} className={`fit-catalog-skeleton fit-catalog-skeleton--${kind}`} />;
  return <div className="fit-catalog-state" role="alert">
    <p>Chưa tải được thông tin mới nhất. Vui lòng thử lại.</p>
    <button type="button" className="fit-pill" onClick={retry}>Thử lại</button>
  </div>;
}

export function CatalogPackages({ catalog, joinPath }: { catalog: PublicCatalog; joinPath: string }) {
  const [longTerm, setLongTerm] = useState(false);
  const packages = catalog.packages.filter(pkg => pkg.status === 'active' && (!longTerm || pkg.durationDays >= 90));
  return <>
    <div className="fit-pricing-switch" data-reveal="soft" aria-label="Lọc thời hạn gói tập">
      <button type="button" aria-pressed={!longTerm} onClick={() => setLongTerm(false)}>Tất cả gói tập</button>
      <button type="button" aria-pressed={longTerm} onClick={() => setLongTerm(true)}>Đồng hành dài hạn</button>
    </div>
    {packages.length === 0 && <p className="fit-catalog-state" role="status">Chưa có gói tập phù hợp.</p>}
    <div className="fit-pricing-grid" key={String(longTerm)}>
      {packages.map((pkg, index) => {
        const details = getPackageDetails(pkg);
        return <article key={pkg.id} className={`fit-plan ${index === 1 ? 'fit-plan-featured' : ''}`} data-reveal="lift">
          <span className="fit-plan-period">{pkg.durationDays} ngày</span><h3>{pkg.name}</h3>
          <div className="fit-plan-price">{formatPrice(pkg.price)}<span>/ {pkg.durationDays} ngày</span></div>
          <p className="fit-plan-summary">{details.summary}</p>
          <ul>{details.benefits.map(benefit => <li key={benefit}><span aria-hidden="true">✓</span>{benefit}</li>)}</ul>
          <Link className="fit-pill" to={joinPath === '/register' || joinPath === '/login' ? `${joinPath}?returnTo=${encodeURIComponent(`/member/packages?packageId=${pkg.id}`)}` : joinPath === '/member/packages' ? `${joinPath}?packageId=${pkg.id}` : joinPath}>Chọn gói tập<RoundArrow diagonal /></Link>
        </article>;
      })}
    </div>
  </>;
}

export function CatalogSchedule({ catalog, joinPath, coachId, sport }: {
  catalog: PublicCatalog; joinPath: string; coachId?: number; sport?: 'swimming' | 'tennis';
}) {
  const [discipline, setDiscipline] = useState('all');
  const matchesSport = (value: string) => !sport || (sport === 'swimming' ? /bơi|swim|aquatic/i : /tennis/i).test(value);
  const sessions = catalog.sessions.filter(session => matchesSport(session.disciplineName)
    && (!coachId || session.coachId === coachId));
  const disciplines = [...new Set(sessions.map(session => session.disciplineName))];
  const activeDiscipline = disciplines.includes(discipline) ? discipline : 'all';
  const visible = sessions.filter(session => activeDiscipline === 'all' || session.disciplineName === activeDiscipline);
  return <>
    <p className="fit-catalog-caption">Lịch trong 7 ngày tới · đặt chỗ qua portal khi gói tập còn hiệu lực.</p>
    {disciplines.length > 1 && <div className="fit-pricing-switch fit-schedule-switch" aria-label="Lọc bộ môn trong lịch lớp">
      {['all', ...disciplines].map(value => <button type="button" key={value} aria-pressed={activeDiscipline === value} onClick={() => setDiscipline(value)}>{value === 'all' ? 'Tất cả bộ môn' : value}</button>)}
    </div>}
    {visible.length === 0 && <p className="fit-catalog-state" role="status">Chưa có lịch lớp phù hợp trong 7 ngày tới.</p>}
    <div className="fit-schedule-grid" key={activeDiscipline}>
      {visible.map(session => <article key={session.id} className="fit-schedule-card" data-reveal="lift">
        <div className="fit-schedule-top"><span className="fit-schedule-time">{sessionDate(session.sessionDate)} · {session.startTime.slice(0, 5)} — {session.endTime.slice(0, 5)}</span>
          <span className="fit-schedule-spots">{Math.max(0, session.capacity - session.bookedCount)} chỗ trống</span></div>
        <h3>{session.className}</h3><p className="fit-schedule-meta">{session.disciplineName} · {session.roomName}</p>
        <Link to={`/trainers/${session.coachId}`} className="fit-text-link">HLV: {session.coachName}</Link>
        <Link to={joinPath} className="fit-text-link">{session.bookedCount >= session.capacity ? 'Xem hàng chờ' : 'Đặt lớp'}<RoundArrow diagonal /></Link>
      </article>)}
    </div>
  </>;
}

export function CatalogTrainers({ catalog }: { catalog: PublicCatalog }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(catalog.coaches.length / 2);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  return <>
    {catalog.coaches.length === 0 && <p className="fit-catalog-state" role="status">Chưa có huấn luyện viên đang hoạt động.</p>}
    {pageCount > 1 && <div className="fit-slider-controls" aria-label="Chọn nhóm huấn luyện viên">{Array.from({ length: pageCount }, (_, index) => <button type="button" key={index} className={currentPage === index ? 'is-active' : ''} aria-label={`Nhóm huấn luyện ${index + 1}`} aria-pressed={currentPage === index} onClick={() => setPage(index)} />)}</div>}
    <div className="fit-trainer-grid" key={currentPage}>
      {catalog.coaches.slice(currentPage * 2, currentPage * 2 + 2).map(coach => <article className="fit-trainer-card" data-reveal="lift" key={coach.id}>
        <Link to={`/trainers/${coach.id}`} className="fit-trainer-card-link" aria-label={`Xem hồ sơ của ${coach.name}`}>
          <LoadingImage src={coach.avatarUrl || coachIllustration(coach.specialization)} alt={coach.avatarUrl ? coach.name : 'Ảnh minh họa huấn luyện viên theo bộ môn'} loading="lazy" />
          {!coach.avatarUrl && <span className="fit-image-caption">Ảnh minh họa</span>}
          <div className="fit-trainer-card-info"><span className="fit-trainer-vn-name">Huấn luyện viên</span><h3>{coach.name}</h3><p>{coach.specialization || 'Huấn luyện thể thao'}</p><span className="fit-trainer-story-cta">Xem hồ sơ & lịch lớp →</span></div>
          <RoundArrow diagonal />
        </Link>
      </article>)}
    </div>
  </>;
}
