import { useSourceLanguage } from "../shop/shopI18n";
import { LuxuryLoginForm } from './LuxuryLoginForm';
import { AuthLayout } from '../landing/components/PublicLayout';

export function LoginPage() {
  useSourceLanguage();
  return <AuthLayout mode="login"><LuxuryLoginForm /></AuthLayout>;
}
