import { LoadingImage } from '../../../shared/ui/LoadingImage';
import { DISCIPLINES } from '../../../shared/lib/disciplines';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { getCurrentUser, homePath } from '../../../shared/api/client';
import { usePublicCatalog } from '../publicCatalog';
import { CatalogPackages, CatalogStatus, CatalogTrainers } from './CatalogSections';
import { ProductShelf } from './ProductShelf';
import { RoundArrow } from './PublicLayout';
import { SplitHeading } from './SplitHeading';
import { SportStack } from './SportStack';

const tickerItems = [
  ...DISCIPLINES.map(discipline => discipline.name.toUpperCase()),
  'STRENGTH FLOOR',
  'MOVEMENT STUDIO',
  'FREE WEIGHTS',
  'BARBELL CLUB',
  'GROUP TRAINING',
];

const manifestoWords = 'Mạnh mẽ trong phòng tạ. Linh hoạt qua từng chuyển động. Bền bỉ sau mỗi hiệp tập.'.split(' ');

const services = [
  { title: 'WeightLifting', description: 'Tập tạ đúng kỹ thuật, tăng sức mạnh nền tảng.', icon: 'weights' },
  { title: 'Private Training', description: 'Huấn luyện 1:1 theo nhịp độ riêng.', icon: 'training' },
  { title: 'Build Muscle', description: 'Phát triển cơ bắp săn chắc, cân đối.', icon: 'muscle' },
];
const serviceShapes = [
  'M37 30L259 0Q290-2 295 32L319 231Q323 280 279 280H72Q33 280 27 241L1 80Q-5 40 37 30Z',
  'M42 0H278Q322 0 316 44L294 242Q290 280 251 280H69Q30 280 26 242L4 44Q-2 0 42 0Z',
  'M61 0L283 30Q325 40 319 80L293 241Q287 280 248 280H41Q-3 280 1 231L25 32Q30-2 61 0Z',
];
const clubMetrics = [
  { value: '06:00 — 22:00', countTo: 22, format: (n: number) => `06:00 — ${String(n).padStart(2, '0')}:00`, label: 'MỞ CỬA MỖI NGÀY' },
  { value: '05 Zones', countTo: 5, format: (n: number) => `${String(n).padStart(2, '0')} Zones`, label: 'TỔ HỢP ĐA BỘ MÔN' },
  { value: 'Lịch lớp', label: 'ĐẶT CHỖ TRỰC TUYẾN' },
  { value: 'QR Pass', label: '01 THẺ ĐA PHÂN KHU' },
];
const MUSCLE_CLOSE_DELAY_MS = 600;

