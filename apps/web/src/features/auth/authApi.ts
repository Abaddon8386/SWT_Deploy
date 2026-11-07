import { sourceError } from '../shop/shopI18n';
import { apiFetch } from '../../shared/api/client';

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  phone?: string;
}

export interface GoogleSendOtpResponse {
  email: string;
  message: string;
  expiresInMinutes: number;
  debugOtp?: string;
}

export interface GoogleVerifyResponse {
  token: string;
  username: string;
  role: string;
}

export type GoogleOAuthResponse =
  | ({ requiresOtp: true } & GoogleSendOtpResponse)
  | { requiresOtp: false; email: string; authentication: GoogleVerifyResponse };

export interface GoogleOAuthCallbackInput {
  idToken?: string;
  accessToken?: string;
}

export const register = (input: RegisterInput) =>
  apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(input) });

export const sendOtp = (email: string) =>
  apiFetch<{ debugOtp?: string }>('/auth/send-otp', { method: 'POST', body: JSON.stringify({ email }) });

export const verifyOtp = (target: string, otpCode: string) =>
  apiFetch('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ target, otpCode }) });

export const googleSendOtp = (email: string) =>
  apiFetch<GoogleSendOtpResponse>('/auth/google/send-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const googleVerifyOtp = (email: string, otpCode: string) =>
  apiFetch<GoogleVerifyResponse>('/auth/google/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otpCode }),
  });

export const googleOAuthCallback = (input: GoogleOAuthCallbackInput) =>
  apiFetch<GoogleOAuthResponse>('/auth/google/oauth-callback', {
    method: 'POST',
    body: JSON.stringify(input),
  });

const GOOGLE_VERIFIER_KEY = 'scms_google_redirect_verifier';
const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const getGoogleOAuthAuthorizeUrl = async () => {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(GOOGLE_VERIFIER_KEY, verifier);
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
  return `${baseUrl}/auth/google/authorize?code_challenge=${encodeURIComponent(challenge)}`;
};

export const googleLoginWithIdToken = (idToken: string) =>
  apiFetch<GoogleVerifyResponse>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });


export const googleRedeemHandoff = (code: string) => {
  const verifier = sessionStorage.getItem(GOOGLE_VERIFIER_KEY);
  sessionStorage.removeItem(GOOGLE_VERIFIER_KEY);
  if (!verifier) throw sourceError(null, 'Phiên đăng nhập Google không hợp lệ. Vui lòng đăng nhập lại.');
  return apiFetch<GoogleVerifyResponse>('/auth/google/handoff', {
    method: 'POST',
    body: JSON.stringify({ code, verifier }),
  });
};
