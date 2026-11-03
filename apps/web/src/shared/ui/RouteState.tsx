import { useRouteError } from 'react-router-dom';
import { isModuleLoadError } from '../lib/routeErrors';
import { LoadingSkeleton } from './LoadingSkeleton';
import './route-state.css';

export function RouteLoading() {
  return <main className="route-state route-state--loading">
    <LoadingSkeleton label="Đang tải trang…" variant="cards" count={3} />
  </main>;
}

export function RouteLoadError() {
  const network = isModuleLoadError(useRouteError());
  return <main className="route-state" role="alert">
    <h1>{network ? 'Không thể tải trang' : 'Trang gặp lỗi khi hiển thị'}</h1>
    <p>{network ? 'Kiểm tra kết nối rồi tải lại trang để tiếp tục.' : 'Hãy tải lại trang. Nếu lỗi lặp lại, vui lòng báo cho quản trị viên.'}</p>
    <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
  </main>;
}

/** Lỗi của một màn hình portal: hiển thị trong vùng nội dung, giữ nguyên sidebar, topbar và điều hướng. */
export function PortalRouteError() {
  const network = isModuleLoadError(useRouteError());
  return <section className="portal-container portal-route-error" role="alert">
    <h1 className="portal-title">{network ? 'Không thể tải màn hình này' : 'Màn hình gặp lỗi khi hiển thị'}</h1>
    <p className="portal-subtitle">{network
      ? 'Kiểm tra kết nối mạng rồi tải lại. Các màn hình khác vẫn dùng được từ thanh điều hướng.'
      : 'Dữ liệu nhận được không như mong đợi. Hãy tải lại; nếu lỗi lặp lại, vui lòng báo cho quản trị viên.'}</p>
    <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Tải lại trang</button>
  </section>;
}
