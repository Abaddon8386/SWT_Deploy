import { useLanguage } from '../../shared/i18n/language';
import { CourtBookingFeature } from './CourtBookingFeature';
import { StaffCourtBookings } from './CourtBookingList';

export function MemberCourtsPage() {
  useLanguage(); return <CourtBookingFeature />; }
export function StaffCourtsPage() {
  useLanguage(); return <StaffCourtBookings />; }
