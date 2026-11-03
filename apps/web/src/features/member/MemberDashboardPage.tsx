import { LoadingImage } from '../../shared/ui/LoadingImage';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentUser } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { PortalIcon } from '../portal/PortalIcon';
import './member-board.css';
import {
  getCurrentMembership,
  getBookedEnrollments,
  type BookedClass,
  type MemberSubscription,
} from './memberDashboardApi';
import { formatCenterDate } from '../../shared/lib/centerTime';

const DAY_MS = 86_400_000;

function validDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function localDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS,
  );
}

function remainingDays(endDate: string, today: Date): number {
  return Math.max(0, dayNumber(localDate(endDate)) - dayNumber(today) + 1);
}

function membershipProgress(
  subscription: MemberSubscription,
  today: Date,
): number {
  const start = dayNumber(localDate(subscription.startDate));
  const end = dayNumber(localDate(subscription.paidThroughDate ?? subscription.endDate));
  const duration = end - start + 1;

  if (duration <= 0) return 0;

  const used = dayNumber(today) - start;
  return Math.min(100, Math.max(0, (used / duration) * 100));
}

function formatDate(value: string): string {
  return formatCenterDate(value.slice(0, 10));
}

type MembershipState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; membership: MemberSubscription | null };

type ClassesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'success'; classes: BookedClass[] };