const muscleGroups = [
  {
    id: 'chest',
    name: 'Cơ Ngực (Pectorals)',
    zone: 'UPPER & MID CHEST',
    goal: 'Tăng độ dày & đường nét khung ngực',
    tip: 'Hạ tạ có kiểm soát 2–3 giây và khép bả vai để giảm tải khớp vai trước.',
    exercises: [
      'Incline Dumbbell Press · 4 hiệp × 8–10 lần',
      'Cable Chest Fly · 3 hiệp × 12 lần',
    ],
    side: 'right' as const,
    origin: { x: 655, y: 485 },
    elbow: { x: 875, y: 980 },
    tipPoint: { x: 1015, y: 980 },
    calloutTop: '64%',
    paths: [
      'M 455 395 C 495 375, 550 385, 580 420 C 615 385, 680 380, 725 415 C 742 475, 720 565, 650 585 C 610 592, 588 570, 576 550 C 562 575, 522 595, 472 582 C 442 560, 438 465, 455 395 Z',
    ],
  },
  {
    id: 'shoulders',
    name: 'Cơ Vai & Cầu Vai (Deltoids & Traps)',
    zone: 'DELTOIDS & TRAPS',
    goal: 'Mở rộng khung vai & ổn định khớp bả vai',
    tip: 'Đẩy tạ trong mặt phẳng xương bả vai (góc 30°) để bảo vệ khớp xoay vai.',
    exercises: [
      'Seated Dumbbell Overhead Press · 4 hiệp × 8–10 lần',
      'Lateral Raise & Face Pull · 4 hiệp × 12–15 lần',
    ],
    side: 'left' as const,
    origin: { x: 355, y: 415 },
    elbow: { x: 165, y: 325 },
    tipPoint: { x: 10, y: 325 },
    calloutTop: '22%',
    paths: [
      'M 485 288 C 430 305, 365 348, 325 405 C 305 445, 308 495, 325 522 C 375 532, 425 510, 445 455 C 455 410, 472 365, 495 345 Z',
      'M 635 295 C 695 315, 765 345, 815 405 C 838 445, 840 495, 822 522 C 782 528, 745 505, 725 445 C 705 395, 672 365, 630 348 Z',
    ],
  },
  {
    id: 'arms',
    name: 'Bắp Tay Trước & Tay Sau (Biceps & Triceps)',
    zone: 'BICEPS & TRICEPS',
    goal: 'Phát triển lực kéo – đẩy đối xứng',
    tip: 'Cố định khuỷu tay sát thân người khi cuộn tạ hoặc kéo cáp.',
    exercises: [
      'Incline Dumbbell Curl · 3 hiệp × 10–12 lần',
      'Rope Triceps Pushdown · 4 hiệp × 12 lần',
    ],
    side: 'left' as const,
    origin: { x: 335, y: 595 },
    elbow: { x: 155, y: 525 },
    tipPoint: { x: 10, y: 525 },
    calloutTop: '35%',
    paths: [
      'M 315 505 C 365 518, 422 518, 442 565 C 450 625, 442 685, 425 718 C 368 722, 312 695, 300 625 C 292 575, 298 532, 315 505 Z',
      'M 748 505 C 795 495, 848 515, 875 575 C 895 620, 888 668, 855 685 C 805 685, 768 645, 745 585 Z',
    ],
  },
  {
    id: 'core',
    name: 'Cơ Bụng & Liên Sườn (Core & Obliques)',
    zone: 'ABS & OBLIQUES',
    goal: 'Siết cơ trọng tâm & truyền lực xoay',
    tip: 'Thở ra nén chặt thành bụng, tránh võng thắt lưng.',
    exercises: [
      'Hanging Knee Raise · 3 hiệp × 12 lần',
      'Cable Pallof Press & Plank · 3 hiệp × 45 giây',
    ],
    side: 'right' as const,
    origin: { x: 615, y: 665 },
    elbow: { x: 875, y: 1030 },
    tipPoint: { x: 1015, y: 1030 },
    calloutTop: '67%',
    paths: [
      'M 455 575 C 515 595, 625 595, 692 572 C 685 645, 670 725, 655 772 C 595 785, 505 785, 440 765 C 435 705, 442 635, 455 575 Z',
    ],
  },
  {
    id: 'forearms',
    name: 'Cẳng Tay & Lực Nắm (Forearms & Grip)',
    zone: 'FOREARMS & GRIP',
    goal: 'Tăng lực cầm tạ & ổn định cổ tay khi cầm vợt',
    tip: 'Giữ cổ tay thẳng trục với cẳng tay trong mọi bài kéo và đánh bóng.',
    exercises: [
      'Farmer’s Walk · 3 hiệp × 40m',
      'Reverse Curl & Dead Hang · 3 hiệp × 40 giây',
    ],
    side: 'left' as const,
    origin: { x: 355, y: 835 },
    elbow: { x: 165, y: 760 },
    tipPoint: { x: 10, y: 760 },
    calloutTop: '50%',
    paths: [
      'M 312 695 C 365 705, 422 715, 432 775 C 425 895, 422 1015, 442 1115 C 425 1162, 365 1165, 345 1115 C 338 985, 315 835, 312 695 Z',
      'M 815 655 C 868 655, 902 688, 892 735 C 845 795, 785 845, 725 905 C 675 912, 642 885, 655 835 C 705 765, 765 705, 815 655 Z',
    ],
  },
  {
    id: 'legs',
    name: 'Cơ Đùi & Bắp Chân (Quads & Calves)',
    zone: 'QUADS & CALVES',
    goal: 'Sức mạnh thân dưới & tốc độ bứt tốc trên sân',
    tip: 'Mở hướng đầu gối theo mũi chân và kiểm soát nhịp gập hông – gối.',
    exercises: [
      'Barbell / Goblet Squat · 4 hiệp × 8–10 lần',
      'Bulgarian Split Squat & Calf Raise · 3 hiệp × 12 lần',
    ],
    side: 'right' as const,
    origin: { x: 885, y: 925 },
    elbow: { x: 955, y: 1060 },
    tipPoint: { x: 1015, y: 1060 },
    calloutTop: '69%',
    paths: [
      'M 315 780 C 235 765, 155 805, 132 895 C 105 1015, 118 1175, 162 1340 L 245 1340 C 268 1195, 278 1055, 248 945 C 295 925, 322 865, 315 780 Z',
      'M 765 795 C 845 775, 925 805, 948 895 C 972 1015, 958 1175, 915 1340 L 832 1340 C 808 1195, 798 1055, 825 945 C 782 925, 758 865, 765 795 Z',
    ],
  },
] as const;

const coachAvatars = [
  { name: 'Derek', image: 'coach-strength.webp' },
  { name: 'Anthony', image: 'coach-aquatics.jpg' },
  { name: 'Huỳnh Đắc Tài', image: 'coach-personal.jpg' },
];

const dailyRhythmItems = [
  {
    id: 'morning' as const,
    label: 'Sáng · 06:00–09:00',
    title: 'Khởi động thể lực sáng sớm',
    highlights: ['Morning Strength', 'Bơi sáng', 'Tennis'],
  },
  {
    id: 'midday' as const,
    label: 'Trưa · 11:30–14:00',
    title: 'Tập gọn 45 phút giờ nghỉ trưa',
    highlights: ['Kèm 1:1', 'Core & Mobility', 'Thả lỏng'],
  },
  {
    id: 'evening' as const,
    label: 'Chiều · 17:00–19:30',
    title: 'Nhịp tập sôi động sau giờ làm',
    highlights: ['Barbell Club', 'Lớp Bơi', 'Đánh đôi Tennis'],
  },
  {
    id: 'night' as const,
    label: 'Tối · 19:30–22:00',
    title: 'Vận động nhẹ & Giãn cơ cuối ngày',
    highlights: ['Tập cá nhân', 'Bơi thư giãn', 'Giãn cơ'],
  },
] as const;

