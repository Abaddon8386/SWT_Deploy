import { getIntlLocale, getLanguage } from '../i18n/language';
import type { MembershipPackage } from '../../features/member/membershipApi';

export const formatPrice = (price: number) => new Intl.NumberFormat(getIntlLocale(), {
  style: 'currency', currency: 'VND',
}).format(price);

export function isTrialPackage(pkg: { price?: number; durationDays?: number; name?: string }): boolean {
  if (pkg.price === 0 && pkg.durationDays === 3) return true;
  const name = (pkg.name || '').toLowerCase();
  return name.includes('trải nghiệm') || name.includes('trial');
}

export function getPackageDetails(pkg: MembershipPackage, lang: 'vi' | 'en' = getLanguage()) {
  const t = (vi: string, en: string) => lang === 'en' ? en : vi;
  const desc = pkg.description?.trim() || '';
  const lines = desc.split('\n').map((l) => l.trim()).filter(Boolean);

  // Extract bullet points if present (lines starting with '-' or '•')
  const bulletPerks = lines
    .filter((l) => l.startsWith('-') || l.startsWith('•'))
    .map((l) => l.replace(/^[-•]\s*/, '').trim());

  let summary = desc;
  const firstBulletIdx = lines.findIndex((l) => l.startsWith('-') || l.startsWith('•'));
  if (firstBulletIdx > 0) {
    summary = lines.slice(0, firstBulletIdx).filter((l) => !l.toLowerCase().includes('quyền lợi')).join(' • ');
  } else if (firstBulletIdx === 0) {
    summary = t(`Gói tập ${pkg.name} có thời hạn ${pkg.durationDays} ngày.`, `${pkg.name} membership lasts ${pkg.durationDays} days.`);
  }

  const defaultBenefits = [
    t(`Hiệu lực ${pkg.durationDays} ngày kể từ khi kích hoạt`, `Valid for ${pkg.durationDays} days from activation`),
    pkg.classCreditLimit != null ? t(`Tối đa ${pkg.classCreditLimit} lượt đặt lớp mỗi kỳ`, `Up to ${pkg.classCreditLimit} class bookings per period`) : t('Không giới hạn lượt đặt lớp', 'Unlimited class bookings'),
    t('Đặt lớp và check-in khi gói còn hiệu lực', 'Book classes and check in while your membership is valid'),
    t('Thanh toán và kích hoạt tại quầy lễ tân', 'Payment and activation at reception'),
  ];

  let tierBadge = t(`Gói tập • ${pkg.durationDays} ngày`, `Membership • ${pkg.durationDays} days`);
  if (pkg.durationDays >= 360) {
    tierBadge = t(`Gói 12 tháng • 365 ngày (Tiết kiệm 25%)`, `12-month plan • 365 days (Save 25%)`);
  } else if (pkg.durationDays >= 170) {
    tierBadge = t(`Gói 6 tháng • 180 ngày (Tiết kiệm ~17%)`, `6-month plan • 180 days (Save ~17%)`);
  } else if (pkg.durationDays === 90) {
    tierBadge = t(`Gói 3 tháng • 90 ngày`, `3-month plan • 90 days`);
  } else if (pkg.durationDays === 30) {
    tierBadge = t(`Gói tháng • 30 ngày`, `Monthly plan • 30 days`);
  }

  return {
    tierBadge,
    summary: summary || t(`Gói tập có thời hạn ${pkg.durationDays} ngày.`, `Membership lasts ${pkg.durationDays} days.`),
    benefits: bulletPerks.length > 0 ? bulletPerks : defaultBenefits,
    /** Chỉ các quyền lợi do catalog mô tả (không gồm dòng mặc định) */
    perks: bulletPerks,
  };
}
