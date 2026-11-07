import { sourceText, useSourceLanguage, sourceFormat, sourceError, sourceToast as toast, sourceFormatPair } from '../shop/shopI18n';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearAuthSession, getCurrentUser, loginApi, setAuthSession, type UserSession } from '../../shared/api/client';
import { StatusMark } from '../../shared/ui/StatusMark';
import { authDestination, purchaseAuthPath, rememberPurchaseIntent } from '../../shared/lib/purchaseIntent';
import { loginSchema } from './authValidation';
import { loadGoogleIdentity } from './loadGoogleIdentity';
import {
  getGoogleOAuthAuthorizeUrl,
  googleOAuthCallback,
  googleRedeemHandoff,
  type GoogleVerifyResponse,
  googleSendOtp,
  googleVerifyOtp,
  type GoogleOAuthCallbackInput,
} from './authApi';

interface LuxuryLoginFormProps {
  onSuccess?: () => void;
}

const ROLE_NAMES: Record<UserSession['role'], string> = {
  get ADMIN() { return sourceText('Quản trị hệ thống'); },
  MEMBER: 'Hội viên',
  get STAFF() { return sourceText('Lễ tân / Thu ngân'); },
  get COACH() { return sourceText('Huấn luyện viên'); },
  get MANAGER() { return sourceText('Quản lý trung tâm'); },
};

type AuthMode = 'standard' | 'google_otp';

