import { LoadingSkeleton } from './LoadingSkeleton';
import './route-state.css';

export function RouteLoading() {
  return <main className="route-state route-state--loading">
    <LoadingSkeleton label="Đang tải trang…" variant="cards" count={3} />
  </main>;
}

export function RouteLoadError() {
  return <main className="route-state" role="alert">
    <h1>Không thể tải trang</h1>
    <p>Kiểm tra kết nối rồi tải lại trang để tiếp tục.</p>
    <button type="button" onClick={() => window.location.reload()}>Tải lại trang</button>
  </main>;
}
