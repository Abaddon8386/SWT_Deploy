import { staffSourceError } from '../operations/staffI18n';
import type { ExerciseValues } from './trainingExercise';
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
  /** Bắt buộc khi Manager soạn giáo án; Coach luôn dùng danh tính của chính mình. */
  coachId?: number;
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

export interface CoachOption {
  id: number;
  fullName: string;
  email?: string;
}

export interface SavedTrainingPlanItem extends ExerciseValues { id: number }

export interface SavedTrainingPlan {
  id: number;
  memberId: number;
  memberName?: string | null;
  coachId?: number | null;
  coachName?: string | null;
  goal: string | null;
  startDate: string;
  endDate: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled' | string;
  aiGenerated?: boolean;
  items?: SavedTrainingPlanItem[];
}

export const aiApi = {
  /** Giáo án đã lưu trên server: Coach thấy của mình, Manager thấy tất cả. */
  listTrainingPlans: () => apiFetch<SavedTrainingPlan[]>('/coaching/training-plans'),

  updateTrainingPlan: (id: number, input: { goal: string; startDate: string; endDate: string; items?: SavedTrainingPlanItem[] }) =>
    apiFetch<SavedTrainingPlan>(`/coaching/training-plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ goal: input.goal, start_date: input.startDate, end_date: input.endDate, items: input.items }),
    }),

  /** Xóa bản nháp; ngừng áp dụng giáo án active và giữ lịch sử tập. */
  deleteTrainingPlan: (id: number) => apiFetch<void>(`/coaching/training-plans/${id}`, { method: 'DELETE' }),

  /**
   * Lấy danh sách học viên thực tế đã ghi danh trong các lớp học từ Backend.
   * Danh sách rỗng nghĩa là chưa có học viên; lỗi tải được ném ra để UI báo lỗi, không bao giờ thay bằng dữ liệu mẫu.
   */
  getCoachMembers: (): Promise<MemberOption[]> => apiFetch<MemberOption[]>('/coaching/members'),

  /** Huấn luyện viên đang hoạt động để Manager chọn người phụ trách giáo án. */
  getActiveCoaches: async (): Promise<CoachOption[]> => {
    const coaches = await apiFetch<CoachOption[]>('/classes/coaches');
    return Array.isArray(coaches) ? coaches : [];
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
    throw staffSourceError('Dữ liệu gợi ý giáo án không hợp lệ', 'Invalid training suggestion data.');
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
        ...(payload.coachId != null ? { coach_id: payload.coachId } : {}),
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
          rest_seconds: item.restSeconds,
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