export function MemberDashboardPage() {
  const userName = getCurrentUser()?.name || 'Hội viên';

  const [membershipState, setMembershipState] =
    useState<MembershipState>({ status: 'loading' });

  const [classesState, setClassesState] =
    useState<ClassesState>({ status: 'loading' });

  const loadMembership = useCallback(async () => {
    setMembershipState({ status: 'loading' });

    try {
      const membership = await getCurrentMembership();
      setMembershipState({ status: 'success', membership });
    } catch {
      setMembershipState({ status: 'error' });
    }
  }, []);

  const loadClasses = useCallback(async () => {
    setClassesState({ status: 'loading' });

    try {
      const classes = await getBookedEnrollments();
      setClassesState({ status: 'success', classes });
    } catch {
      setClassesState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void loadMembership();
    void loadClasses();
  }, [loadMembership, loadClasses]);

  const today = new Date();

  const membership =
    membershipState.status === 'success' &&
    membershipState.membership?.status?.toLowerCase() === 'active' &&
    validDate(membershipState.membership.startDate) &&
    validDate(membershipState.membership.endDate) &&
    dayNumber(localDate(membershipState.membership.startDate)) <= dayNumber(today) &&
    dayNumber(localDate(membershipState.membership.endDate)) >= dayNumber(today)
      ? membershipState.membership
      : null;

  const classes =
    classesState.status === 'success'
      ? classesState.classes.filter(
          (item) => item.status?.toLowerCase() === 'booked',
        )
      : [];

  return (
    <div className="portal-container member-overview">
      <PageHeader
        eyebrow="Hội viên"
        title={`Xin chào, ${userName}`}
        subtitle="Gói tập, lịch học và thẻ hội viên của bạn."
        actions={<Link className="btn-primary" to="/member/classes"><PortalIcon name="calendar" size={16} />Khám phá lịch học</Link>}
      />

      <div className="member-board-toolbar">
        <div className="member-board-view"><PortalIcon name="board" size={15} /><span>Tổng quan của tôi</span></div>
        <span className="member-board-date">{today.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </div>

      <div className="member-board" aria-label="Tổng quan hội viên">
        <section className="member-board-column member-board-column--pink" aria-labelledby="board-membership">
          <div className="member-column-heading"><h2 id="board-membership"><i />Gói tập của tôi</h2><Link to="/member/packages" aria-label="Xem các gói tập"><PortalIcon name="arrow" size={16} /></Link></div>

          {membershipState.status === 'loading' && (
            <section className="portal-card member-board-loading" role="status">
              <div className="member-skeleton member-skeleton--image" aria-hidden="true" /><span>Đang tải thông tin gói tập…</span>
            </section>
          )}

          {membershipState.status === 'error' && (
            <section className="portal-card portal-empty" role="alert">
              <h2 className="portal-card-title">
                Không thể tải thông tin gói tập
              </h2>
              <p>Vui lòng thử lại sau ít phút.</p>

              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: 20 }}
                onClick={() => void loadMembership()}
              >
                Thử lại
              </button>
            </section>
          )}

          {membershipState.status === 'success' && (
            <>
              {membership ? (
                <section
                  className="portal-card member-membership-card"
                  aria-labelledby="membership-title"
                >
                  <Link className="member-card-cover-link" to="/member/packages" aria-label="Xem gói tập của tôi"><LoadingImage className="member-card-cover" src="/images/about-movement-studio.jpg" alt="" /></Link>
                  <div className="member-card-body">
                    <Link className="member-card-details-link" to="/member/packages" aria-label="Xem chi tiết gói tập của tôi">
                    <span className="badge badge-success">Đang hoạt động</span>
                    <div className="meta-label" style={{ marginTop: 14 }}>Gói tập hiện tại</div>

                    <h2
                      id="membership-title"
                      className="portal-card-title"
                      style={{ marginTop: 12 }}
                    >
                      {membership.packageName}
                    </h2>

                    <p className="row-card__meta">
                      {formatDate(membership.startDate)}
                      {' – '}
                      {formatDate(membership.paidThroughDate ?? membership.endDate)}
                      {' · Còn '}
                      {remainingDays(membership.paidThroughDate ?? membership.endDate, today)}
                      {' ngày'}
                    </p>

                    <div
                      role="progressbar"
                      aria-label="Thời hạn gói tập đã sử dụng"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(
                        membershipProgress(membership, today),
                      )}
                      style={{
                        height: 6,
                        background: 'var(--color-border-subtle)',
                        marginTop: 18,
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${membershipProgress(membership, today)}%`,
                          height: '100%',
                          background: 'var(--color-accent-gold)',
                        }}
                      />
                    </div>
                    </Link>
                  </div>
                </section>
              ) : (
                <section
                  className="portal-card portal-card--feature portal-empty"
                  aria-labelledby="membership-empty-title"
                >
                  <PortalIcon name="package" size={28} />
                  <div className="meta-label" style={{ marginTop: 16 }}>SÖL FITNESS</div>

                  <h2
                    id="membership-empty-title"
                    className="portal-card-title"
                    style={{ margin: '16px 0 10px' }}
                  >
                    Chưa có gói tập đang hoạt động
                  </h2>

                  <p>Đăng ký gói tập để đặt lớp và check-in.</p>

                  <Link
                    to="/member/packages"
                    className="btn-primary"
                    style={{ marginTop: 24 }}
                  >
                    Khám phá các gói tập
                  </Link>
                </section>
              )}
            </>
          )}

        </section>

        <section className="member-board-column member-board-column--orange" aria-labelledby="board-classes">
          <div className="member-column-heading"><h2 id="board-classes"><i />Lịch tập của tôi</h2><Link to="/member/classes" aria-label="Xem lịch lớp học"><PortalIcon name="arrow" size={16} /></Link></div>

          <section
            className="portal-card member-classes-card"
            aria-labelledby="upcoming-title"
          >
            <div className="portal-card-header">
              <h2
                id="upcoming-title"
                className="portal-card-title"
              >
                Lớp đã đăng ký
              </h2>
            </div>

            {classesState.status === 'success' && <Link className="member-card-overlay-link" to="/member/classes" aria-label="Xem lịch lớp học của tôi" />}
            {classesState.status === 'loading' && (
              <LoadingSkeleton label="Đang tải lịch học…" count={3} />
            )}

            {classesState.status === 'error' && (
              <div role="alert">
                <p className="row-card__meta">
                  Chưa thể tải lịch học lúc này.
                </p>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: 16 }}
                  onClick={() => void loadClasses()}
                >
                  Thử lại
                </button>
              </div>
            )}

            {classesState.status === 'success' &&
              classes.length === 0 && (
                <div className="member-board-empty"><span className="member-board-empty-icon"><PortalIcon name="calendar" size={24} /></span><p className="row-card__meta">Bạn chưa có lớp học đang đặt.</p><Link className="member-text-link" to="/member/classes">Tìm lớp phù hợp<PortalIcon name="arrow" size={14} /></Link></div>
              )}

            {classesState.status === 'success' &&
              classes.length > 0 && (
                <div className="stack">
                  <p className="row-card__meta">
                    Xem lịch lớp để kiểm tra buổi học.
                  </p>
                  {classes.map((item) => (
                    <div key={item.id} className="row-card member-booking-row">
                      <span className="member-booking-icon"><PortalIcon name="calendar" size={17} /></span>
                      <div>
                        <h3 className="row-card__title">
                          {item.className}
                        </h3>
                        <div className="row-card__meta">
                          {validDate(item.sessionDate) && <span>{formatDate(item.sessionDate!)} · </span>}
                          {item.startTime && item.endTime && <span>{item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)} · </span>}
                          {item.roomName && <span>{item.roomName} · </span>}
                          Đã đặt chỗ
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </section>
          <Link className="member-board-note" to="/member/classes?tab=pt"><PortalIcon name="profile" size={18} /><span>Đặt lịch HLV 1:1<small>PT kèm riêng theo giờ · Đặt trước 2 tiếng</small></span><PortalIcon name="arrow" size={14} /></Link>
        </section>

        <section className="member-board-column member-board-column--blue" aria-labelledby="board-card">
          <div className="member-column-heading"><h2 id="board-card"><i />Thẻ & thanh toán</h2><Link to="/member/card" aria-label="Xem thẻ hội viên"><PortalIcon name="arrow" size={16} /></Link></div>
          <Link className="member-digital-card" to="/member/card">
            <div className="member-digital-card-top"><span>SÖL</span><PortalIcon name="scan" size={24} /></div>
            <span className="member-digital-card-label">FITNESS MEMBERSHIP</span>
            <strong>{userName}</strong>
            <div className="member-digital-card-bottom"><span>Thẻ hội viên điện tử</span><PortalIcon name="arrow" size={17} /></div>
          </Link>
          <Link className="member-board-note" to="/member/invoices"><PortalIcon name="receipt" size={18} /><span>Giao dịch & hóa đơn<small>Xem các khoản đã thanh toán</small></span><PortalIcon name="arrow" size={14} /></Link>
        </section>

        <section className="member-board-column member-board-column--green" aria-labelledby="board-wellness">
          <div className="member-column-heading"><h2 id="board-wellness"><i />Sức khỏe & cân bằng</h2><Link to="/member/profile" aria-label="Xem hồ sơ và sức khỏe"><PortalIcon name="arrow" size={16} /></Link></div>
          <Link className="member-profile-card" to="/member/profile"><span className="member-info-icon"><PortalIcon name="profile" size={20} /></span><h3>Hồ sơ sức khỏe</h3><p>Cập nhật thông tin cá nhân và chỉ số cơ thể.</p><span className="member-text-link">Hồ sơ & sức khỏe<PortalIcon name="arrow" size={14} /></span></Link>
        </section>
      </div>
    </div>
  );
}
