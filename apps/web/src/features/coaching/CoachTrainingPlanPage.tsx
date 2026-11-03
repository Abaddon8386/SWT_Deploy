import React, { useEffect, useMemo, useState } from 'react';
import { getCurrentUser } from '../../shared/api/client';
import { PageHeader } from '../../shared/ui/PageHeader';
import { LoadingSkeleton } from '../../shared/ui/LoadingSkeleton';
import { Modal } from '../../shared/ui/Modal';
import { Select } from '../../shared/ui/Select';
import { DatePicker } from '../../shared/ui/DatePicker';
import { StatusMark } from '../../shared/ui/StatusMark';
import { notify } from '../../shared/lib/portalNotices';
import { formatCenterTime } from '../../shared/lib/centerTime';
import {
  aiApi,
  type CoachOption,
  type MemberOption,
  type WorkoutExerciseItem,
  type AiWorkoutPlanResult,
} from './aiApi';
import { SavedTrainingPlans } from './SavedTrainingPlans';
import './coach-training-plan.css';

// Tạm ẩn các điểm vào AI cho đến khi có provider thực tế.
const AI_UI_ENABLED = true;

const DAYS_OF_WEEK = [
  { id: 1, name: 'Thứ 2' },
  { id: 2, name: 'Thứ 3' },
  { id: 3, name: 'Thứ 4' },
  { id: 4, name: 'Thứ 5' },
  { id: 5, name: 'Thứ 6' },
  { id: 6, name: 'Thứ 7' },
  { id: 7, name: 'Chủ Nhật' },
];