const spaces = [
  { title: 'Không gian cho những mục tiêu lớn.', image: '/images/fitness/gym-floor.jpg', label: 'Strength floor', meta: 'Khu máy tập' },
  { title: 'Tập trung vào từng chuyển động.', image: '/images/fitness/strength-session.jpg', label: 'Free weights', meta: 'Khu tạ rời & Power Rack' },
  { title: 'Tìm lại nhịp điệu của chính mình.', image: '/images/about-movement-studio.jpg', label: 'Movement studio', meta: 'Core & Giãn cơ' },
  { title: 'Làn nước xanh mát bốn mùa.', image: '/images/fitness/aquatics-pool.jpg', label: 'Aquatics pool', meta: 'Hồ bơi bốn mùa' },
  { title: 'Sân đấu giàu năng lượng.', image: '/images/fitness/tennis-court.jpg', label: 'Tennis courts', meta: 'Sân Tennis CLB' },
];

const journeySteps = [
  { step: '01', title: 'Tạo tài khoản & chọn gói tập', description: 'Đăng ký trực tuyến nhanh gọn.' },
  { step: '02', title: 'Cập nhật chỉ số & mục tiêu', description: 'Nhận gợi ý lộ trình theo BMI.' },
  { step: '03', title: 'Đặt lịch & quét QR check-in', description: 'Giữ chỗ & vào cửa bằng thẻ QR.' },
];
const memberBenefits = [
  {
    tag: 'Bộ môn',
    idx: '01',
    title: 'Đặt lịch tập trên Portal',
    description: 'Xem lịch lớp theo bộ môn trong Portal. Bạn có thể đặt lớp khi gói tập đang hoạt động, còn hạn và còn lượt đặt theo quy định của gói.',
    perks: [
      'Gym · Bơi lội · Boxing · Tennis · Cầu lông · Yoga',
      'Khu Strength Floor, Free Weights & Movement Studio',
      'Thấy ngay khung giờ nào đang thoáng',
      'Vào cửa bằng mã QR, không cần giấy tờ',
    ],
  },
  {
    tag: 'Lớp',
    idx: '02',
    title: 'Lớp nhóm theo gói tập',
    description: 'Xem bộ môn, huấn luyện viên và chỗ trống trên lịch lớp. Số lượt đặt lớp phụ thuộc vào gói tập bạn đã kích hoạt.',
    perks: [
      'Lịch lớp sáng — chiều — tối mỗi ngày',
      'Biết trước HLV, studio, giờ, còn bao nhiêu chỗ',
      'Điểm danh bằng mã QR thành viên',
      'Đổi lớp nếu lịch cá nhân thay đổi',
    ],
  },
  {
    tag: 'HLV',
    idx: '03',
    title: 'HLV theo dõi từng buổi tập',
    description: 'Mỗi buổi HLV ghi lại chỉ số của bạn — mức tạ, số lần tập, thời gian và tiến độ. Bạn xem lại tiến độ cá nhân bất cứ lúc nào.',
    perks: [
      'HLV có chứng chỉ đúng từng bộ môn',
      'Kết quả từng buổi, lưu trên Portal',
      'Theo dõi chuỗi ngày tập theo tuần / tháng',
      'Đánh giá định kỳ từ HLV',
    ],
  },
  {
    tag: 'Kế hoạch',
    idx: '04',
    title: 'Kế hoạch tuần cho riêng bạn',
    description: 'Dựa trên chỉ số BMI và mục tiêu cá nhân, hệ thống đề xuất lịch tập tuần cân bằng giữa Gym, Bơi và Tennis; có trợ lý giải đáp 24/7.',
    perks: [
      'Kế hoạch theo mục tiêu: giảm mỡ, tăng cơ, sức bền',
      'HLV định hướng lộ trình đa bộ môn',
      'Nhắc lịch tập và lịch sân trực tuyến',
      'Hỏi đáp bài tập & bảo lưu (Freeze) dễ dàng',
    ],
  },
] as const;
const faqs = [
  {
    question: 'Người mới bắt đầu có theo kịp không?',
    answer: 'Có. Mỗi bộ môn đều có lớp nhập môn hướng dẫn từ cơ bản.',
  },
  {
    question: 'Gói hội viên đã bao gồm những bộ môn nào?',
    answer: 'Quyền lợi, thời hạn và số lượt đặt lớp được hiển thị theo từng gói tại bảng giá và Portal. Hãy xem mô tả gói hoặc liên hệ lễ tân để xác nhận phạm vi sử dụng.',
  },
  {
    question: 'Tôi có thể tạm dừng (bảo lưu) gói tập khi bận công tác không?',
    answer: 'Có. Bạn gửi yêu cầu bảo lưu (Freeze) trực tiếp trên Portal hội viên.',
  },
  {
    question: 'Làm sao để đặt lớp học hoặc đặt sân?',
    answer: 'Đăng nhập vào Portal để xem lịch lớp và chỗ trống. Để đặt lớp, bạn cần có gói tập đang hoạt động, còn hạn và còn lượt đặt theo gói.',
  },
];

function CountUpMetric({ value, countTo, format }: { value: string; countTo: number; format: (n: number) => string }) {
  const ref = useRef<HTMLElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) {
      setDisplay(value);
      return;
    }
    let rafId = 0;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !preference.matches) {
          cancelAnimationFrame(rafId);
          const start = performance.now();
          const duration = 1200;
          const step = (now: number) => {
            const elapsed = Math.min(1, (now - start) / duration);
            const eased = 1 - ((1 - elapsed) ** 3);
            const current = Math.max(1, Math.round(eased * countTo));
            setDisplay(elapsed >= 1 ? value : format(current));
            if (elapsed < 1) rafId = requestAnimationFrame(step);
          };
          rafId = requestAnimationFrame(step);
        }
      });
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
    };
  }, [value, countTo, format]);

  return <strong ref={ref}>{display}</strong>;
}

