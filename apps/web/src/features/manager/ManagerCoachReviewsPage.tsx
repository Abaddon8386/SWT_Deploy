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
import { notify } from '../../shared/lib/portalNotices';
import { ActionMenu } from '../../shared/ui/ActionMenu';
import { errorMessage } from '../../shared/lib/errorMessage';
import { formatCenterDateTime } from '../../shared/lib/centerTime';

export function ManagerCoachReviewsPage() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [reviews, setReviews] = useState<CoachMonthlyReviewDto[]>([]);
  const [memberReviews, setMemberReviews] = useState<CoachReviewDto[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [generating, setGenerating] = useState<boolean>(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'member_reviews'>('leaderboard');
  const [error, setError] = useState<string>('');

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
      notify(`Đã tự động tổng hợp đánh giá và tạo Bảng xếp hạng tháng ${selectedMonth}/${selectedYear} thành công!`, 'success');
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
      notify(`Đã cập nhật và gửi thông báo vinh danh cho HLV ${updated.coachName}!`, 'success');
      setEditingReview(null);
    } catch (err: unknown) {
      setError((errorMessage(err, 'Không thể lưu bản đánh giá.')));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="portal-container" style={{ display: 'grid', gap: 20 }}>
      <PageHeader
        eyebrow="Quản lý Trung tâm"
        title="Bảng xếp hạng & đánh giá huấn luyện viên tháng"
        subtitle="Tổng hợp ý kiến đánh giá từ hội viên, xếp hạng thành tích và trao thưởng/danh hiệu cho Huấn luyện viên."
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
          <span style={{ fontSize: 14, fontWeight: 700 }}>Kỳ đánh giá:</span>
          <select
            className="portal-input"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            style={{ width: 130, padding: '6px 12px' }}
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>
                Tháng {i + 1}
              </option>
            ))}
          </select>

          <select
            className="portal-input"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            style={{ width: 100, padding: '6px 12px' }}
          >
            {[2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {/* Chưa có bảng tổng kết: đây là việc chính; đã có thì chỉ cần khi muốn tính lại */}
          {reviews.length === 0 ? (
            <button
              type="button"
              className="btn-primary"
              disabled={generating}
              onClick={() => void handleAutoGenerate()}
            >
              {generating ? 'Đang tổng hợp…' : 'Tự động tổng hợp số liệu tháng'}
            </button>
          ) : (
            <ActionMenu label="Tùy chọn kỳ đánh giá">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={generating}
                onClick={() => void handleAutoGenerate()}
              >
                {generating ? 'Đang tổng hợp…' : 'Tự động tổng hợp số liệu tháng'}
              </button>
            </ActionMenu>
          )}
        </div>
      </div>

      {error && (
        <div
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
          <strong style={{ color: 'var(--portal-danger, #fca5a5)' }}>{error}</strong>
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
          Bảng xếp hạng Top Coach ({reviews.length})
        </button>
        <button
          type="button"
          className={`filter-chip ${activeTab === 'member_reviews' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('member_reviews')}
        >
          Đánh giá từ Hội viên ({memberReviews.length})
        </button>
      </div>

      {loading ? (
        <div className="portal-card" style={{ padding: 40, textAlign: 'center' }}>
          <p className="row-card__meta">Đang tải bảng xếp hạng và đánh giá...</p>
        </div>
      ) : activeTab === 'leaderboard' ? (
        reviews.length === 0 ? (
          <div className="portal-card" style={{ padding: 40, textAlign: 'center' }}>
            <p className="row-card__meta">
              Chưa có bảng tổng kết tháng {selectedMonth}/{selectedYear}. Bấm nút "Tự động tổng hợp số liệu tháng" ở trên để bắt đầu!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {reviews.map((r) => {
              const rankColor =
                r.rankPosition === 1 ? 'var(--portal-rank-gold)' : r.rankPosition === 2 ? 'var(--portal-rank-silver)' : r.rankPosition === 3 ? 'var(--portal-rank-bronze)' : 'var(--portal-muted)';
              return (
                <div
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
                          {r.badge || 'Huấn luyện viên'}
                        </span>
                      </div>

                      <p className="row-card__meta" style={{ margin: '4px 0 0', fontSize: 13 }}>
                        Chuyên môn: <strong>{r.coachSpecialization}</strong> • Đánh giá:{' '}
                        <strong style={{ color: 'var(--portal-star)' }}>
                          {r.averageRating != null ? r.averageRating.toFixed(1) : '0.0'} / 5.0
                        </strong> ({r.totalReviews} lượt) • Tổng số buổi dạy:{' '}
                        <strong>{r.totalSessions} buổi</strong>
                      </p>

                      {r.managerFeedback && (
                        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--portal-muted, #71717a)', fontStyle: 'italic' }}>
                          Lời phê của Quản lý: "{r.managerFeedback}"
                        </p>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 12, color: 'var(--portal-muted, #71717a)' }}>Mức thưởng tháng</span>
                      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--portal-salmon, #ce9180)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatPrice(r.bonusAmount)}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => handleOpenEdit(r)}
                    >
                      Sửa danh hiệu & Thưởng
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Member Reviews Tab */
        memberReviews.length === 0 ? (
          <div className="portal-card" style={{ padding: 40, textAlign: 'center' }}>
            <p className="row-card__meta">Chưa có đánh giá nào từ học viên trong giai đoạn này.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {memberReviews.map((mr) => (
              <div key={mr.id} className="portal-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{mr.memberName}</strong>
                    <span className="row-card__meta" style={{ marginLeft: 8 }}>
                      đánh giá HLV <strong>{mr.coachName}</strong>
                    </span>
                  </div>
                  <span style={{ color: 'var(--portal-star)', fontWeight: 800, fontSize: 15 }}>
                    {'⭐'.repeat(mr.rating)} ({mr.rating} sao)
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--portal-paper, #202020)', lineHeight: 1.5 }}>
                  "{mr.comment || 'Không có nhận xét chi tiết.'}"
                </p>
                <span className="row-card__meta" style={{ display: 'block', marginTop: 6, fontSize: 11 }}>
                  Gửi lúc: {formatCenterDateTime(mr.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Modal Chỉnh sửa Đánh giá & Trao thưởng tháng */}
      {editingReview && (
        <Modal
          title={`Đánh giá tháng & Khen thưởng: HLV ${editingReview.coachName}`}
          onClose={() => setEditingReview(null)}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Thứ hạng (Rank):
              </label>
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
                Danh hiệu trao tặng (Badge / Title):
              </label>
              <input
                type="text"
                className="portal-input"
                placeholder="Ví dụ: Top 1: Coach of the Month 🏆"
                value={editBadge}
                onChange={(e) => setEditBadge(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                Mức thưởng tiền mặt (VNĐ):
              </label>
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
                Nhận xét tổng kết của Quản lý gửi cho Coach:
              </label>
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
                Hủy
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingId !== null}
                onClick={() => void handleSaveEdit()}
              >
                {savingId !== null ? 'Đang lưu…' : 'Lưu & Công bố cho HLV'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

