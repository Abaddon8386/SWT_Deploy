import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { register, sendOtp as requestOtp, verifyOtp } from './authApi';
import { AuthLayout } from '../landing/components/PublicLayout';
import { purchaseAuthPath, rememberPurchaseIntent } from '../../shared/lib/purchaseIntent';
import { StatusMark } from '../../shared/ui/StatusMark';
import { toast } from '../../shared/ui/toast';
import { registrationSchema, otpSchema, type RegistrationFields } from './authValidation';
import { readPendingRegistration, savePendingRegistration, type PendingRegistration } from './pendingRegistration';
import { errorMessage } from '../../shared/lib/errorMessage';

const RESEND_COOLDOWN = 30;

export function RegisterPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  useEffect(() => rememberPurchaseIntent(search), [search]);
  const [pendingAccount, setPendingAccount] = useState(readPendingRegistration);
  const step = pendingAccount ? 'otp' : 'register';
  const [form, setForm] = useState({ username: '', email: '', phone: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [debugOtp, setDebugOtp] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof RegistrationFields, string>>>({});
  const [busy, setBusy] = useState(false);
  const requestBusy = useRef(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(() => Math.max(0, Math.ceil(((pendingAccount?.resendAt ?? 0) - Date.now()) / 1000)));

  // Timer countdown for resending OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const sendOtp = async (account: PendingRegistration = pendingAccount!) => {
    const res = await requestOtp(account.email);
    setDebugOtp(res.debugOtp || '');
    const next = { ...account, resendAt: Date.now() + RESEND_COOLDOWN * 1000 };
    savePendingRegistration(next);
    setPendingAccount(next);
    setCountdown(RESEND_COOLDOWN);
    toast(`Mã OTP đã được gửi tới ${account.email}`);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestBusy.current) return;
    const parsed = registrationSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map(issue => [issue.path[0], issue.message])));
      setError('Vui lòng kiểm tra thông tin được đánh dấu.');
      document.getElementById(`reg-${String(parsed.error.issues[0].path[0])}`)?.focus();
      return;
    }
    setFieldErrors({});

    requestBusy.current = true;
    setBusy(true);
    setError('');

    try {
      await register(parsed.data);
      const account = { username: parsed.data.username, email: parsed.data.email, createdAt: Date.now(), resendAt: 0 };
      savePendingRegistration(account);
      setPendingAccount(account);
      setForm(previous => ({ ...previous, password: '' }));
      await sendOtp(account);
    } catch (err) {
      setError(errorMessage(err, 'Đăng ký không thành công.'));
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0 || requestBusy.current || !pendingAccount || success) return;
    requestBusy.current = true;
    setBusy(true);
    setError('');
    try {
      await sendOtp();
    } catch (err) {
      setError(errorMessage(err, 'Không thể gửi lại mã OTP.'));
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (requestBusy.current || !pendingAccount || success) return;
    const parsed = otpSchema.safeParse(otp);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    requestBusy.current = true;
    setBusy(true);
    setError('');

    try {
      await verifyOtp(pendingAccount!.email, parsed.data);
      savePendingRegistration(null);
      setSuccess(true);
      toast('Tài khoản đã được kích hoạt thành công!', 'success');
      navigate(purchaseAuthPath('/login', search), { replace: true, viewTransition: true });
    } catch (err) {
      setError(errorMessage(err, 'Xác thực OTP thất bại.'));
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  };

  return <AuthLayout mode="register">
    <div className="fit-auth-card">
      <header>
        <span className="fit-kicker">WELCOME TO THE CLUB</span>
        <h2>{step === 'register' ? 'Đăng ký hội viên' : 'Xác thực OTP'}</h2>
        <p>{step === 'register' ? 'Bắt đầu hành trình thể chất theo cách của bạn.' : `Nhập mã gồm 6 chữ số đã gửi tới ${pendingAccount?.email}.`}</p>
      </header>
      {error && <div role="alert" className="portal-alert">{error}</div>}
      {step === 'register' ? <form onSubmit={handleRegister} aria-busy={busy} noValidate>
        <div className="portal-form-group">
          <label className="portal-label" htmlFor="reg-username">Tên đăng nhập</label>
          <input id="reg-username" aria-invalid={!!fieldErrors.username} aria-describedby={fieldErrors.username ? 'reg-username-error' : undefined} className="portal-input" type="text" autoComplete="username" placeholder="Tên đăng nhập của bạn" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          {fieldErrors.username && <p id="reg-username-error" className="portal-field-error">{fieldErrors.username}</p>}
        </div>
        <div className="portal-form-group">
          <label className="portal-label" htmlFor="reg-email">Địa chỉ email</label>
          <input id="reg-email" aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? 'reg-email-error' : undefined} className="portal-input" type="email" autoComplete="email" placeholder="ban@example.com" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          {fieldErrors.email && <p id="reg-email-error" className="portal-field-error">{fieldErrors.email}</p>}
        </div>
        <div className="portal-form-group">
          <label className="portal-label" htmlFor="reg-phone">Số điện thoại <small>(Tùy chọn)</small></label>
          <input id="reg-phone" aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone ? 'reg-phone-error' : undefined} className="portal-input" type="tel" autoComplete="tel" placeholder="0912 345 678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {fieldErrors.phone && <p id="reg-phone-error" className="portal-field-error">{fieldErrors.phone}</p>}
        </div>
        <div className="portal-form-group">
          <div className="portal-label-row">
            <label className="portal-label" htmlFor="reg-password">Mật khẩu</label>
            <button className="fit-auth-link" type="button" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</button>
          </div>
          <input id="reg-password" aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? 'reg-password-error' : undefined} className="portal-input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Tối thiểu 6 ký tự" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {fieldErrors.password && <p id="reg-password-error" className="portal-field-error">{fieldErrors.password}</p>}
        </div>
        <button className="luxury-login-submit-btn" type="submit" disabled={busy}><span>{busy ? 'ĐANG TẠO TÀI KHOẢN...' : 'TIẾP TỤC XÁC THỰC'}</span><span className="submit-arrow" aria-hidden="true">→</span></button>
      </form> : <form onSubmit={handleVerify} aria-busy={busy}>
        {debugOtp && <div className="fit-debug-otp">Mã OTP thử nghiệm (debug): <strong>{debugOtp}</strong></div>}
        <div className="portal-form-group">
          <label className="portal-label" htmlFor="otp-code">Nhập mã 6 chữ số</label>
          <input id="otp-code" className="portal-input fit-otp-input" type="text" inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="000000" autoFocus required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} />
        </div>
        <button className="luxury-login-submit-btn" type="submit" disabled={busy || success}>
          {success ? <><StatusMark size={22} /><span>ĐÃ KÍCH HOẠT</span></> : <><span>{busy ? 'ĐANG XÁC THỰC...' : 'XÁC THỰC & HOÀN TẤT'}</span><span className="submit-arrow" aria-hidden="true">→</span></>}
        </button>
        <div className="fit-otp-actions">
          <details>
            <summary className="fit-auth-link">Thông tin tài khoản đã tạo</summary>
            <p className="row-card__meta">{pendingAccount?.username} · {pendingAccount?.email}</p>
            <p className="row-card__meta">Tài khoản đã được tạo. Xác thực email trước khi cập nhật thông tin trong hồ sơ.</p>
            <p className="row-card__meta">Nếu email chưa đúng, bạn có thể tạo tài khoản khác với tên đăng nhập và email mới. Tài khoản đã tạo vẫn được giữ trên hệ thống.</p>
            <button type="button" className="fit-auth-link" disabled={busy || success} onClick={() => {
              savePendingRegistration(null); setPendingAccount(null); setError(''); setOtp(''); setDebugOtp(''); setCountdown(0);
              setForm({ username: '', email: '', phone: '', password: '' }); setFieldErrors({});
            }}>Đăng ký tài khoản khác</button>
          </details>
          <button className="fit-auth-link" type="button" disabled={countdown > 0 || busy || success} onClick={handleResendOtp}>{countdown > 0 ? `Gửi lại mã sau ${countdown}s` : 'Gửi lại mã OTP'}</button>
        </div>
      </form>}
      <p className="fit-auth-bottom">Đã có tài khoản? <Link to={purchaseAuthPath('/login', search)}>Đăng nhập ngay ↗</Link></p>
    </div>
  </AuthLayout>;
}
