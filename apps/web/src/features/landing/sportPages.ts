import type { DisciplineId } from '../../shared/lib/disciplines';

/** Bộ môn phụ có trang giới thiệu riêng; Gym là bộ môn chính nên nằm ngay trên trang chủ. */
export type SportPageId = Exclude<DisciplineId, 'gym'>;

export interface SportPageData {
  id: SportPageId;
  path: string;
  /** Nhãn ngắn trên bộ chuyển trang */
  label: string;
  club: string;
  kicker: string;
  title: string;
  subtitle: string;
  image: string;
  stats: { value: string; label: string }[];
  programs: { code: string; title: string; tag: string }[];
}

export const SPORT_PAGES: Record<SportPageId, SportPageData> = {
  swimming: {
    id: 'swimming',
    path: '/swimming',
    label: 'Hồ Bơi',
    club: 'Aquatics Club',
    kicker: 'AQUATICS CLUB',
    title: 'Hồ Bơi Bốn Mùa',
    subtitle: 'Bơi lội · Sức bền · Thả lỏng',
    image: '/images/fitness/aquatics-pool.jpg',
    stats: [
      { value: '06 Làn', label: 'Phân luồng tốc độ' },
      { value: 'Nước Ấm', label: 'Bơi thoải mái 4 mùa' },
      { value: '06:00 — 22:00', label: 'Mở cửa mỗi ngày' },
    ],
    programs: [
      { code: '01', title: 'Làm Quen & Nhịp Thở', tag: 'Dành cho người mới' },
      { code: '02', title: 'Bơi Sải & Sức Bền', tag: 'Kỹ thuật lướt nước' },
      { code: '03', title: 'Thả Lỏng Dưới Nước', tag: 'Phục hồi sau buổi tập' },
    ],
  },
  boxing: {
    id: 'boxing',
    path: '/boxing',
    label: 'Boxing',
    club: 'Boxing Club',
    kicker: 'BOXING CLUB',
    title: 'Phòng Tập Boxing',
    subtitle: 'Kỹ thuật · Phản xạ · Thể lực',
    image: '/images/hero-options/opt5-boxing.jpg',
    stats: [
      { value: '03', label: 'Chương trình tập luyện' },
      { value: 'Theo hiệp', label: 'Nhịp tập có cấu trúc' },
      { value: 'Có HLV', label: 'Hướng dẫn kỹ thuật' },
    ],
    programs: [
      { code: '01', title: 'Kỹ Thuật Đấm Cơ Bản', tag: 'Dành cho người mới' },
      { code: '02', title: 'Bộ Chân & Phản Xạ', tag: 'Di chuyển và né đòn' },
      { code: '03', title: 'Thể Lực Theo Hiệp', tag: 'Sức bền qua từng hiệp' },
    ],
  },
  tennis: {
    id: 'tennis',
    path: '/tennis',
    label: 'Sân Tennis',
    club: 'Tennis Club',
    kicker: 'TENNIS CLUB',
    title: 'Sân Tennis Câu Lạc Bộ',
    subtitle: 'Kỹ thuật · Bộ chân · Đánh đôi',
    image: '/images/fitness/tennis-court.jpg',
    stats: [
      { value: '02 Sân', label: 'Mặt sân tiêu chuẩn' },
      { value: 'Máy Tập', label: 'Hỗ trợ tập cá nhân' },
      { value: '06:00 — 22:00', label: 'Mở cửa mỗi ngày' },
    ],
    programs: [
      { code: '01', title: 'Nhập Môn & Cầm Vợt', tag: 'Cảm giác bóng cơ bản' },
      { code: '02', title: 'Giao Bóng & Lên Lưới', tag: 'Forehand · Backhand · Serve' },
      { code: '03', title: 'Bộ Chân & Đánh Đôi', tag: 'Giao lưu cuối tuần' },
    ],
  },
  badminton: {
    id: 'badminton',
    path: '/badminton',
    label: 'Cầu Lông',
    club: 'Badminton Club',
    kicker: 'BADMINTON CLUB',
    title: 'Sân Cầu Lông',
    subtitle: 'Kỹ thuật · Bộ chân · Đánh đôi',
    image: '/images/fitness/badminton-court.webp',
    stats: [
      { value: '03', label: 'Chương trình tập luyện' },
      { value: 'Đánh đôi', label: 'Luyện thi đấu theo cặp' },
      { value: 'Có HLV', label: 'Hướng dẫn kỹ thuật' },
    ],
    programs: [
      { code: '01', title: 'Cầm Vợt & Cú Đánh Cơ Bản', tag: 'Dành cho người mới' },
      { code: '02', title: 'Bộ Chân & Phản Xạ', tag: 'Di chuyển nhanh trên sân' },
      { code: '03', title: 'Thi Đấu Đôi', tag: 'Giao lưu theo cặp' },
    ],
  },
};

export const SPORT_PAGE_LIST = Object.values(SPORT_PAGES);

/** Nhận `/boxing` hoặc `/sports/boxing`; không khớp trả về `undefined`. */
export function sportIdFromPath(pathname: string): SportPageId | undefined {
  const segment = pathname.replace(/^\/(sports\/)?/, '').split('/')[0];
  return segment in SPORT_PAGES ? (segment as SportPageId) : undefined;
}
