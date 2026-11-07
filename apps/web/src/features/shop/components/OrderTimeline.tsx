import { useSourceLanguage, sourceText, sourceToast as toast } from '../shopI18n';
import { formatCenterDateTime } from '../../../shared/lib/centerTime';
import type { OrderDto } from '../shopTypes';

interface TimelineStep {
  key: string;
  label: string;
  timestamp: string | null;
  reached: boolean;
  extra?: 'tracking' | 'cancelReason';
}

function buildTimelineSteps(order: OrderDto): TimelineStep[] {
  const isPickup = order.fulfillment === 'pickup';
  const isCancelled = order.status === 'cancelled' || Boolean(order.cancelledAt);

  const sequence: Array<{
    key: string;
    label: string;
    timestamp: string | null;
    extra?: 'tracking';
  }> = [
    { key: 'created', label: 'Đặt hàng', timestamp: order.createdAt },
    {
      key: 'paid',
      label: order.paymentMethod === 'counter' ? 'Đã thu tiền tại quầy' : 'Đã thanh toán',
      timestamp: order.paidAt,
    },
    { key: 'processing', label: 'Đang chuẩn bị', timestamp: order.processingAt },
    isPickup
      ? { key: 'ready', label: 'Chờ nhận tại quầy', timestamp: order.readyAt }
      : { key: 'shipping', label: 'Đang giao', timestamp: order.shippedAt, extra: 'tracking' },
    {
      key: 'completed',
      label: isPickup ? 'Đã nhận tại quầy' : 'Đã giao',
      timestamp: order.completedAt,
    },
  ];

  const reached: TimelineStep[] = [];
  let nextPending: TimelineStep | null = null;

  for (const step of sequence) {
    if (step.timestamp) {
      reached.push({
        key: step.key,
        label: step.label,
        timestamp: step.timestamp,
        reached: true,
        extra: step.extra,
      });
    } else if (!isCancelled && order.status !== 'completed' && !nextPending) {
      nextPending = {
        key: step.key,
        label: step.label,
        timestamp: null,
        reached: false,
      };
    }
  }

  if (isCancelled) {
    reached.push({
      key: 'cancelled',
      label: 'Đã hủy',
      timestamp: order.cancelledAt,
      reached: true,
      extra: 'cancelReason',
    });
    return reached;
  }

  return nextPending ? [...reached, nextPending] : reached;
}

export function OrderTimeline({ order }: { order: OrderDto }) {
  useSourceLanguage();
  const steps = buildTimelineSteps(order);

  const handleCopyTracking = async () => {
    if (!order.trackingNumber) return;
    try {
      await navigator.clipboard?.writeText(order.trackingNumber);
    } catch {
      // Fallback in restricted environments
    }
    toast.success('Đã sao chép mã vận đơn');
  };

  return (
    <section aria-label={sourceText("Tiến trình đơn hàng")} className="stack">
      <h3 className="portal-card-title">{sourceText("Tiến trình")}</h3>
      <ol className="shop-timeline">
        {steps.map(step => (
          <li
            key={step.key}
            className={`shop-timeline__step ${step.reached ? 'is-reached' : 'is-pending'}`}
          >
            <span className="shop-timeline__dot" aria-hidden="true" />
            <div className="shop-timeline__content" style={{ flex: 1 }}>
              <div className="shop-timeline__row" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong className="shop-timeline__label">{sourceText(step.label)}</strong>
                {step.reached && step.timestamp && (
                  <span className="shop-timeline__time muted">
                    {formatCenterDateTime(step.timestamp)}
                  </span>
                )}
              </div>
              {step.extra === 'tracking' && order.trackingNumber && (
                <div className="shop-timeline__tracking" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <span>
                    {order.trackingCarrier ? `${order.trackingCarrier} · ` : ''}
                    <strong>{order.trackingNumber}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn-secondary btn-sm"
                    onClick={() => void handleCopyTracking()}
                  >
                    {sourceText("Sao chép")}</button>
                </div>
              )}
              {step.extra === 'cancelReason' && order.cancelReason && (
                <p className="muted" style={{ margin: '4px 0 0' }}>
                  {sourceText("Lý do: ")}{order.cancelReason}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      {order.fulfillment === 'pickup' && (
        <div className="shop-timeline__pickup">
          <p style={{ margin: 0 }}>
            <strong>{sourceText("Nhận tại quầy SÖL:")}</strong> {order.pickupAddress || sourceText('Quầy lễ tân trung tâm SÖL Fitness')}
          </p>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {sourceText("Mang thẻ hội viên khi đến nhận hàng tại quầy.")}</p>
        </div>
      )}
    </section>
  );
}
