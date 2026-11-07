import { sourceText } from "../shop/shopI18n";
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
  programs: { code: string; title: string; tag: string }[];
}

export const SPORT_PAGES: Record<SportPageId, SportPageData> = {
  swimming: {
    id: 'swimming',
    path: '/swimming',
    get label() { return sourceText('Hồ Bơi'); },
    get club() { return sourceText('Aquatics Club'); },
    get kicker() { return sourceText('AQUATICS CLUB'); },
    get title() { return sourceText('Hồ Bơi Bốn Mùa'); },
    get subtitle() { return sourceText('Bơi lội · Sức bền · Thả lỏng'); },
    image: '/images/fitness/aquatics-pool.jpg',
    programs: [
      { code: '01', get title() { return sourceText('Làm Quen & Nhịp Thở'); }, get tag() { return sourceText('Dành cho người mới'); } },
      { code: '02', get title() { return sourceText('Bơi Sải & Sức Bền'); }, get tag() { return sourceText('Kỹ thuật lướt nước'); } },
      { code: '03', get title() { return sourceText('Thả Lỏng Dưới Nước'); }, get tag() { return sourceText('Phục hồi sau buổi tập'); } },
    ],
  },
  boxing: {
    id: 'boxing',
    path: '/boxing',
    label: 'Boxing',
    get club() { return sourceText('Boxing Club'); },
    get kicker() { return sourceText('BOXING CLUB'); },
    get title() { return sourceText('Phòng Tập Boxing'); },
    get subtitle() { return sourceText('Kỹ thuật · Phản xạ · Thể lực'); },
    image: '/images/hero-options/opt5-boxing.jpg',
    programs: [
      { code: '01', get title() { return sourceText('Kỹ Thuật Đấm Cơ Bản'); }, get tag() { return sourceText('Dành cho người mới'); } },
      { code: '02', get title() { return sourceText('Bộ Chân & Phản Xạ'); }, get tag() { return sourceText('Di chuyển và né đòn'); } },
      { code: '03', get title() { return sourceText('Thể Lực Theo Hiệp'); }, get tag() { return sourceText('Sức bền qua từng hiệp'); } },
    ],
  },
  tennis: {
    id: 'tennis',
    path: '/tennis',
    get label() { return sourceText('Sân Tennis'); },
    get club() { return sourceText('Tennis Club'); },
    get kicker() { return sourceText('TENNIS CLUB'); },
    get title() { return sourceText('Sân Tennis Câu Lạc Bộ'); },
    get subtitle() { return sourceText('Kỹ thuật · Bộ chân · Đánh đôi'); },
    image: '/images/fitness/tennis-court.jpg',
    programs: [
      { code: '01', get title() { return sourceText('Nhập Môn & Cầm Vợt'); }, get tag() { return sourceText('Cảm giác bóng cơ bản'); } },
      { code: '02', get title() { return sourceText('Giao Bóng & Lên Lưới'); }, tag: 'Forehand · Backhand · Serve' },
      { code: '03', get title() { return sourceText('Bộ Chân & Đánh Đôi'); }, get tag() { return sourceText('Giao lưu cuối tuần'); } },
    ],
  },
  badminton: {
    id: 'badminton',
    path: '/badminton',
    get label() { return sourceText('Cầu Lông'); },
    get club() { return sourceText('Badminton Club'); },
    get kicker() { return sourceText('BADMINTON CLUB'); },
    get title() { return sourceText('Sân Cầu Lông'); },
    get subtitle() { return sourceText('Kỹ thuật · Bộ chân · Đánh đôi'); },
    image: '/images/fitness/badminton-court.webp',
    programs: [
      { code: '01', get title() { return sourceText('Cầm Vợt & Cú Đánh Cơ Bản'); }, get tag() { return sourceText('Dành cho người mới'); } },
      { code: '02', get title() { return sourceText('Bộ Chân & Phản Xạ'); }, get tag() { return sourceText('Di chuyển nhanh trên sân'); } },
      { code: '03', get title() { return sourceText('Thi Đấu Đôi'); }, get tag() { return sourceText('Giao lưu theo cặp'); } },
    ],
  },
  yoga: {
    id: 'yoga',
    path: '/yoga',
    label: 'Yoga',
    club: 'Yoga Studio',
    kicker: 'YOGA STUDIO',
    get title() { return sourceText('Phòng Tập Yoga'); },
    get subtitle() { return sourceText('Hơi thở · Thăng bằng · Linh hoạt'); },
    image: '/images/yoga-aerial-silk-studio.jpg',
    programs: [
      { code: '01', get title() { return sourceText('Hơi Thở & Tư Thế'); }, get tag() { return sourceText('Dành cho người mới'); } },
      { code: '02', get title() { return sourceText('Thăng Bằng & Linh Hoạt'); }, get tag() { return sourceText('Kiểm soát chuyển động'); } },
      { code: '03', get title() { return sourceText('Giãn Cơ & Thư Giãn'); }, get tag() { return sourceText('Phục hồi sau buổi tập'); } },
    ],
  },
};

export const SPORT_PAGE_LIST = Object.values(SPORT_PAGES);

/** Nhận `/boxing` hoặc `/sports/boxing`; không khớp trả về `undefined`. */
export function sportIdFromPath(pathname: string): SportPageId | undefined {
  const segment = pathname.replace(/^\/(sports\/)?/, '').split('/')[0];
  return segment in SPORT_PAGES ? (segment as SportPageId) : undefined;
}