function ServiceIcon({ type }: { type: string }) {
  return <svg className="fit-service-icon" viewBox="0 0 64 64" fill="none" stroke="#805e50" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {type === 'weights' ? <g transform="translate(0 -1.5)">
      <path d="M6 17h52" /><rect x="3" y="10" width="5" height="15" rx="1" fill="#ada59a" /><rect x="10" y="7" width="5" height="21" rx="1" fill="#c8bfb3" /><rect x="49" y="7" width="5" height="21" rx="1" fill="#c8bfb3" /><rect x="56" y="10" width="5" height="15" rx="1" fill="#ada59a" />
      <path d="m26 28-6-5V13h5v7l5 4h4l5-4v-7h5v10l-6 5 1 13H25Z" fill="#ebc18c" /><circle cx="32" cy="18" r="6" fill="#ebc18c" /><path d="M27 14c0-5 10-5 10 0" fill="#705648" /><path d="m25 40-2 10 5 1 4-8 4 8 5-1-2-10Z" fill="#e69e87" /><path d="m23 50-1 10h6l1-9m6 0 1 9h6l-1-10" fill="#ebc18c" /><path d="M21 60h8m6 0h8M29 32h6" />
    </g> : type === 'training' ? <g>
      <g transform="rotate(-37 34 23)"><path d="M15 22h36v5H15Z" fill="#e6a08a" /><rect x="10" y="15" width="7" height="19" rx="2" fill="#e6907e" /><rect x="4" y="18" width="6" height="13" rx="1" fill="#e6907e" /><rect x="49" y="15" width="7" height="19" rx="2" fill="#e6907e" /><rect x="56" y="18" width="5" height="13" rx="1" fill="#e6907e" /></g>
      <path d="M14 44h34v5H14Z" fill="#e8d6b9" /><rect x="9" y="35" width="7" height="23" rx="2" fill="#ded2c1" /><rect x="3" y="39" width="6" height="15" rx="1" fill="#ded2c1" /><rect x="47" y="35" width="7" height="23" rx="2" fill="#ded2c1" /><rect x="54" y="39" width="6" height="15" rx="1" fill="#ded2c1" />
    </g> : <g transform="translate(-2.5 5)">
      <path d="M12 44c-1-10 2-21 7-29l10 4-5 13c8-8 17-6 21-1l7 8 2 10c-12 8-29 7-42-5Z" fill="#e9c59b" /><path d="m19 15 2-9 9 1 4 8-5 4m-8-4 4-4 4 3M32 34c0 6 4 10 9 10m-22 0c3 3 8 4 12 3M47 44l8-3" />
      <circle cx="48" cy="13" r="10" fill="#edc7a5" /><path d="M48 18s-7-4-5-8c1-2 4-2 5 0 2-2 5-2 6 0 2 4-6 8-6 8Z" fill="#df9785" />
    </g>}
  </svg>;
}

const handleCardPointerMove = (event: PointerEvent<HTMLElement>) => {
  const rect = event.currentTarget.getBoundingClientRect();
  const px = (((event.clientX - rect.left) / Math.max(1, rect.width)) - 0.5) * -10;
  const py = (((event.clientY - rect.top) / Math.max(1, rect.height)) - 0.5) * -10;
  event.currentTarget.style.setProperty('--fit-px', `${px.toFixed(2)}px`);
  event.currentTarget.style.setProperty('--fit-py', `${py.toFixed(2)}px`);
};

const handleCardPointerLeave = (event: PointerEvent<HTMLElement>) => {
  event.currentTarget.style.setProperty('--fit-px', '0px');
  event.currentTarget.style.setProperty('--fit-py', '0px');
};

