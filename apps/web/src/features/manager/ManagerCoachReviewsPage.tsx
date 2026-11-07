import { useStaffI18n, type StaffMessage, staffMessage, staffError as errorMessage, staffNotify as notify } from '../operations/staffI18n';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Modal } from '../../shared/ui/Modal';
import { formatPrice } from '../../shared/lib/membershipPresentation';
import {
  getAllMonthlyReviews,
  generateMonthlyReviews,
  updateMonthlyReview,
  getCoachReviews,
  type CoachMonthlyReviewDto,
  type CoachReviewDto,
} from '../coaching/coachReviewApi';
import { getCoaches } from '../member/coachBookingApi';
import { ActionMenu } from '../../shared/ui/ActionMenu';
import { formatCenterDateTime } from '../../shared/lib/centerTime';

import { Select } from '../../shared/ui/Select';
export function ManagerCoachReviewsPage() {
  const { t } = useStaffI18n();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [reviews, setReviews] = useState<CoachMonthlyReviewDto[]>([]);
  const [memberReviews, setMemberReviews] = useState<CoachReviewDto[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'member_reviews'>('leaderboard');
  const [error, setError] = useState<StaffMessage>('');

  // Edit Modal State for a Coach's Monthly Review
  const [editingReview, setEditingReview] = useState<CoachMonthlyReviewDto | null>(null);
  const [editRank, setEditRank] = useState<number>(1);
  const [editBadge, setEditBadge] = useState<string>('');
  const [editBonus, setEditBonus] = useState<number>(0);
  const [editFeedback, setEditFeedback] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [monthlyList, coachList] = await Promise.all([
        getAllMonthlyReviews(selectedYear, selectedMonth),
        getCoaches().catch(() => []),
      ]);
      setReviews(monthlyList);

      // Load member reviews for all coaches and filter by selected period
      if (coachList.length > 0) {
        const allReviewsArrays = await Promise.all(
          coachList.map((c) => getCoachReviews(c.id).catch(() => []))
        );
        const filtered = allReviewsArrays
          .flat()
          .filter((item) => {
            if (!item.createdAt) return true;
            const d = new Date(item.createdAt);
            if (Number.isNaN(d.getTime())) return true;
            return d.getFullYear() === selectedYear && d.getMonth() + 1 === selectedMonth;
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setMemberReviews(filtered);
      } else {
        setMemberReviews([]);
      }
    } catch (err: unknown) {
      setError((errorMessage(err, 'Không thể tải dữ liệu bảng xếp hạng.')));
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleAutoGenerate() {
    setGenerating(true);
    setError('');
    
    try {
      const generated = await generateMonthlyReviews(selectedYear, selectedMonth);
      setReviews(generated);
      notify(staffMessage(`Đã tự động tổng hợp đánh giá và tạo Bảng xếp hạng tháng ${selectedMonth}/${selectedYear} thành công!`, `Compiled evaluations and created rankings for month ${selectedMonth}/${selectedYear} successfully!`), 'success');
    } catch (err: unknown) {
      setError((errorMessage(err, 'Không thể tổng hợp đánh giá.')));
    } finally {
      setGenerating(false);
    }
  }

  function handleOpenEdit(r: CoachMonthlyReviewDto) {
    setEditingReview(r);
    setEditRank(r.rankPosition);
    setEditBadge(r.badge || '');
    setEditBonus(r.bonusAmount || 0);
    setEditFeedback(r.managerFeedback || '');
  }

  async function handleSaveEdit() {
    if (!editingReview) return;
    setSavingId(editingReview.id);
    setError('');
    try {
      const updated = await updateMonthlyReview(editingReview.id, {
        rankPosition: editRank,
        badge: editBadge,
        bonusAmount: editBonus,
        managerFeedback: editFeedback,
        status: 'published',
      });
      setReviews((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      notify(staffMessage(`Đã cập nhật và gửi thông báo vinh danh cho HLV ${updated.coachName}!`, `Updated and notified coach of recognition ${updated.coachName}!`), 'success');
      setEditingReview(null);
    } catch (err: unknown) {
      setError((errorMessage(err, 'Không thể lưu bản đánh giá.')));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div data-i18n-managed className="portal-container" style={{ display: 'grid', gap: 20 }}>
      <PageHeader
        eyebrow={t("Quản lý Trung tâm")}
        title={t("Bảng xếp hạng & đánh giá huấn luyện viên tháng")}
      />

      {/* Bar điều khiển Tháng / Năm & Thao tác */}
      <div
        className="portal-card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          padding: '16px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{t("Kỳ đánh giá:")}</span>
          <Select
            className="portal-input"
            value={String(selectedMonth)}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{ width: 130 }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <option data-i18n-managed key={i + 1} value={i + 1}>
                {t("Tháng ")}{i + 1}
              </option>
            ))}
          </Select>

          <Select
            className="portal-input"
            value={String(selectedYear)}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{ width: 100 }}
          >
            {[2025, 2026, 2027].map((y) => (
              <option data-i18n-managed key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* Chưa có bảng tổng kết: đây là việc chính; đã có thì chỉ cần khi muốn tính lại */}
          {reviews.length === 0 ? (
            <button data-i18n-managed
              type="button"
              className="btn-primary"
              disabled={generating}
              onClick={() => void handleAutoGenerate()}
            >
              {generating ? t('Đang tổng hợp…') : t('Tự động tổng hợp số liệu tháng')}
            </button>
          ) : (
            <ActionMenu label={t("Tùy chọn kỳ đánh giá")}>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={generating}
                onClick={() => void handleAutoGenerate()}
              >
                {generating ? t('Đang tổng hợp…') : t('Tự động tổng hợp số liệu tháng')}
              </button>
            </ActionMenu>
          )}
        </div>
      </div>

      {error && (
        <div data-i18n-managed
          className="portal-card"
          role="alert"
          style={{
            borderColor: 'color-mix(in srgb, var(--portal-danger) 45%, transparent)',
            background: 'color-mix(in srgb, var(--portal-danger) 8%, transparent)',
            padding: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <strong style={{ color: 'var(--portal-danger, #fca5a5)' }}>{t(error)}</strong>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setError('')}
            style={{ padding: '2px 8px', fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          className={`filter-chip ${activeTab === 'leaderboard' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          {t("Bảng xếp hạng Top Coach (")}{reviews.length})
        </button>
        <button
          type="button"
          className={`filter-chip ${activeTab === 'member_reviews' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('member_reviews')}
        >
          {t("Đánh giá từ Hội viên (")}{memberReviews.length})
        </button>
      </div>

      {loading ? (
        <div data-i18n-managed className="portal-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="row-card__meta">{t("Đang tải bảng xếp hạng và đánh giá...")}</p>
        </div>
      ) : activeTab === 'leaderboard' ? (
        reviews.length === 0 ? (
          <div data-i18n-managed className="portal-card" style={{ padding: 40, textAlign: 'center' }}>
            <p className="row-card__meta">
              {t("Chưa có bảng tổng kết tháng ")}{selectedMonth}/{selectedYear}{t(". Bấm nút \"Tự động tổng hợp số liệu tháng\" ở trên để bắt đầu!")}</p>
          </div>
        ) : (
          <div data-i18n-managed style={{ display: 'grid', gap: 14 }}>
            {reviews.map((r) => {
              const rankColor =
                r.rankPosition === 1 ? 'var(--portal-rank-gold)' : r.rankPosition === 2 ? 'var(--portal-rank-silver)' : r.rankPosition === 3 ? 'var(--portal-rank-bronze)' : 'var(--portal-muted)';
              return (
                <div data-i18n-managed
                  key={r.id}
                  className="portal-card"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 16,
                    padding: '18px 22px',
                    borderColor: r.rankPosition === 1 ? 'color-mix(in srgb, var(--portal-star) 45%, transparent)' : undefined,
                    background: r.rankPosition === 1 ? 'linear-gradient(135deg, rgba(234, 179, 8, 0.08) 0%, rgba(234, 179, 8, 0.01) 100%)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        background: rankColor,
                        color: r.rankPosition <= 3 ? 'var(--portal-rank-ink)' : 'var(--portal-on-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: 18,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      }}
                    >
                      #{r.rankPosition}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <h4 style={{ margin: 0, fontSize: 17, fontWeight: 750 }}>{r.coachName}</h4>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: 99,
                            background: 'color-mix(in srgb, var(--portal-salmon) 15%, transparent)',
                            color: 'var(--portal-salmon, #ce9180)',
                          }}
                        >
                          {r.badge || t('Huấn luyện viên')}
                        </span>
                      </div>

                      <p className="row-card__meta" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        {t("Chuyên môn: ")}<strong>{r.coachSpecialization}</strong> {t(" • Đánh giá:")}{' '}
                        <strong style={{ color: 'var(--portal-star)' }}>
                          {r.averageRating != null ? r.averageRating.toFixed(1) : '0.0'} / 5.0
                        </strong> ({r.totalReviews} {t(" lượt) • Tổng số buổi dạy:")}{' '}
                        <strong>{r.totalSessions} {t(" buổi")}</strong>
                      </p>

                      {r.managerFeedback && (
                        <p data-i18n-managed style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--portal-muted, #71717a)', fontStyle: 'italic' }}>
                          {t("Lời phê của Quản lý: \"")}{r.managerFeedback}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 12, color: 'var(--portal-muted, #71717a)' }}>{t("Mức thưởng tháng")}</span>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-salmon, #ce9180)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(r.bonusAmount)}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => handleOpenEdit(r)}
                    >
                      {t("Sửa danh hiệu & Thưởng")}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Member Reviews Tab */
        memberReviews.length === 0 ? (
          <div data-i18n-managed className="portal-card" style={{ padding: 40, textAlign: 'center' }}>
            <p className="row-card__meta">{t("Chưa có đánh giá nào từ học viên trong giai đoạn này.")}</p>
          </div>
        ) : (
          <div data-i18n-managed style={{ display: 'grid', gap: 12 }}>
            {memberReviews.map((mr) => (
              <div data-i18n-managed key={mr.id} className="portal-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{mr.memberName}</strong>
                    <span className="row-card__meta" style={{ marginLeft: 8 }}>
                      {t("đánh giá HLV ")}<strong>{mr.coachName}</strong>
                    </span>
                  </div>
                  <span style={{ color: 'var(--portal-star)', fontWeight: 800, fontSize: 15 }}>
                    {'⭐'.repeat(mr.rating)} ({mr.rating} {t("sao)")}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--portal-paper, #202020)', lineHeight: 1.5 }}>
                  "{mr.comment || t('Không có nhận xét chi tiết.')}"
                </p>
                <span className="row-card__meta" style={{ display: 'block', marginTop: 6, fontSize: 11 }}>
                  {t("Gửi lúc: ")}{formatCenterDateTime(mr.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Modal Chỉnh sửa Đánh giá & Trao thưởng tháng */}
      {editingReview && (
        <Modal
          title={t(`Đánh giá tháng & Khen thưởng: HLV ${editingReview.coachName}`, `Monthly evaluation & Award: Coach ${editingReview.coachName}`)}
          onClose={() => setEditingReview(null)}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {t("Thứ hạng (Rank):")}</label>
              <input
                type="number"
                min={1}
                max={50}
                className="portal-input"
                value={editRank}
                onChange={(e) => setEditRank(Number(e.target.value))}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {t("Danh hiệu trao tặng (Badge / Title):")}</label>
              <input
                type="text"
                className="portal-input"
                placeholder={t("Ví dụ: Top 1: Coach of the Month 🏆")}
                value={editBadge}
                onChange={(e) => setEditBadge(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {t("Mức thưởng tiền mặt (VNĐ):")}</label>
              <input
                type="number"
                step={100000}
                className="portal-input"
                value={editBonus}
                onChange={(e) => setEditBonus(Number(e.target.value))}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {t("Nhận xét tổng kết của Quản lý gửi cho Coach:")}</label>
              <textarea
                rows={3}
                className="portal-input"
                style={{ width: '100%', resize: 'vertical' }}
                value={editFeedback}
                onChange={(e) => setEditFeedback(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingId !== null}
                onClick={() => setEditingReview(null)}
              >
                {t("Hủy")}</button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingId !== null}
                onClick={() => void handleSaveEdit()}
              >
                {savingId !== null ? t('Đang lưu…') : t('Lưu & Công bố cho HLV')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

