import { memberMessage, memberText, memberRenderMessage } from '../member/memberI18n';
import type { SourceMessage } from '../../shared/i18n/language';
import { useLanguage } from '../../shared/i18n/language';
import { useEffect, useRef, useState } from 'react';
import type QrScanner from 'qr-scanner';
import './qr-checkin.css';

const DEFAULT_HINT = 'Quét mã QR cổng trên màn hình lễ tân. Camera chỉ dùng để đọc mã và không lưu hình ảnh.';

export function QrCameraScanner({ onScan, disabled = false, hint = DEFAULT_HINT }: { onScan: (code: string) => void; disabled?: boolean; hint?: string }) {
  const { lang } = useLanguage();

  const video = useRef<HTMLVideoElement>(null);
  const videoHost = useRef<HTMLDivElement>(null);
  useEffect(() => { videoHost.current?.querySelector('video')?.setAttribute('aria-label', memberText('Hình ảnh camera quét mã QR')); }, [lang]);
  const scanner = useRef<QrScanner | null>(null);
  const run = useRef(0);
  const [phase, setPhase] = useState<'ready' | 'starting' | 'scanning' | 'done'>('ready');
  const [error, setError] = useState<string | SourceMessage>('');

  function release() {
    run.current += 1;
    scanner.current?.destroy();
    scanner.current = null;
    const stream = video.current?.srcObject;
    if (stream && 'getTracks' in stream) stream.getTracks().forEach((track) => track.stop());
    if (video.current) video.current.srcObject = null;
  }

  useEffect(() => {
    const hide = () => {
      if (document.hidden) { release(); setPhase('ready'); }
    };
    const pagehide = () => { release(); setPhase('ready'); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', pagehide);
    return () => { release(); document.removeEventListener('visibilitychange', hide); window.removeEventListener('pagehide', pagehide); };
  }, []);

  useEffect(() => {
    if (disabled) { release(); setPhase((current) => current === 'done' ? 'done' : 'ready'); }
  }, [disabled]);

  async function start() {
    if (disabled || phase === 'starting' || phase === 'scanning') return;
    setError('');
    if (!window.isSecureContext) { setError(memberMessage("Camera cần kết nối HTTPS. Hãy mở trang bằng địa chỉ bảo mật của trung tâm.")); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError(memberMessage("Trình duyệt chưa hỗ trợ camera. Hãy mở bằng Safari hoặc Chrome và cho phép truy cập camera.")); return; }
    release();
    const current = run.current;
    setPhase('starting');
    try {
      const { default: Decoder } = await import('qr-scanner');
      if (run.current !== current || !videoHost.current || document.hidden) return;
      // The decoder owns this child. A fresh node isolates its delayed stop callback
      // from the next run, even when the user retries immediately after a scan.
      const element = document.createElement('video');
      element.muted = true;
      element.playsInline = true;
      element.setAttribute('aria-label', memberText('Hình ảnh camera quét mã QR'));
      videoHost.current.replaceChildren(element);
      video.current = element;
      const instance = new Decoder(element, ({ data }) => {
        if (run.current !== current || !data.trim()) return;
        release();
        setPhase('done');
        onScan(data.trim());
      }, { preferredCamera: 'environment', returnDetailedScanResult: true, maxScansPerSecond: 8 });
      scanner.current = instance;
      await instance.start();
      if (run.current !== current) { instance.destroy(); return; }
      setPhase('scanning');
    } catch {
      if (run.current !== current) return;
      release(); setPhase('ready');
      setError(memberMessage("Không thể mở camera. Cho phép quyền camera trong cài đặt trình duyệt, đóng ứng dụng đang dùng camera rồi thử lại."));
    }
  }

  return <section data-i18n-managed className={`qr-camera${phase === 'done' ? ' qr-camera--done' : ''}`} aria-label={memberText("Camera quét QR")}>
    <div className={`qr-camera__preview ${phase === 'scanning' ? 'qr-camera__preview--active' : ''}`}>
      <div ref={videoHost} className="qr-camera__video-host" />
      <div className="qr-camera__frame" aria-hidden="true" />
      {phase !== 'scanning' && <div className="qr-camera__placeholder"><span>{phase === 'starting' ? memberText("Đang mở camera…") : phase === 'done' ? memberText("Đã đọc mã QR") : memberText("Đưa mã QR vào khung")}</span></div>}
    </div>
    <p className="qr-checkin-hint">{hint === DEFAULT_HINT ? memberText(DEFAULT_HINT) : hint}</p>
    {error && <p role="alert" className="qr-checkin-error">{memberRenderMessage(error)}</p>}
    <button type="button" className="btn-primary qr-camera__button" disabled={disabled || phase === 'starting'}
      onClick={() => { if (phase === 'scanning') { release(); setPhase('ready'); } else void start(); }}>
      {phase === 'starting' ? memberText("Đang mở camera…") : phase === 'scanning' ? memberText("Dừng camera") : phase === 'done' ? memberText("Quét lại") : memberText("Bật camera")}
    </button>
  </section>;
}