export function FitnessLanding() {
  const user = getCurrentUser();
  const { catalog, error: catalogError, retry: retryCatalog } = usePublicCatalog();
  const classPath = user ? user.role === 'MEMBER' ? '/member/classes' : homePath(user.role) : '/login';
  const joinPath = user ? user.role === 'MEMBER' ? '/member/packages' : homePath(user.role) : '/register';
  const planPath = user ? user.role === 'MEMBER' ? '/member/progress' : homePath(user.role) : '/register';
  const accountLabel = !user ? 'Tạo tài khoản' : user.role === 'MEMBER' ? 'Chọn gói tập' : 'Vào portal';
  const muscleDetailPath = user ? user.role === 'MEMBER' ? '/member/packages' : homePath(user.role) : '/login';
  const [activeMuscleId, setActiveMuscleId] = useState<(typeof muscleGroups)[number]['id'] | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [space, setSpace] = useState(0);
  const [heightCm, setHeightCm] = useState('170');
  const [weightKg, setWeightKg] = useState('65');
  const [goalType, setGoalType] = useState<'lean' | 'muscle' | 'balance'>('muscle');
  const [openFaq, setOpenFaq] = useState<number>(0);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [activeRhythmIdx, setActiveRhythmIdx] = useState<number>(0);
  const activeRhythm = dailyRhythmItems[activeRhythmIdx];

  const activateMuscle = (id: (typeof muscleGroups)[number]['id']) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setActiveMuscleId(id);
  };

  // Callout nằm cách vùng cơ một khoảng; cần đủ thời gian để rê chuột sang nút CTA.
  const scheduleClearMuscle = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setActiveMuscleId(null);
      closeTimerRef.current = null;
    }, MUSCLE_CLOSE_DELAY_MS);
  };

  const activeMuscle = muscleGroups.find((group) => group.id === activeMuscleId) ?? null;
  const parsedHeight = Number(heightCm);
  const parsedWeight = Number(weightKg);
  const validMetrics = parsedHeight >= 100 && parsedHeight <= 240 && parsedWeight >= 30 && parsedWeight <= 250;
  const bmiValue = validMetrics ? +(parsedWeight / ((parsedHeight / 100) ** 2)).toFixed(1) : null;
  const bmiStatus = bmiValue === null
    ? 'Nhập chiều cao & cân nặng hợp lệ'
    : bmiValue < 18.5
      ? 'Cần bổ sung khối cơ & dinh dưỡng'
      : bmiValue < 23
        ? 'Thể trạng cân đối chuẩn châu Á'
        : bmiValue < 25
          ? 'Thừa cân nhẹ — tối ưu đốt mỡ'
          : 'Ưu tiên giảm mỡ & bảo vệ khớp';


  return <main id="public-main">
    <section className="fit-hero" id="hero" aria-labelledby="hero-title">
      <div className="fit-hero-lines" aria-hidden="true" />
      <h1 id="hero-title" className="fit-hero-title"><span>BUILD YOUR</span><span>BODY SHAPES<span className="fit-title-dot">.</span></span></h1>
      <div className="fit-hero-copy"><p>Mạnh mẽ từ thể chất.<br />Tự tin từ bên trong.</p>
        <a href="#trainers" className="fit-reviews"><span>Cùng nhau tiến bộ</span><span className="fit-avatar-row">{coachAvatars.map((coach) => <LoadingImage key={coach.name} src={`/images/fitness/${coach.image}`} alt="" />)}<span className="fit-review-arrow" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 11.5L11.5 4.5M6 4.5h5.5V10" /></svg></span></span><span className="fit-review-label">Đội ngũ đồng hành</span></a>
      </div>
      <LoadingImage
        className="fit-hero-athlete"
        src="/images/fitness/hero-athlete.webp"
        srcSet="/images/fitness/hero-athlete-800w.webp 800w, /images/fitness/hero-athlete.webp 1024w"
        sizes="(max-width: 768px) 92vw, 42vw"
        width={1024}
        height={1536}
        alt="Vận động viên ngồi tập tạ đơn, hướng ánh nhìn xuống, trên nền tối"
        fetchPriority="high"
        decoding="async"
      />
      <div className="fit-hero-anatomy-stage" onPointerLeave={(e) => { if (e.pointerType !== 'touch') scheduleClearMuscle(); }}>
        <svg
          className="fit-hero-anatomy"
          viewBox="0 0 1024 1536"
          preserveAspectRatio="xMidYMid meet"
          role="group"
          aria-label="Bản đồ nhóm cơ tương tác trên cơ thể vận động viên"
        >
          <defs>
            <filter id="fit-muscle-feather" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="24" />
            </filter>
            <mask id="fit-active-muscle-mask">
              <rect width="1024" height="1536" fill="black" />
              {activeMuscle && <g filter="url(#fit-muscle-feather)">
                {activeMuscle.paths.map((d, index) => <path key={index} d={d} fill="white" />)}
              </g>}
            </mask>
          </defs>
          {activeMuscle && <image
            href="/images/fitness/hero-athlete.webp"
            width="1024"
            height="1536"
            mask="url(#fit-active-muscle-mask)"
            className="fit-muscle-lit-image"
            aria-hidden="true"
          />}
          {muscleGroups.map((group) => {
            const isActive = activeMuscleId === group.id;
            return <g
              key={group.id}
              className={`fit-muscle-zone ${isActive ? 'is-active' : ''}`}
              data-muscle={group.id}
              role="button"
              tabIndex={0}
              aria-label={`Vùng cơ: ${group.name}`}
              aria-pressed={isActive}
              onPointerEnter={() => activateMuscle(group.id)}
              onMouseEnter={() => activateMuscle(group.id)}
              onFocus={() => activateMuscle(group.id)}
              onBlur={scheduleClearMuscle}
              onClick={() => activateMuscle(group.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  activateMuscle(group.id);
                }
              }}
            >
              <title>{group.name} — {group.goal}</title>
              {group.paths.map((d, index) => <path key={index} className="fit-muscle-shape" d={d} />)}
            </g>;
          })}
          {activeMuscle && <g key={activeMuscle.id} className="fit-muscle-pointer" aria-hidden="true">
            <circle className="fit-pointer-origin-ring" cx={activeMuscle.origin.x} cy={activeMuscle.origin.y} r="11" />
            <circle className="fit-pointer-origin-dot" cx={activeMuscle.origin.x} cy={activeMuscle.origin.y} r="4.5" />
            <polyline
              className="fit-pointer-line"
              points={`${activeMuscle.origin.x},${activeMuscle.origin.y} ${activeMuscle.elbow.x},${activeMuscle.elbow.y} ${activeMuscle.tipPoint.x},${activeMuscle.tipPoint.y}`}
            />
            <path
              className="fit-pointer-head"
              d={activeMuscle.side === 'left'
                ? `M ${activeMuscle.tipPoint.x + 15} ${activeMuscle.tipPoint.y - 8} L ${activeMuscle.tipPoint.x} ${activeMuscle.tipPoint.y} L ${activeMuscle.tipPoint.x + 15} ${activeMuscle.tipPoint.y + 8}`
                : `M ${activeMuscle.tipPoint.x - 15} ${activeMuscle.tipPoint.y - 8} L ${activeMuscle.tipPoint.x} ${activeMuscle.tipPoint.y} L ${activeMuscle.tipPoint.x - 15} ${activeMuscle.tipPoint.y + 8}`}
            />
          </g>}
        </svg>
        {activeMuscle && <aside
          key={activeMuscle.id}
          className={`fit-muscle-callout is-${activeMuscle.side}`}
          style={{ '--callout-top': activeMuscle.calloutTop } as CSSProperties}
          aria-live="polite"
          onPointerEnter={() => activateMuscle(activeMuscle.id)}
          onMouseEnter={() => activateMuscle(activeMuscle.id)}
        >
          <span className="fit-muscle-zone-badge">{activeMuscle.zone}</span>
          <h3>{activeMuscle.name}</h3>
          <p className="fit-muscle-goal"><strong>Mục tiêu:</strong> {activeMuscle.goal}</p>
          <ul className="fit-muscle-exercises">
            {activeMuscle.exercises.map((exercise) => <li key={exercise}><span aria-hidden="true">✦</span>{exercise}</li>)}
          </ul>
          <Link to={muscleDetailPath} className="fit-pill fit-muscle-cta">
            Xem chi tiết &amp; Mua gói tập<RoundArrow diagonal />
          </Link>
        </aside>}
      </div>
      <div className="fit-hero-action"><Link to={joinPath} className="fit-pill">Bắt đầu ngay<RoundArrow /></Link><span>YOUR BODY. YOUR JOURNEY.</span></div>
      <span className="fit-hero-index" aria-hidden="true">01 / THE BEGINNING</span>
    </section>
    <section className="fit-services" id="disciplines" aria-label="Các hình thức tập luyện">
      <div className="fit-services-glow" aria-hidden="true" />
      {services.map((service, index) => <a key={service.title} className={`fit-service fit-service-${index}`} data-reveal="lift" href="#packages"><svg className="fit-service-surface" viewBox="0 0 320 280" preserveAspectRatio="none" aria-hidden="true"><path d={serviceShapes[index]} /></svg><ServiceIcon type={service.icon} /><h2>{service.title}</h2><span className="fit-service-rule" /><p>{service.description}</p></a>)}
    </section>
    <div className="fit-ticker" aria-hidden="true">
      <div className="fit-marquee-track">
        {[0, 1].map((groupIndex) => <div key={groupIndex} className="fit-marquee-group">
          {tickerItems.map((item) => <span key={`${groupIndex}-${item}`} className="fit-marquee-item">{item}<i /></span>)}
        </div>)}
      </div>
    </div>
    <section className="fit-section fit-space" id="about" aria-labelledby="space-title"><span id="intelligence" />
      <div className="fit-metrics-grid" aria-label="Tiêu chuẩn câu lạc bộ">
        {clubMetrics.map((item) => <article key={item.label} className="fit-metric-card" data-reveal="lift">
          <span className="fit-kicker">{item.label}</span>
          {'countTo' in item && item.countTo !== undefined
            ? <CountUpMetric value={item.value} countTo={item.countTo} format={item.format} />
            : <strong>{item.value}</strong>}
        </article>)}
      </div>
      <p className="fit-manifesto" data-scroll-scrub="manifesto" data-reveal="soft">
        {manifestoWords.map((word, idx) => <span key={idx} className="fit-manifesto-word"><span>{word}</span> </span>)}
      </p>
      <div className="fit-space-image" data-reveal="image" onPointerMove={handleCardPointerMove} onPointerLeave={handleCardPointerLeave}>
        <LoadingImage key={spaces[space].image} src={spaces[space].image} alt={spaces[space].title} loading="lazy" />
        <div className="fit-space-shade" />
        <div key={space} className="fit-space-content fit-blur-morph">
          <span className="fit-kicker">05 PHÂN KHU TẬP LUYỆN</span>
          <h2 id="space-title">{spaces[space].title}</h2>
          <p className="fit-space-meta">{spaces[space].meta}</p>
          <a className="fit-pill" href="#contact">Ghé thăm SÖL<RoundArrow diagonal /></a>
        </div>
        <div className="fit-space-tabs" aria-label="Khám phá không gian">{spaces.map((item, index) => <button type="button" key={item.label} onClick={() => setSpace(index)} className={space === index ? 'is-active' : ''} aria-pressed={space === index}><LoadingImage src={item.image} alt="" loading="lazy" /><span>{item.label}</span><span className="fit-space-tab-arrow" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 11.5L11.5 4.5M6 4.5h5.5V10" /></svg></span></button>)}</div>
        <span className="fit-space-number">0{space + 1} / 0{spaces.length}</span>
      </div>
      <div className="fit-rhythm-explorer" data-reveal="lift" aria-label="Nhịp sinh hoạt trong ngày tại câu lạc bộ">
        <div className="fit-rhythm-head">
          <div>
            <span className="fit-kicker">NHỊP TẬP TRONG NGÀY</span>
            <h3>Các khung giờ trong ngày</h3>
          </div>
          <div className="fit-rhythm-tabs" role="tablist" aria-label="Chọn khung giờ trong ngày">
            {dailyRhythmItems.map((item, idx) => <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeRhythmIdx === idx}
              className={activeRhythmIdx === idx ? 'is-active' : ''}
              onClick={() => setActiveRhythmIdx(idx)}
            >
              {item.label}
            </button>)}
          </div>
        </div>
        <div key={activeRhythm.id} className="fit-rhythm-body fit-blur-morph">
          <div className="fit-rhythm-copy">
            <h4>{activeRhythm.title}</h4>
            <ul>
              {activeRhythm.highlights.map((pt) => <li key={pt}><span aria-hidden="true">✓</span>{pt}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </section>
    <section className="fit-section fit-multisport" id="multisport" aria-labelledby="multisport-title">
      <SportStack classPath={classPath} heading={<div className="fit-section-heading fit-centered" data-reveal="soft">
        <span className="fit-kicker">SÖL SPORTS CLUB</span>
        <SplitHeading id="multisport-title" lines={['Các bộ môn']} />
      </div>} />
    </section>
    <section className="fit-section fit-trainers" id="trainers" aria-labelledby="trainers-title">
      <div className="fit-section-heading" data-reveal="soft">
        <span className="fit-kicker">BETTER WITH A COACH</span>
        <SplitHeading id="trainers-title" lines={['Our Trainers']} />
      </div>
      <div>{catalog ? <CatalogTrainers catalog={catalog} /> : <CatalogStatus loading={!catalogError} retry={retryCatalog} kind="trainers" />}</div>
    </section>
    <section className="fit-section fit-journey" id="journey" aria-labelledby="journey-title">
      <div className="fit-journey-steps" data-reveal="soft">
        <div className="fit-section-heading">
          <span className="fit-kicker">HOW YOUR ROUTINE BEGINS</span>
          <SplitHeading id="journey-title" lines={['Your First Week', 'At SÖL']} />
        </div>
        <ol className="fit-step-list" style={{ '--active-step': activeStep } as CSSProperties}>
          {journeySteps.map((item, index) => <li
            key={item.step}
            className={`fit-step-item ${activeStep === index ? 'is-active' : ''}`}
            data-reveal="lift"
            onPointerEnter={() => setActiveStep(index)}
            onClick={() => setActiveStep(index)}
          >
            <span className="fit-step-badge">{item.step}</span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </div>
          </li>)}
        </ol>
        <div key={activeStep} className="fit-journey-preview fit-blur-morph" aria-label="Minh họa trực quan theo từng bước">
          {activeStep === 0 ? <div className="fit-preview-widget fit-preview-qr">
            <div className="fit-preview-head">
              <span className="fit-kicker">01 · DIGITAL PASS &amp; SLOT CHECK</span>
              <span className="fit-preview-live"><i />QR Active</span>
            </div>
            <div className="fit-preview-slots" aria-hidden="true">
              {['06:30', '08:00', '09:30', '12:00', '16:00', '17:30', '18:30', '19:30'].map((slot, idx) => <span
                key={slot}
                className={`fit-slot-pill ${idx === 5 ? 'is-selected' : idx === 1 || idx === 6 ? 'is-busy' : ''}`}
                style={{ '--slot-idx': idx } as CSSProperties}
              >
                {slot}
              </span>)}
            </div>
          </div> : activeStep === 1 ? <div className="fit-preview-widget fit-preview-ai">
            <div className="fit-preview-head">
              <span className="fit-kicker">02 · WEEKLY MULTI-SPORT PLAN</span>
              <span className="fit-preview-live"><i />Gợi ý mẫu</span>
            </div>
            <div className="fit-preview-chat" aria-hidden="true">
              <div className="fit-chat-user">Mục tiêu săn chắc · 4 buổi/tuần sau 17:30</div>
              <div className="fit-chat-bot">
                <div className="fit-chat-tags">
                  <span>T2 · Strength</span>
                  <span>T4 · Bơi lội</span>
                  <span>T6 · Tennis</span>
                  <span>CN · Mobility</span>
                </div>
              </div>
            </div>
          </div> : <div className="fit-preview-widget fit-preview-chart">
            <div className="fit-preview-head">
              <span className="fit-kicker">03 · CONSISTENCY CURVE</span>
              <span className="fit-preview-live"><i />85% hoàn thành</span>
            </div>
            <svg className="fit-progress-svg" viewBox="0 0 320 92" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="fit-curve-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ce9180" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="#ce9180" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path className="fit-curve-area" d="M12 74 C 70 68, 110 52, 162 44 C 214 36, 256 22, 308 14 L 308 84 L 12 84 Z" fill="url(#fit-curve-fill)" />
              <path className="fit-curve-line" d="M12 74 C 70 68, 110 52, 162 44 C 214 36, 256 22, 308 14" />
              {[
                { cx: 12, cy: 74, label: 'W1' },
                { cx: 110, cy: 55, label: 'W2' },
                { cx: 208, cy: 34, label: 'W3' },
                { cx: 308, cy: 14, label: 'W4' },
              ].map((pt, idx) => <g key={pt.label} className="fit-curve-dot" style={{ '--dot-idx': idx } as CSSProperties}>
                <circle cx={pt.cx} cy={pt.cy} r="4.5" />
              </g>)}
            </svg>
          </div>}
        </div>
      </div>
      <div className="fit-bmi-card" data-reveal="tilt" aria-labelledby="bmi-title">
        <span className="fit-kicker">BODY METRIC &amp; GOAL CHECK</span>
        <h3 id="bmi-title">Tính Nhanh BMI &amp; Lộ Trình<span className="fit-title-dot">.</span></h3>
        <div className="fit-bmi-inputs">
          <label htmlFor="fit-bmi-height">
            <span>Chiều cao (cm)</span>
            <input id="fit-bmi-height" type="number" min={100} max={240} value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
          </label>
          <label htmlFor="fit-bmi-weight">
            <span>Cân nặng (kg)</span>
            <input id="fit-bmi-weight" type="number" min={30} max={250} value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
          </label>
        </div>
        <div className="fit-bmi-goals" role="group" aria-label="Chọn mục tiêu tập luyện">
          <button type="button" onClick={() => setGoalType('lean')} aria-pressed={goalType === 'lean'}>Giảm mỡ &amp; Săn chắc</button>
          <button type="button" onClick={() => setGoalType('muscle')} aria-pressed={goalType === 'muscle'}>Tăng cơ &amp; Sức mạnh</button>
          <button type="button" onClick={() => setGoalType('balance')} aria-pressed={goalType === 'balance'}>Dẻo dai &amp; Cân bằng</button>
        </div>
        <div className="fit-bmi-result" aria-live="polite">
          <div>
            <span className="fit-kicker">CHỈ SỐ BMI ƯỚC TÍNH</span>
            <strong>{bmiValue !== null ? bmiValue : '—'}</strong>
            <span>{bmiStatus}</span>
          </div>
          <p><strong>Gợi ý:</strong> Xem các gói đang mở tại bảng giá và trao đổi mục tiêu với huấn luyện viên.</p>
        </div>
        <Link to={planPath} className="fit-pill">Nhận lộ trình<RoundArrow diagonal /></Link>
      </div>
    </section>
    <section className="fit-section fit-pricing" id="packages" aria-labelledby="pricing-title">
      <div className="fit-section-heading fit-centered" data-reveal="soft"><span className="fit-kicker">MAKE TIME FOR YOURSELF</span><SplitHeading id="pricing-title" lines={['Membership Pricing']} /></div>
      {catalog ? <CatalogPackages catalog={catalog} joinPath={joinPath} /> : <CatalogStatus loading={!catalogError} retry={retryCatalog} kind="packages" />}
    </section>
    <ProductShelf />
    <section className="fit-section fit-faq" id="faq" aria-labelledby="faq-title">
      <div className="fit-section-heading fit-centered" data-reveal="soft">
        <span className="fit-kicker">FAQ</span>
        <SplitHeading id="faq-title" lines={['Frequently Asked', 'Questions']} />
      </div>
      <div className="fit-faq-list">
        {faqs.map((item, index) => {
          const expanded = openFaq === index;
          return <article key={item.question} className={`fit-faq-item ${expanded ? 'is-open' : ''}`} data-reveal="lift">
            <h3>
              <button
                type="button"
                className="fit-faq-trigger"
                aria-expanded={expanded}
                onClick={() => setOpenFaq(expanded ? -1 : index)}
              >
                <span>{item.question}</span>
                <span className="fit-faq-icon" aria-hidden="true">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d={expanded ? 'M4 8h8' : 'M8 4v8M4 8h8'} />
                  </svg>
                </span>
              </button>
            </h3>
            {expanded && <p className="fit-faq-answer">{item.answer}</p>}
          </article>;
        })}
      </div>
    </section>
    <section className="fit-benefits" id="benefits" aria-labelledby="benefits-title">
      <div className="fit-benefits-sticky">
        <div className="fit-benefits-bg" aria-hidden="true">THÀNH VIÊN</div>
        <div className="fit-benefits-head" data-reveal="soft">
          <div>
            <span className="fit-benefits-eyebrow"><i aria-hidden="true" />Quyền lợi thành viên</span>
            <h2 id="benefits-title" className="fit-benefits-title">
              Bạn nhận được<br />
              gì <span>khi có gói.</span>
            </h2>
          </div>
          <div className="fit-benefits-progress" aria-hidden="true"><i /></div>
        </div>
        <div className="fit-benefits-track">
          {memberBenefits.map((benefit) => <article key={benefit.idx} className="fit-benefit-card" data-reveal="lift">
            <div className="fit-benefit-top">
              <span className="fit-benefit-tag">{benefit.tag}</span>
              <span className="fit-benefit-idx">{benefit.idx}</span>
            </div>
            <h3>{benefit.title}</h3>
            <p>{benefit.description}</p>
            <ul>
              {benefit.perks.map((perk) => <li key={perk}>{perk}</li>)}
            </ul>
          </article>)}
          <article className="fit-benefit-card fit-benefit-end" data-reveal="lift">
            <h3>Chưa có gói vẫn trải nghiệm được</h3>
            <p>Tạo tài khoản miễn phí để xem lịch lớp và chọn gói phù hợp. Thanh toán tại quầy lễ tân để kích hoạt gói trước khi đặt lớp và check-in.</p>
            <Link to={joinPath} className="fit-benefit-end-btn">
              {accountLabel}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </article>
        </div>
      </div>
    </section>
    <section className="fit-final-cta" data-reveal="soft"><span className="fit-kicker">ONE SMALL STEP. A STRONGER YOU.</span><h2>READY WHEN<br /><em>YOU ARE.</em></h2><Link to={joinPath} className="fit-pill">Bắt đầu hành trình<RoundArrow diagonal /></Link><span className="fit-cta-star" aria-hidden="true">✳</span></section>
  </main>;
}