export function CoachTrainingPlanPage() {
  const currentUser = getCurrentUser();

  // Role authorization
  const hasAccess = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.role === 'COACH' || currentUser.role === 'MANAGER';
  }, [currentUser]);

  const isManager = currentUser?.role === 'MANAGER';

  // Danh sách học viên thật (không có dữ liệu mẫu) và thông tin tổng quan giáo án
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState('');
  const [membersAttempt, setMembersAttempt] = useState(0);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  // Manager phải chỉ định Coach phụ trách vì Manager không có hồ sơ Coach của riêng mình
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const [planTitle, setPlanTitle] = useState('Giáo án Cá nhân hóa 4 Tuần');
  const [planGoal, setPlanGoal] = useState('Tăng cường sức mạnh và cải thiện tư thế');
  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 28);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  const handleStartDateChange = (e: { target: { value: string } }) => {
    const val = e.target.value;
    setStartDate(val);
    if (val && endDate && val > endDate) {
      const nextDate = new Date(val);
      nextDate.setDate(nextDate.getDate() + 28);
      const y = nextDate.getFullYear();
      const m = String(nextDate.getMonth() + 1).padStart(2, '0');
      const d = String(nextDate.getDate()).padStart(2, '0');
      setEndDate(`${y}-${m}-${d}`);
    }
  };

  const handleEndDateChange = (e: { target: { value: string } }) => {
    const val = e.target.value;
    if (val && startDate && val < startDate) {
      setDateError('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.');
      return;
    }
    setDateError(null);
    setEndDate(val);
  };

  // Quản lý ngày đang chọn và danh sách bài tập
  const [activeDay, setActiveDay] = useState<number>(1); // 1 = Thứ 2
  const [exercises, setExercises] = useState<WorkoutExerciseItem[]>([
    {
      id: 'ex-init-1',
      dayOfWeek: 1,
      exerciseName: 'Kéo xà trợ lực (Assisted Pull-up)',
      description: 'Hạ thấp vai, siết chặt cơ xô ở điểm co, kiểm soát nhịp thở.',
      sets: 4,
      reps: 10,
      durationMinutes: 12,
      restSeconds: 60,
    },
    {
      id: 'ex-init-2',
      dayOfWeek: 1,
      exerciseName: 'Incline Dumbbell Press',
      description: 'Góc nghiêng ghế 30 độ, siết ngực trên, hạ tạ trong 3 giây.',
      sets: 4,
      reps: 12,
      durationMinutes: 15,
      restSeconds: 60,
    },
  ]);

  // Form thêm động tác mới
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newSets, setNewSets] = useState(4);
  const [newReps, setNewReps] = useState(12);
  const [newRestSeconds, setNewRestSeconds] = useState(60);
  const [newDuration, setNewDuration] = useState(15);
  const [newDescription, setNewDescription] = useState('');
  // Lỗi nhập liệu hiển thị ngay dưới trường tương ứng
  const [exerciseError, setExerciseError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI Modal States
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiSelectedMemberId, setAiSelectedMemberId] = useState<number | null>(null);
  const [aiCoachPrompt, setAiCoachPrompt] = useState(
    'Học viên bận việc văn phòng, chỉ tập được tối đa 3-4 buổi/tuần. Chú ý tiền sử cơ xương khớp để bảo đảm an toàn.'
  );
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiResult, setAiResult] = useState<AiWorkoutPlanResult | null>(null);
  const [appliedRecommendationId, setAppliedRecommendationId] = useState<number | undefined>();

  useEffect(() => {
    if (!hasAccess) return;
    let active = true;
    setMembersLoading(true);
    setMembersError('');
    const loadCoaches = isManager ? aiApi.getActiveCoaches() : Promise.resolve<CoachOption[]>([]);
    void Promise.all([aiApi.getCoachMembers(), loadCoaches]).then(([loaded, loadedCoaches]) => {
      if (!active) return;
      setMembers(loaded);
      setCoaches(loadedCoaches);
      setSelectedCoachId((prev) => (loadedCoaches.some((c) => c.id === prev) ? prev : null));
      setSelectedMemberId((prev) => {
        if (loaded.some((m) => m.id === prev)) return prev;
        if (loaded[0]?.fitnessGoal) setPlanGoal(loaded[0].fitnessGoal);
        return loaded[0]?.id ?? null;
      });
      setAiSelectedMemberId((prev) => (loaded.some((m) => m.id === prev) ? prev : loaded[0]?.id ?? null));
    }).catch(() => {
      if (active) setMembersError('Không thể tải danh sách học viên. Vui lòng thử lại.');
    }).finally(() => {
      if (active) setMembersLoading(false);
    });
    return () => {
      active = false;
    };
  }, [hasAccess, isManager, membersAttempt]);

  // Học viên đang chọn trong form
  const selectedMember: MemberOption | undefined = useMemo(() => {
    return members.find((m) => m.id === selectedMemberId);
  }, [members, selectedMemberId]);

  // Học viên đang chọn trong AI Modal
  const aiSelectedMember: MemberOption | undefined = useMemo(() => {
    return members.find((m) => m.id === aiSelectedMemberId) ?? members[0];
  }, [members, aiSelectedMemberId]);

  // Thêm bài tập thủ công vào ngày đang chọn
  const handleAddExercise = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExerciseName.trim()) {
      setExerciseError('Vui lòng nhập tên động tác.');
      document.getElementById('exercise-name-input')?.focus();
      return;
    }
    setExerciseError(null);

    const item: WorkoutExerciseItem = {
      id: `ex-${Date.now()}`,
      dayOfWeek: activeDay,
      exerciseName: newExerciseName.trim(),
      description: newDescription.trim() || undefined,
      sets: Number(newSets) || 3,
      reps: Number(newReps) || 10,
      durationMinutes: Number(newDuration) || 15,
      restSeconds: Number(newRestSeconds) || 60,
    };

    setExercises((prev) => [...prev, item]);
    setNewExerciseName('');
    setNewDescription('');
  };

  // Xóa bài tập
  const handleRemoveExercise = (id?: string) => {
    if (!id) return;
    setExercises((prev) => prev.filter((item) => item.id !== id));
  };

  // Bài tập thuộc ngày đang chọn
  const dayExercises = useMemo(() => {
    return exercises.filter((item) => item.dayOfWeek === activeDay);
  }, [exercises, activeDay]);

  // Đếm bài tập theo từng ngày
  const countByDay = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const d of DAYS_OF_WEEK) {
      counts[d.id] = exercises.filter((e) => e.dayOfWeek === d.id).length;
    }
    return counts;
  }, [exercises]);

  // Xử lý gọi AI gợi ý
  const handleGenerateAiPlan = async () => {
    if (aiSelectedMemberId == null) return;
    setIsGeneratingAi(true);
    setAiResult(null);
    setAiError(null);
    try {
      const res = await aiApi.generateWorkoutPlan({
        memberId: aiSelectedMemberId,
        additionalRequirements: aiCoachPrompt,
        durationWeeks: 4,
      });
      setAiResult(res);
    } catch {
      setAiError('Không thể tạo gợi ý giáo án bằng AI lúc này. Vui lòng thử lại.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // AC: Nút "Áp dụng vào giáo án"
  const handleApplyAiPlan = () => {
    if (!aiResult || !aiResult.items || aiResult.items.length === 0) return;

    // Cập nhật thông tin hội viên & mục tiêu theo kết quả AI
    setSelectedMemberId(aiResult.memberId);
    setAppliedRecommendationId(aiResult.id);
    setPlanGoal(aiResult.goal);
    setPlanTitle(`Giáo án Cá nhân hóa: ${aiResult.memberName || 'Hội viên'}`);

    // Điền toàn bộ bài tập do AI gợi ý vào danh sách bài tập của HLV
    setExercises(
      aiResult.items.map((item, idx) => ({
        ...item,
        id: `ai-item-${Date.now()}-${idx}`,
      }))
    );

    // Chuyển sang ngày đầu tiên có bài tập
    if (aiResult.items[0]?.dayOfWeek) {
      setActiveDay(aiResult.items[0].dayOfWeek);
    }

    setIsAiModalOpen(false);
    notify('Đã áp dụng giáo án từ AI. Bạn có thể tinh chỉnh trước khi lưu.', 'success');
  };

  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Lưu & Kích hoạt giáo án
  const [isSaving, setIsSaving] = useState(false);
  const [plansRefresh, setPlansRefresh] = useState(0);
  const handleSavePlan = async () => {
    const invalid =
      exercises.length === 0 ? 'Giáo án chưa có bài tập nào. Vui lòng thêm bài tập trước khi lưu.'
        : startDate && endDate && endDate < startDate ? 'Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.'
          : !selectedMember ? 'Chưa xác minh được học viên từ hệ thống. Vui lòng tải lại danh sách học viên.'
            : isManager && selectedCoachId == null ? 'Quản lý cần chọn huấn luyện viên phụ trách trước khi lưu giáo án.'
              : null;
    setPlanError(invalid);
    if (invalid || !selectedMember) return;

    setIsSaving(true);
    try {
      const savedRes = await aiApi.saveTrainingPlan(
        {
          memberId: selectedMember.id,
          coachId: isManager ? selectedCoachId ?? undefined : undefined,
          title: planTitle,
          goal: planGoal,
          startDate,
          endDate,
          items: exercises,
          status: 'active',
          isAiGenerated: appliedRecommendationId !== undefined,
          aiRecommendationLogId: appliedRecommendationId,
        },
        true
      );

      const nowTime = formatCenterTime(new Date().toISOString());
      setLastSavedTime(nowTime);

      // Lưu trữ đồng bộ vào localStorage
      try {
        const storedPlans = JSON.parse(localStorage.getItem('sol_coach_training_plans') || '[]');
        const planRecord = {
          id: (savedRes as { id?: number })?.id || Date.now(),
          memberId: selectedMember.id,
          memberName: selectedMember.fullName,
          title: planTitle,
          goal: planGoal,
          startDate,
          endDate,
          totalExercises: exercises.length,
          status: 'active',
          savedAt: nowTime,
        };
        localStorage.setItem(
          'sol_coach_training_plans',
          JSON.stringify([planRecord, ...storedPlans.filter((p: { id?: number }) => p.id !== planRecord.id)])
        );
      } catch {
        // ignore storage error
      }

      setPlansRefresh((value) => value + 1);
      notify(`Đã lưu và kích hoạt giáo án "${planTitle}" cho học viên ${selectedMember.fullName}.`, 'success');
    } catch {
      notify('Đã xảy ra lỗi khi lưu giáo án. Vui lòng thử lại.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="portal-container">
        <PageHeader eyebrow="Huấn luyện" title="Soạn giáo án bài tập" />
        <div className="portal-card" style={{ padding: '36px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
            <StatusMark type="error" size={56} />
          </div>
          <h2 style={{ color: 'var(--portal-danger)', marginBottom: '8px' }}>Truy cập bị từ chối (403 Forbidden)</h2>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: '500px', margin: '0 auto' }}>
            Bàn làm việc thiết kế giáo án chỉ dành cho tài khoản <strong>Huấn luyện viên (COACH)</strong> hoặc{' '}
            <strong>Quản Lý (MANAGER)</strong>.
          </p>
        </div>
      </div>
    );
  }

  if (membersLoading || membersError) {
    return <div className="portal-container plan-editor-page">
      <PageHeader eyebrow="Huấn luyện &amp; Bài tập" title="Bàn làm việc: Soạn giáo án bài tập" />
      {membersLoading ? <LoadingSkeleton label="Đang tải học viên và thông tin giáo án…" variant="profile" />
        : <div className="portal-card" role="alert"><p>{membersError}</p><button type="button" className="btn-secondary" onClick={() => setMembersAttempt(value => value + 1)}>Thử lại</button></div>}
    </div>;
  }

  if (!selectedMember || !aiSelectedMember) {
    return <div className="portal-container plan-editor-page">
      <PageHeader eyebrow="Huấn luyện &amp; Bài tập" title="Bàn làm việc: Soạn giáo án bài tập" />
      <div className="portal-card" role="status">
        <p><strong>Chưa có học viên để soạn giáo án.</strong></p>
        <p>Danh sách học viên lấy từ các lớp đã có hội viên ghi danh. Khi có hội viên đăng ký lớp, họ sẽ xuất hiện ở đây.</p>
        <button type="button" className="btn-secondary" onClick={() => setMembersAttempt(value => value + 1)}>Tải lại danh sách</button>
      </div>
    </div>;
  }

  return (
    <div className="portal-container plan-editor-page">
      <PageHeader
        eyebrow="Huấn luyện &amp; Bài tập"
        title="Bàn làm việc: Soạn giáo án bài tập"
        actions={
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {AI_UI_ENABLED && <button
              type="button"
              className="btn-ai-sparkle"
              onClick={() => {
                setAiSelectedMemberId(selectedMemberId);
                setIsAiModalOpen(true);
              }}
            >
              <span aria-hidden="true">↗</span>
              <span>Gợi ý giáo án bằng AI</span>
            </button>}

            <button
              type="button"
              className="btn-primary"
              onClick={() => void handleSavePlan()}
              disabled={isSaving || (isManager && selectedCoachId == null)}
              title={isManager && selectedCoachId == null ? 'Chọn huấn luyện viên phụ trách để lưu' : undefined}
            >
              {isSaving ? 'Đang lưu...' : 'Lưu & Kích hoạt giáo án'}
            </button>
          </div>
        }
      />

      {planError && <p className="form-error" role="alert">{planError}</p>}

      {/* Plan Meta Information Card */}
      <div className="plan-meta-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2 className="portal-card-title" style={{ margin: 0, fontSize: '1.2rem' }}>
              Thông tin kế hoạch huấn luyện
            </h2>
            {lastSavedTime && (
              <span className="plan-saved-badge">
                ✓ Đã kích hoạt ({lastSavedTime})
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Tổng số: <strong>{exercises.length} động tác</strong> được thiết lập trong tuần
          </span>
        </div>

        <div className="plan-meta-grid">
          <div>
            <label className="portal-label" htmlFor="plan-title-input">
              Tên giáo án
            </label>
            <input
              id="plan-title-input"
              type="text"
              className="portal-input"
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              placeholder="Ví dụ: Lộ trình Giảm Mỡ Tăng Cơ 4 Tuần..."
            />
          </div>

          <div>
            <label className="portal-label" htmlFor="plan-member-select">
              Học viên thụ hưởng
            </label>
            <Select
              id="plan-member-select"
              className="portal-select"
              value={String(selectedMemberId)}
              onChange={(e) => {
                const id = Number(e.target.value);
                setSelectedMemberId(id);
                setAppliedRecommendationId(undefined);
                const m = members.find((item) => item.id === id);
                if (m?.fitnessGoal) setPlanGoal(m.fitnessGoal);
              }}
            >
              {members.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.fullName} ({m.memberCode})
                </option>
              ))}
            </Select>
          </div>

          {isManager && <div>
            <label className="portal-label" htmlFor="plan-coach-select">
              Huấn luyện viên phụ trách
            </label>
            <Select
              id="plan-coach-select"
              className="portal-select"
              value={selectedCoachId == null ? '' : String(selectedCoachId)}
              onChange={(e) => setSelectedCoachId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">{coaches.length === 0 ? 'Chưa có huấn luyện viên hoạt động' : '— Chọn huấn luyện viên —'}</option>
              {coaches.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.fullName}</option>
              ))}
            </Select>
          </div>}

          <div>
            <label className="portal-label" htmlFor="plan-start-date">
              Ngày bắt đầu
            </label>
            <DatePicker
              id="plan-start-date"
              min={todayStr}
              max={endDate || undefined}
              value={startDate}
              onChange={handleStartDateChange}
            />
          </div>

          <div>
            <label className="portal-label" htmlFor="plan-end-date">
              Ngày kết thúc
            </label>
            <DatePicker
              id="plan-end-date"
              min={startDate || todayStr}
              value={endDate}
              onChange={handleEndDateChange}
            />
            {dateError && <p className="form-error" role="alert">{dateError}</p>}
          </div>
        </div>

        {/* Member Physical Summary Preview */}
        <div
          style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'var(--portal-raised)',
            borderRadius: '8px',
            border: '1px solid var(--portal-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            fontSize: '0.84rem',
          }}
        >
          <div>
            <span>Mục tiêu thể lực: </span>
            <strong style={{ color: 'var(--fit-salmon, #ce9180)' }}>{planGoal}</strong>
          </div>
          <div style={{ color: selectedMember.healthNotes?.includes('Tránh') ? 'var(--portal-danger, #fca5a5)' : 'var(--color-text-muted)' }}>
            Lưu ý sức khỏe: <strong>{selectedMember.healthNotes || 'Bình thường'}</strong>
          </div>
        </div>
      </div>

      {/* Main Workspace: Day Selector & Exercise Form */}
      <div className="portal-card">
        {/* AC: Tab chọn ngày trong tuần */}
        <div className="plan-day-tabs" role="tablist" aria-label="Các ngày trong tuần">
          {DAYS_OF_WEEK.map((d) => {
            const isActive = activeDay === d.id;
            const count = countByDay[d.id] || 0;
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`plan-day-tab ${isActive ? 'is-active' : ''}`}
                onClick={() => setActiveDay(d.id)}
              >
                <span>{d.name}</span>
                <span className="plan-day-badge">{count} bài</span>
              </button>
            );
          })}
        </div>

        {/* AC: Form soạn giáo án theo ngày trong tuần */}
        <form onSubmit={handleAddExercise} className="exercise-form-card">
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--fit-salmon, #ce9180)', marginBottom: '12px' }}>
            + Thêm bài tập mới vào {DAYS_OF_WEEK.find((d) => d.id === activeDay)?.name}
          </div>

          <div className="exercise-form-grid">
            <div>
              <label className="portal-label" htmlFor="exercise-name-input">
                Tên động tác / bài tập *
              </label>
              <input
                id="exercise-name-input"
                type="text"
                className="portal-input"
                placeholder="Ví dụ: Barbell Back Squat, Dumbbell Row..."
                value={newExerciseName}
                aria-invalid={exerciseError ? true : undefined}
                aria-describedby={exerciseError ? 'exercise-name-error' : undefined}
                onChange={(e) => { setNewExerciseName(e.target.value); if (exerciseError) setExerciseError(null); }}
              />
              {exerciseError && <p id="exercise-name-error" className="form-error" role="alert">{exerciseError}</p>}
            </div>

            <div>
              <label className="portal-label" htmlFor="exercise-sets-input">
                Số hiệp (Sets)
              </label>
              <input
                id="exercise-sets-input"
                type="number"
                min={1}
                max={20}
                className="portal-input"
                value={newSets}
                onChange={(e) => setNewSets(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="portal-label" htmlFor="exercise-reps-input">
                Số lần lặp (Reps)
              </label>
              <input
                id="exercise-reps-input"
                type="number"
                min={1}
                max={100}
                className="portal-input"
                value={newReps}
                onChange={(e) => setNewReps(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="portal-label" htmlFor="exercise-rest-input">
                Nghỉ (Giây)
              </label>
              <input
                id="exercise-rest-input"
                type="number"
                step={15}
                min={0}
                className="portal-input"
                value={newRestSeconds}
                onChange={(e) => setNewRestSeconds(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="portal-label" htmlFor="exercise-duration-input">
                Thời lượng (Phút)
              </label>
              <input
                id="exercise-duration-input"
                type="number"
                min={1}
                className="portal-input"
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
              />
            </div>

            <button type="submit" className="btn-secondary" style={{ height: '42px', alignSelf: 'flex-end' }}>
              + Thêm
            </button>
          </div>

          <div style={{ marginTop: '10px' }}>
            <label className="portal-label" htmlFor="exercise-desc-input">
              Ghi chú kỹ thuật / Vùng cơ tác động
            </label>
            <input
              id="exercise-desc-input"
              type="text"
              className="portal-input"
              placeholder="Hướng dẫn học viên siết cơ, tư thế lưng, kiểm soát pha hạ tạ..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
        </form>

        {/* Danh sách động tác của ngày đang chọn */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--portal-paper)' }}>
              Danh sách bài tập {DAYS_OF_WEEK.find((d) => d.id === activeDay)?.name}
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--portal-muted)' }}>
              {dayExercises.length} động tác đã lập
            </span>
          </div>

          {dayExercises.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                border: '2px dashed var(--portal-border-strong)',
                borderRadius: '8px',
                color: 'var(--portal-muted)',
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--portal-salmon)', marginBottom: '8px' }}>GIÁO ÁN NGÀY</div>
              <div style={{ fontWeight: 600 }}>Chưa có bài tập nào cho ngày này</div>
              <p style={{ margin: '4px 0 14px 0', fontSize: '0.84rem' }}>
                Thêm bài tập bằng form ở trên để xây dựng giáo án cho học viên.
              </p>
            </div>
          ) : (
            <div className="exercise-items-list">
              {dayExercises.map((item, index) => (
                <div key={item.id || index} className="exercise-item-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <span
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'var(--portal-raised)',
                        border: '1px solid var(--portal-border)',
                        color: 'var(--portal-salmon)',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {index + 1}
                    </span>

                    <div className="exercise-item-main">
                      <div className="exercise-item-name">{item.exerciseName}</div>
                      {item.description && <div className="exercise-item-desc">{item.description}</div>}
                    </div>
                  </div>

                  <div className="exercise-item-specs">
                    <div className="exercise-spec-pill">
                      Hiệp: <strong>{item.sets}</strong>
                    </div>
                    <div className="exercise-spec-pill">
                      Lần: <strong>{item.reps} reps</strong>
                    </div>
                    {item.restSeconds != null && (
                      <div className="exercise-spec-pill">
                        Nghỉ: <strong>{item.restSeconds}s</strong>
                      </div>
                    )}
                    {item.durationMinutes != null && (
                      <div className="exercise-spec-pill">
                        Thời gian: <strong>{item.durationMinutes}p</strong>
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn-remove-exercise"
                      aria-label={`Xóa bài tập ${item.exerciseName}`}
                      onClick={() => handleRemoveExercise(item.id)}
                      title="Xóa bài tập này"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AC: Modal Tương Tác AI Gợi Ý Giáo Án */}
      {AI_UI_ENABLED && isAiModalOpen && (
        <Modal title="Trợ lý AI: gợi ý giáo án huấn luyện cá nhân hóa" onClose={() => setIsAiModalOpen(false)}>
          <div className="ai-modal-container">
            <div>
              <label className="portal-label" htmlFor="ai-member-select">
                Chọn học viên cần thiết kế giáo án
              </label>
              <Select
                id="ai-member-select"
                className="portal-select"
                value={String(aiSelectedMemberId)}
                onChange={(e) => setAiSelectedMemberId(Number(e.target.value))}
                disabled={isGeneratingAi}
              >
                {members.map((m) => (
                  <option key={m.id} value={String(m.id)}>
                    {m.fullName} ({m.memberCode}) — Mục tiêu: {m.fitnessGoal?.slice(0, 40)}...
                  </option>
                ))}
              </Select>
            </div>

            {/* Xem nhanh chỉ số thể chất của học viên */}
            <div className="ai-member-preview">
              <div>
                <div className="ai-member-stat-label">Chiều cao / Cân nặng</div>
                <div className="ai-member-stat-val">
                  {aiSelectedMember.heightCm ?? '—'} cm / {aiSelectedMember.weightKg ?? '—'} kg
                </div>
              </div>
              <div>
                <div className="ai-member-stat-label">Chỉ số BMI</div>
                <div className="ai-member-stat-val">{aiSelectedMember.bmi ?? '—'}</div>
              </div>
              <div>
                <div className="ai-member-stat-label">Trình độ luyện tập</div>
                <div className="ai-member-stat-val" style={{ textTransform: 'capitalize' }}>
                  {aiSelectedMember.fitnessLevel}
                </div>
              </div>
            </div>

            {/* Lưu ý y tế & Tiền sử chấn thương */}
            {aiSelectedMember.healthNotes && (
              <div className="ai-caution-box">
                <strong>Tiền sử sức khỏe &amp; chấn thương: </strong>
                {aiSelectedMember.healthNotes}
              </div>
            )}

            <div>
              <label className="portal-label" htmlFor="ai-prompt-input">
                Yêu cầu bổ sung của HLV gửi tới AI (Số buổi tập, trọng tâm, lưu ý đặc biệt...)
              </label>
              <textarea
                id="ai-prompt-input"
                className="ai-prompt-textarea"
                value={aiCoachPrompt}
                onChange={(e) => setAiCoachPrompt(e.target.value)}
                placeholder="Ví dụ: Hội viên tập 4 buổi/tuần, muốn tăng kích thước cơ ngực và mông, tránh tạ đè nén khớp gối..."
                disabled={isGeneratingAi}
              />
            </div>

            {/* Nút bấm kích hoạt AI */}
            <div style={{ textAlign: 'right', marginBottom: '14px' }}>
              <button
                type="button"
                className="btn-ai-sparkle"
                onClick={() => void handleGenerateAiPlan()}
                disabled={isGeneratingAi}
              >
                <span aria-hidden="true">↗</span>
                <span>{isGeneratingAi ? 'Đang phân tích...' : 'Phân tích & Sinh giáo án bằng AI'}</span>
              </button>
            </div>

            {aiError && <p className="form-error" role="alert">{aiError}</p>}

            {/* Trạng thái Loading AI */}
            {isGeneratingAi && (
              <LoadingSkeleton label="Đang phân tích và tạo gợi ý giáo án…" count={4} />
            )}

            {/* Kết quả AI trả về */}
            {aiResult && !isGeneratingAi && (
              <div className="ai-result-box">
                <div className="ai-result-header">
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--portal-salmon)' }}>
                    🎯 Phân tích chuyên sâu từ AI ({aiResult.modelName})
                  </span>
                  <span className="badge badge-success">Đã hoàn thành đề xuất</span>
                </div>

                <div className="ai-analysis-text">{aiResult.analysis}</div>

                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px', color: 'var(--portal-paper)' }}>
                  Đề xuất {aiResult.items.length} bài tập theo chu kỳ tuần:
                </div>

                <div style={{ maxHeight: '220px', overflowY: 'auto', paddingRight: '4px' }}>
                  {aiResult.items.map((item, idx) => (
                    <div key={idx} className="ai-suggested-item">
                      <div>
                        <strong>{DAYS_OF_WEEK.find((d) => d.id === item.dayOfWeek)?.name}:</strong> {item.exerciseName}
                        <div style={{ fontSize: '0.78rem', color: 'var(--portal-muted)' }}>{item.description}</div>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--portal-salmon)', whiteSpace: 'nowrap' }}>
                        {item.sets} hiệp × {item.reps} lần
                      </div>
                    </div>
                  ))}
                </div>

                {/* AC: Nút "Áp dụng vào giáo án" */}
                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setIsAiModalOpen(false)}>
                    Hủy bỏ
                  </button>
                  <button type="button" className="btn-ai-sparkle" onClick={handleApplyAiPlan}>
                    <span>✓</span>
                    <span>Áp dụng vào giáo án</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      <SavedTrainingPlans refreshKey={plansRefresh} />
    </div>
  );
}
