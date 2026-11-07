import { useSourceLanguage } from "../shop/shopI18n";
import { FitnessLanding } from './components/FitnessLanding';
import { PublicLayout } from './components/PublicLayout';

export function LandingPage() {
  useSourceLanguage();
  return <PublicLayout><FitnessLanding /></PublicLayout>;
}
