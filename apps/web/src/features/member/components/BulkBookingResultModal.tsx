import { Modal } from '../../../shared/ui/Modal';
import type { BulkSkipped, SessionBookingDto } from '../memberClassesApi';

const shortDate = (iso: string) => iso.split('-').reverse().join('/');

interface Props {
  /** "book" lists seats that were reserved, "cancel" lists seats that were released. */
  mode: 'book' | 'cancel';
  done: SessionBookingDto[];
  skipped: BulkSkipped[];
  onClose: () => void;
}

/** Outcome of a bulk booking or cancellation: what changed and why each remaining session was left alone. */
export function BulkBookingResultModal({ mode, done, skipped, onClose }: Props) {
  const verb = mode === 'book' ? 'đặt' : 'hủy';
  return (
    <Modal title={mode === 'book' ? 'Kết quả đặt nhiều buổi' : 'Kết quả hủy nhiều buổi'} onClose={onClose}>
      <div role="status" style={{ display: 'grid', gap: 12 }}>
        <p style={{ margin: 0 }}>
          {done.length > 0
            ? <>Đã {verb} <strong>{done.length}</strong> buổi{skipped.length > 0 ? `, chưa ${verb} được ${skipped.length} buổi.` : '.'}</>
            : <strong>Không {verb} được buổi nào.</strong>}
        </p>
        {done.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 220, overflowY: 'auto' }}>
            {done.map((item) => (
              <li key={item.id}>
                {shortDate(item.sessionDate)} · {item.startTime.slice(0, 5)}–{item.endTime.slice(0, 5)} · {item.className}
              </li>
            ))}
          </ul>
        )}
        {skipped.length > 0 && (
          <div className="portal-alert">
            <strong>Các buổi chưa {verb} được:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, maxHeight: 220, overflowY: 'auto' }}>
              {skipped.map((item) => (
                <li key={`${item.id}-${item.code}`}>
                  {item.date ? shortDate(item.date) : `Mã ${item.id}`}: {item.message || item.code}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-primary" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </Modal>
  );
}
