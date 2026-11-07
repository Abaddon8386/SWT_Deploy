import { useSourceLanguage, sourceText } from "../shop/shopI18n";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal } from '../../shared/ui/Modal';
import { applyPwaUpdate, capturePwaInstall, clearInstallPrompt, getInstallPrompt, getWaitingRegistration, subscribePwaInstall, subscribePwaUpdate } from './registerPwa';
import './pwa.css';

function standalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PwaStatus({ mode = 'all' }: { mode?: 'status' | 'install' | 'all' }) {
  useSourceLanguage();
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [installed, setInstalled] = useState(standalone);
  const installPrompt = useSyncExternalStore(subscribePwaInstall, getInstallPrompt, () => null);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installError, setInstallError] = useState(false);
  const waiting = useSyncExternalStore(subscribePwaUpdate, getWaitingRegistration, () => null);
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  useEffect(() => {
    capturePwaInstall();
    const online = () => setOffline(false);
    const disconnected = () => setOffline(true);
    const didInstall = () => { setInstalled(true); setHelp(false); };
    const mode = window.matchMedia?.('(display-mode: standalone)');
    const changedMode = () => setInstalled(standalone());
    window.addEventListener('online', online);
    window.addEventListener('offline', disconnected);
    window.addEventListener('appinstalled', didInstall);
    mode?.addEventListener('change', changedMode);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('appinstalled', didInstall);
      mode?.removeEventListener('change', changedMode);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) { setHelp(true); return; }
    setBusy(true);
    setInstallError(false);
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
    } catch { setInstallError(true); }
    finally { clearInstallPrompt(); setBusy(false); }
  };

  return <div className="pwa-status" aria-label={sourceText("Ứng dụng SÖL")}>
    {mode !== 'install' && offline && <p className="pwa-status__notice" role="status"><strong>{sourceText("Đang ngoại tuyến.")}</strong> {sourceText(" Kết nối mạng để tải dữ liệu, gửi tin nhắn hoặc check-in.")}</p>}
    {mode !== 'install' && waiting && <div className="pwa-status__notice" role="status"><span>{sourceText("Đã có phiên bản mới. Hoàn tất thao tác đang làm trước khi cập nhật.")}</span><button className="btn-secondary" type="button" disabled={offline || busy} onClick={() => { if (applyPwaUpdate()) setBusy(true); }}>{sourceText("Cập nhật")}</button></div>}
    {mode !== 'status' && !installed && <button type="button" className="pwa-install-button" disabled={busy} onClick={() => void install()}>{busy ? sourceText('Đang mở cài đặt…') : installPrompt ? sourceText('Cài SÖL trên điện thoại') : sourceText('Thêm SÖL vào màn hình chính')}</button>}
    {installError && <p className="pwa-status__notice" role="alert">{sourceText("Chưa thể mở cài đặt. Hãy thử thêm ứng dụng từ menu trình duyệt.")}</p>}
    {help && <Modal title={sourceText("SÖL trên điện thoại")} onClose={() => setHelp(false)}>
      <p className="portal-subtitle">{sourceText("Mở nhanh portal từ màn hình chính và dùng camera để check-in.")}</p>
      {ios ? <ol className="pwa-install-steps"><li>{sourceText("Mở website này bằng Safari.")}</li><li>{sourceText("Chọn Chia sẻ, rồi Thêm vào MH chính.")}</li><li>{sourceText("Nếu có tùy chọn Mở dưới dạng ứng dụng web, hãy bật và chọn Thêm.")}</li></ol>
        : <ol className="pwa-install-steps"><li>{sourceText("Mở website này bằng Chrome trên Android.")}</li><li>{sourceText("Mở menu ⋮, chọn Cài đặt ứng dụng hoặc Thêm vào màn hình chính.")}</li><li>{sourceText("Xác nhận cài đặt, rồi mở biểu tượng SÖL.")}</li></ol>}
      <p className="portal-subtitle">{sourceText("Ứng dụng mở thẳng portal. Bạn cần đăng nhập nếu phiên đã hết hạn; check-in cần kết nối mạng.")}</p>
    </Modal>}
  </div>;
}