export function LuxuryLoginForm({ onSuccess }: LuxuryLoginFormProps) {
  useSourceLanguage();
  const navigate = useNavigate();
  const { search } = useLocation();
  useEffect(() => rememberPurchaseIntent(search), [search]);

  const [currentUser, setCurrentUser] = useState<UserSession | null>(() => getCurrentUser());
  const [mode, setMode] = useState<AuthMode>('standard');

  // Standard Login Form
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Google Login Form
  const [googleEmail, setGoogleEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpMessage, setOtpMessage] = useState<string | Error | import('../../shared/i18n').SourceMessage>('');
  const [debugOtpCode, setDebugOtpCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [formError, setFormError] = useState<string | Error>('');
  const [shaking, setShaking] = useState(false);
  const [success, setSuccess] = useState(false);

  // Google Client ID từ biến môi trường
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

  useEffect(() => {
    if (googleClientId) {
      void loadGoogleIdentity().catch(() => {});
    }
  }, [googleClientId]);

  const [isExpired, setIsExpired] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('expired') === '1';
  });

  // Countdown timer for resending OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const fail = useCallback((msg: string | Error) => {
    setFormError(msg);
    setShaking(true);
  }, []);

  const completeGoogleLogin = useCallback((authentication: GoogleVerifyResponse) => {
    const user = setAuthSession(authentication.token, authentication.username, authentication.role);
    setIsExpired(false);
    setSuccess(true);
    if (onSuccess) onSuccess();
    toast('Đăng nhập thành công!', 'success');
    navigate(authDestination(user.role, search), { viewTransition: true });
  }, [navigate, onSuccess, search]);

  const processGoogleOAuthCallback = useCallback(async (payload: GoogleOAuthCallbackInput) => {
    setIsGoogleLoading(true);
    setFormError('');
    try {
      const res = await googleOAuthCallback(payload);
      if (res.requiresOtp === false) {
        completeGoogleLogin(res.authentication);
        return;
      }
      const verifiedEmail = (res.email || '').trim();
      setGoogleEmail(verifiedEmail);
      setOtpMessage(
        (res.message ? new Error(res.message) : null) || sourceFormatPair("Đã gửi mã xác nhận đến gmail {0}. Hãy nhập mã xác nhận để kích hoạt tài khoản.", verifiedEmail)
      );
      if (res.debugOtp) {
        setDebugOtpCode(res.debugOtp);
        setOtpCode(res.debugOtp);
      } else {
        setDebugOtpCode('');
        setOtpCode('');
      }
      setMode('google_otp');
      setCountdown(30);
      toast(sourceFormatPair("Mã xác nhận đã được gửi đến {0}", verifiedEmail));
    } catch (err: unknown) {
      const msg = sourceError(err, 'Đăng nhập Google thất bại.');
      // BR-04 & BR-05: Chặn nhân sự (403) và tài khoản bị khóa
      if (msg.message.includes('nhân sự') || msg.message.toLowerCase().includes('staff') || msg.message.includes('403')) {
        fail('Vai trò này chưa hỗ trợ đăng nhập Google. Vui lòng đăng nhập bằng email và mật khẩu.');
      } else if (msg.message.toLowerCase().includes('khóa') || msg.message.toLowerCase().includes('locked')) {
        fail('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.');
      } else {
        fail(msg);
      }
    } finally {
      setIsGoogleLoading(false);
    }
  }, [fail, completeGoogleLogin]);

  const redeemGoogleRedirect = useCallback(async (code: string) => {
    setIsGoogleLoading(true);
    setFormError('');
    try {
      completeGoogleLogin(await googleRedeemHandoff(code));
    } catch (error) {
      fail(sourceError(error, 'Đăng nhập Google thất bại.'));
    } finally {
      setIsGoogleLoading(false);
    }
  }, [completeGoogleLogin, fail]);

  // Xử lý khi Google OAuth 2.0 Redirect Callback trả về URL (/login?google_oauth=callback&email=... hoặc /login?code=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('google_oauth');
    const code = params.get('code');

    if (!oauthStatus && !code) return;

    const cleanSearchParams = () => {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete('google_oauth');
      nextParams.delete('email');
      nextParams.delete('message');
      nextParams.delete('debug_otp');
      nextParams.delete('debugOtp');
      nextParams.delete('state');
      nextParams.delete('error');
      nextParams.delete('code');
      nextParams.delete('scope');
      nextParams.delete('authuser');
      nextParams.delete('prompt');
      const nextSearch = nextParams.toString();
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      fragment.delete('google_login_code');
      const nextHash = fragment.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash ? `#${nextHash}` : ''}`;
      window.history.replaceState({}, document.title, nextUrl);
    };

    if (oauthStatus === 'authenticated') {
      const handoff = new URLSearchParams(window.location.hash.slice(1)).get('google_login_code');
      cleanSearchParams();
      if (handoff) void redeemGoogleRedirect(handoff);
      else fail('Phiên đăng nhập Google không hợp lệ. Vui lòng đăng nhập lại.');
      return;
    }

    if (oauthStatus === 'callback') {
      const email = (params.get('email') || '').trim();
      const message = (params.get('message') ? new Error(params.get('message')!) : null) || sourceFormatPair("Đã gửi mã xác nhận đến gmail {0}. Hãy nhập mã xác nhận để kích hoạt tài khoản.", email);
      const debugOtp = params.get('debug_otp') || params.get('debugOtp') || '';
      cleanSearchParams();
      if (email) {
        setGoogleEmail(email);
        setOtpMessage(message);
        if (debugOtp) {
          setDebugOtpCode(debugOtp);
          setOtpCode(debugOtp);
        } else {
          setDebugOtpCode('');
          setOtpCode('');
        }
        setFormError('');
        setMode('google_otp');
        setCountdown(30);
        toast(sourceFormatPair("Mã xác nhận đã được gửi đến {0}", email));
      }
      return;
    }

    if (oauthStatus === 'error') {
      const errorMsg = params.get('error') || 'Xác thực Google OAuth thất bại.';
      cleanSearchParams();
      fail(errorMsg);
      return;
    }

    if (oauthStatus === 'not_configured') {
      cleanSearchParams();
      fail('Google chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
      return;
    }

    if (code) {
      cleanSearchParams();
      fail('Phiên đăng nhập Google không hợp lệ. Vui lòng đăng nhập lại.');
    }
  }, [fail, redeemGoogleRedirect]);

  // One Google entry point: popup when ready, otherwise the state-protected backend redirect.
  const handleGoogleOAuthLogin = async () => {
    setFormError('');
    if (googleClientId && !window.google?.accounts?.oauth2?.initTokenClient) {
      await loadGoogleIdentity().catch(() => {});
    }
    if (googleClientId && window.google?.accounts?.oauth2?.initTokenClient) {
      try {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: googleClientId,
          scope: 'openid email profile',
          prompt: 'select_account',
          callback: (response) => {
            if (response?.access_token) {
              void processGoogleOAuthCallback({ accessToken: response.access_token });
            } else if (response?.error) {
              fail(response.error_description || 'Đã hủy hoặc không thể xác thực với Google.');
            }
          },
          error_callback: () => {
            fail('Không thể mở cửa sổ xác thực Google OAuth.');
          },
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
        return;
      } catch (err) {
        console.warn('Google OAuth2 tokenClient fallback to redirect:', err);
      }
    }

    if (googleClientId) {
      setIsGoogleLoading(true);
      try {
        window.location.assign(await getGoogleOAuthAuthorizeUrl());
      } catch {
        fail('Không thể khởi tạo đăng nhập Google. Vui lòng thử lại.');
        setIsGoogleLoading(false);
      }
      return;
    }

    fail('Google chưa được cấu hình. Vui lòng liên hệ quản trị viên.');
  };

  const handleStandardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExpired(false);
    const parsed = loginSchema.safeParse({ identifier, password });
    if (!parsed.success) {
      fail(parsed.error.issues[0].message);
      document.getElementById(parsed.error.issues[0].path[0] === 'identifier' ? 'login-identifier' : 'login-password')?.focus();
      return;
    }

    setIsLoading(true);
    setFormError('');

    try {
      const res = await loginApi(parsed.data.identifier, parsed.data.password);
      if (onSuccess) onSuccess();

      setSuccess(true);
      navigate(authDestination(res.user.role, search), { viewTransition: true });
    } catch (err: unknown) {
      const msg = sourceError(err, 'Đăng nhập không thành công.');
      fail(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Gửi OTP tới Gmail
  const handleGoogleSendOtp = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    const cleanEmail = googleEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      fail('Vui lòng nhập đúng địa chỉ Gmail.');
      return;
    }

    setIsLoading(true);
    setFormError('');

    try {
      const res = await googleSendOtp(cleanEmail);
      setOtpMessage((res.message ? new Error(res.message) : null) || sourceFormatPair("Đã gửi mã xác nhận đến gmail {0}. Hãy nhập mã xác nhận để kích hoạt tài khoản.", cleanEmail));
      if (res.debugOtp) {
        setDebugOtpCode(res.debugOtp);
        setOtpCode(res.debugOtp);
      } else {
        setDebugOtpCode('');
        setOtpCode('');
      }
      setMode('google_otp');
      setCountdown(30);
      toast(sourceFormatPair("Mã xác nhận đã được gửi đến {0}", cleanEmail));
    } catch (err: unknown) {
      const msg = sourceError(err, 'Không thể gửi mã xác nhận đến email.');
      fail(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Xác thực OTP và Đăng nhập
  const handleGoogleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otpCode.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      fail('Mã xác nhận gồm đúng 6 chữ số.');
      return;
    }

    setIsLoading(true);
    setFormError('');

    try {
      const res = await googleVerifyOtp(googleEmail.trim(), cleanOtp);
      completeGoogleLogin(res);
    } catch (err: unknown) {
      const msg = sourceError(err, 'Mã xác nhận không chính xác hoặc đã hết hạn.');
      fail(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (currentUser && !isExpired) {
    return (
      <div
        className="luxury-login-container"
        style={{
          background: 'var(--color-bg-card)',
          borderRadius: '8px',
          padding: '48px 40px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(33, 28, 24, 0.06)',
          maxWidth: '520px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              backgroundColor: 'rgba(82, 183, 136, 0.15)',
              color: '#2d6a4f',
              fontSize: '1.6rem',
              fontWeight: 700,
            }}
          >
            ✓
          </span>
        </div>

        <h2
          style={{
            fontFamily: 'var(--fit-font, var(--font-sans))',
            fontSize: '1.8rem',
            fontWeight: 600,
            marginBottom: '8px',
            color: 'var(--color-text-main)',
          }}
        >
          {sourceText("Phiên đăng nhập đang hoạt động")}</h2>

        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>
          {sourceText("Đang đăng nhập với tài khoản ")}<strong>{currentUser.name}</strong> ({sourceText(ROLE_NAMES[currentUser.role])})
        </p>

        <div style={{ display: 'grid', gap: '12px' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate(authDestination(currentUser.role, search), { viewTransition: true })}
          >
            {sourceText("Tiếp tục vào Portal (")}{sourceText(ROLE_NAMES[currentUser.role])}) →
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              clearAuthSession();
              setCurrentUser(null);
            }}
          >
            {sourceText("Đăng xuất tài khoản này")}</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`luxury-login-container ${shaking ? 'anim-shake' : ''}`}
      onAnimationEnd={() => setShaking(false)}
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: '8px',
        padding: '40px 36px',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(33, 28, 24, 0.06)',
        maxWidth: '480px',
        width: '100%',
      }}
    >
      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <span
          style={{
            fontSize: '0.72rem',
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-gold)',
            display: 'block',
            marginBottom: '6px',
            fontWeight: 600,
          }}
        >
          {sourceText("SÖL SANCTUARY PORTAL")}</span>
        <h3
          style={{
            fontFamily: 'var(--fit-font, var(--font-sans))',
            fontSize: '1.85rem',
            fontWeight: 600,
            margin: 0,
            color: 'var(--color-text-main)',
            letterSpacing: '0.02em',
          }}
        >
          {mode === 'standard' && sourceText('Đăng nhập')}
          {mode === 'google_otp' && sourceText('Xác thực tài khoản')}
        </h3>
      </div>

      {isExpired && (
        <div role="status" className="portal-alert portal-alert--info" style={{ marginBottom: '18px' }}>
          <span>{sourceText("Phiên đăng nhập đã hết hạn để đảm bảo an toàn. Vui lòng đăng nhập lại.")}</span>
        </div>
      )}

      {formError && (
        <div role="alert" className="portal-alert anim-fade-up" style={{ marginBottom: '18px' }}>
          ⚠️ {sourceText(formError)}
        </div>
      )}

      {/* MODE 1: Standard Username/Password Login */}
      {mode === 'standard' && (
        <>
          <form onSubmit={handleStandardSubmit}>
            <div className="portal-form-group">
              <label className="portal-label" htmlFor="login-identifier">
                {sourceText("Tên đăng nhập hoặc Email")}</label>
              <input
                id="login-identifier"
                type="text"
                className="portal-input"
                placeholder={sourceText("Tên đăng nhập hoặc email")}
                autoComplete="username"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (isExpired) setIsExpired(false);
                }}
                aria-invalid={!!formError && !identifier.trim() ? true : undefined}
              />
            </div>

            <div className="portal-form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className="portal-label" htmlFor="login-password" style={{ margin: 0 }}>
                  {sourceText("Mật Khẩu")}</label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '0.72rem',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {showPassword ? sourceText('Ẩn mật khẩu') : sourceText('Hiện mật khẩu')}
                </button>
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="portal-input"
                placeholder={sourceText("Nhập mật khẩu")}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (isExpired) setIsExpired(false);
                }}
                aria-invalid={!!formError && (!password || !!identifier.trim()) ? true : undefined}
              />
            </div>

            <button type="submit" className="luxury-login-submit-btn" disabled={isLoading || success}>
              {success ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                  <StatusMark size={22} />
                  {sourceText("ĐÃ XÁC THỰC")}</span>
              ) : (
                <>
                  <span>{isLoading ? sourceText('ĐANG XÁC THỰC...') : sourceText('ĐĂNG NHẬP')}</span>
                  <span className="submit-arrow" aria-hidden="true">→</span>
                </>
              )}
            </button>
          </form>

          {/* Đường phân cách */}
          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: '12px' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--color-border-medium)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {sourceText("HOẶC")}</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--color-border-medium)' }} />
          </div>

          {/* Nút Đăng nhập bằng Google (SCRUM-89: Google OAuth -> Callback -> Xác nhận OTP qua Gmail) */}
          <button
            type="button"
            id="google-oauth-btn"
            className="btn-secondary"
            disabled={isGoogleLoading}
            style={{
              width: '100%',
              marginTop: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontWeight: 600,
            }}
            onClick={handleGoogleOAuthLogin}
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
            </svg>
            <span>{sourceText("Đăng nhập bằng Google")}</span>
          </button>
          {isGoogleLoading && <p role="status" style={{ textAlign: 'center', marginTop: 8 }}>{sourceText("Đang xác thực Google và gửi mã OTP...")}</p>}
          <p style={{ marginTop: '20px', fontSize: '0.85rem', textAlign: 'center' }}>
            {sourceText("Chưa có tài khoản?")}{' '}
            <Link to={purchaseAuthPath('/register', search)} viewTransition style={{ color: 'var(--color-accent-gold)', fontWeight: 600 }}>
              {sourceText("Đăng ký hội viên")}</Link>
          </p>
        </>
      )}

      {/* MODE 3: Google OTP Verification (Hiển thị sau khi Google OAuth callback hoặc gửi OTP qua mail) */}
      {mode === 'google_otp' && (
        <form onSubmit={handleGoogleVerifyOtp}>
          {/* Hộp thông báo màu xanh theo đúng yêu cầu đề bài */}
          <div
            style={{
              background: '#E8F5E9',
              border: '1px solid #A5D6A7',
              borderRadius: '6px',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>📩</div>
            <div style={{ fontSize: '0.92rem', color: '#1B5E20', fontWeight: 600, lineHeight: 1.4 }}>
              {sourceText(otpMessage)}
            </div>
            {googleEmail && (
              <div style={{ fontSize: '0.8rem', color: '#2E7D32', marginTop: '6px' }}>
                {sourceText("Tài khoản Google: ")}<strong>{googleEmail}</strong>
              </div>
            )}
          </div>

          {debugOtpCode && (
            <div
              style={{
                background: '#FFF3E0',
                border: '1px solid #FFE0B2',
                borderRadius: '6px',
                padding: '8px 12px',
                marginBottom: '16px',
                fontSize: '0.84rem',
                color: '#E65100',
                textAlign: 'center',
              }}
            >
              ⚙️ <strong>{sourceText("Chế độ Test (Không cần mở mail):")}</strong> {sourceText(" Đã tự động điền mã xác nhận ")}<strong>{debugOtpCode}</strong>
            </div>
          )}

          <div className="portal-form-group">
            <label className="portal-label" htmlFor="google-otp-code" style={{ textAlign: 'center', display: 'block' }}>
              {sourceText("Nhập mã xác nhận (6 chữ số):")}</label>
            <input
              id="google-otp-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="portal-input"
              placeholder="000000"
              style={{
                textAlign: 'center',
                fontSize: '1.8rem',
                letterSpacing: '0.3em',
                fontWeight: 700,
                padding: '12px',
              }}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </div>

          <button
            type="submit"
            className="luxury-login-submit-btn"
            style={{ width: '100%', marginBottom: '14px' }}
            disabled={isLoading || success || otpCode.length < 6}
          >
            {success ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                <StatusMark size={22} />
                {sourceText("ĐÃ KÍCH HOẠT THÀNH CÔNG")}</span>
            ) : (
              <>
                <span>{isLoading ? sourceText('ĐANG XÁC THỰC...') : sourceText('XÁC NHẬN & KÍCH HOẠT TÀI KHOẢN')}</span>
                <span className="submit-arrow" aria-hidden="true">→</span>
              </>
            )}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '0.82rem',
                color: 'var(--color-accent-gold)',
                cursor: countdown > 0 || isLoading || success ? 'not-allowed' : 'pointer',
                opacity: countdown > 0 || isLoading || success ? 0.6 : 1,
                padding: 0,
                fontWeight: 600,
              }}
              disabled={countdown > 0 || isLoading || success}
              onClick={handleGoogleSendOtp}
            >
              {countdown > 0 ? sourceFormat("Gửi lại mã sau ({0}s)", countdown) : sourceText('Gửi lại mã xác nhận')}
            </button>

            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                fontSize: '0.82rem',
                color: 'var(--color-text-muted)',
                cursor: isLoading || success ? 'not-allowed' : 'pointer',
                opacity: isLoading || success ? 0.6 : 1,
                padding: 0,
              }}
              disabled={isLoading || success}
              onClick={() => {
                setFormError('');
                setOtpCode('');
                setDebugOtpCode('');
                setGoogleEmail('');
                setOtpMessage('');
                setMode('standard');
              }}
            >
              {sourceText("Chọn tài khoản Google khác")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
