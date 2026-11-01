import { apiFetch } from '../../shared/api/client';

export interface WorkoutExerciseItem {
  id?: string;
  dayOfWeek: number; // 1 = Thứ 2, 2 = Thứ 3, ..., 7 = Chủ Nhật
  exerciseName: string;
  description?: string;
  sets: number;
  reps: number;
  durationMinutes?: number;
  restSeconds?: number;
  orderIndex?: number;
}

export interface GenerateWorkoutPlanPayload {
  memberId: number;
  additionalRequirements?: string;
  durationWeeks?: number;
}

export interface AiWorkoutPlanResult {
  id: number;
  memberId: number;
  memberCode?: string;
  memberName?: string;
  modelName: string;
  applied?: boolean;
  goal: string;
  analysis: string;
  items: WorkoutExerciseItem[];
  createdAt?: string;
}

export interface TrainingPlanPayload {
  memberId: number;
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  items: WorkoutExerciseItem[];
  status?: 'draft' | 'active';
  isAiGenerated?: boolean;
  aiRecommendationLogId?: number;
}

export interface MemberOption {
  id: number;
  memberCode: string;
  fullName: string;
  fitnessGoal?: string;
  healthNotes?: string;
  fitnessLevel?: string;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
}

export const SAMPLE_MEMBERS: MemberOption[] = [
  {
    id: 1,
    memberCode: 'MB-2026-001',
    fullName: 'Lê Hoàng Long',
    fitnessGoal: 'Tăng khối lượng cơ nạc (Hypertrophy), giảm mỡ bụng dưới.',
    healthNotes: 'Tiền sử thoát vị đĩa đệm nhẹ L4-L5 (năm 2024). Tránh Deadlift tạ nặng.',
    fitnessLevel: 'intermediate',
    heightCm: 175,
    weightKg: 74,
    bmi: 24.2,
  },
  {
    id: 2,
    memberCode: 'MB-2026-014',
    fullName: 'Trần Thị Thu Thảo',
    fitnessGoal: 'Săn chắc cơ mông đùi, tăng cường độ dẻo dai cột sống và cải thiện dáng đứng.',
    healthNotes: 'Khớp cổ tay phải yếu do hội chứng ống cổ tay văn phòng, cần quấn bảo hộ.',
    fitnessLevel: 'beginner',
    heightCm: 160,
    weightKg: 52,
    bmi: 20.3,
  },
  {
    id: 3,
    memberCode: 'MB-2026-027',
    fullName: 'Nguyễn Văn Minh',
    fitnessGoal: 'Chuẩn bị thể lực Half Marathon (21km), tăng sức bền chân và Core.',
    healthNotes: 'Không có tiền sử chấn thương, thể trạng rất tốt.',
    fitnessLevel: 'advanced',
    heightCm: 178,
    weightKg: 69,
    bmi: 21.8,
  },
  {
    id: 4,
    memberCode: 'MB-2026-039',
    fullName: 'Đỗ Quỳnh Anh',
    fitnessGoal: 'Giảm mỡ toàn thân sau sinh, tăng độ săn chắc bụng và lưng trên.',
    healthNotes: 'Khớp gối trái từng chấn thương dây chằng chéo trước, tránh Squat tạ quá sâu.',
    fitnessLevel: 'beginner',
    heightCm: 158,
    weightKg: 57,
    bmi: 22.8,
  },
];

export const aiApi = {
  /**
   * Lấy danh sách học viên thực tế đã ghi danh trong các lớp học từ Backend
   */
  getCoachMembers: async (): Promise<MemberOption[]> => {
    try {
      const classes = await apiFetch<Array<{ id: number }>>('/classes');
      if (!Array.isArray(classes) || classes.length === 0) {
        return SAMPLE_MEMBERS;
      }
      const byMemberId = new Map<number, MemberOption>();
      const rosters = await Promise.allSettled(classes.map(async cls => apiFetch<
        Array<{
          memberId: number;
          membershipCode?: string;
          fullName?: string;
          fitnessGoal?: string;
          healthNotes?: string;
          fitnessLevel?: string;
        }>
      >(`/classes/${cls.id}/students`)));
      for (const roster of rosters) {
        if (roster.status === 'rejected') continue;
        try {
          const students = roster.value;
          if (Array.isArray(students)) {
            for (const s of students) {
              if (s.memberId && !byMemberId.has(s.memberId)) {
                byMemberId.set(s.memberId, {
                  id: s.memberId,
                  memberCode: s.membershipCode || `MEM-${s.memberId}`,
                  fullName: s.fullName || `Hội viên #${s.memberId}`,
                  fitnessGoal: s.fitnessGoal || 'Cải thiện thể lực toàn diện',
                  healthNotes: s.healthNotes || 'Bình thường',
                  fitnessLevel: s.fitnessLevel || 'beginner',
                });
              }
            }
          }
        } catch {
          // Ignore individual class fetch errors
        }
      }
      return byMemberId.size > 0 ? Array.from(byMemberId.values()) : SAMPLE_MEMBERS;
    } catch {
      return SAMPLE_MEMBERS;
    }
  },

  /**
   * Gọi động cơ AI phân tích thể trạng và gợi ý giáo án bài tập cá nhân hóa
   * (POST /api/v1/ai/generate-workout-plan)
   */
  generateWorkoutPlan: async (payload: GenerateWorkoutPlanPayload): Promise<AiWorkoutPlanResult> => {
    const response = await apiFetch<AiWorkoutPlanResult>('/ai/generate-workout-plan', {
      method: 'POST',
      body: JSON.stringify({
        member_id: payload.memberId,
        additional_requirements: payload.additionalRequirements || '',
        duration_weeks: payload.durationWeeks || 4,
      }),
    });
    if (response && response.items && response.items.length > 0) {
      return response;
    }
    throw new Error('Dữ liệu gợi ý giáo án không hợp lệ');
  },

  /**
   * Lưu giáo án huấn luyện vào hệ thống (POST /api/v1/coaching/training-plans)
   * Hỗ trợ tạo + kích hoạt trong 1 bước duy nhất qua tham số status/activate.
   */
  saveTrainingPlan: async (payload: TrainingPlanPayload, activate = true) => {
    const targetStatus = payload.status || (activate ? 'active' : 'draft');
    const shouldActivate = targetStatus === 'active' || activate;
    const plan = await apiFetch<{ id?: number; status?: string }>('/coaching/training-plans', {
      method: 'POST',
      body: JSON.stringify({
        member_id: payload.memberId,
        title: payload.title,
        goal: payload.goal,
        start_date: payload.startDate,
        end_date: payload.endDate,
        status: targetStatus,
        activate: shouldActivate,
        is_ai_generated: payload.isAiGenerated,
        ai_recommendation_id: payload.aiRecommendationLogId,
        items: payload.items.map((item, idx) => ({
          day_of_week: item.dayOfWeek,
          exercise_name: item.exerciseName,
          description: item.description,
          sets: item.sets,
          reps: item.reps,
          duration_minutes: item.durationMinutes || 15,
          order_index: item.orderIndex || idx + 1,
        })),
      }),
    });

    if (shouldActivate && plan?.id && plan?.status !== 'active') {
      await apiFetch(`/coaching/training-plans/${plan.id}/activate`, {
        method: 'PUT',
      });
    }
    return plan;
  },
};
