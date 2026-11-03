import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPaymentRequest, getMyPayments, type MemberSubscription } from './membershipApi';

const subscription: MemberSubscription = {
  id: 12, memberId: 34, packageId: 5, packageName: 'Essential',
  previousSubscriptionId: null, startDate: '2026-10-16', endDate: '2026-11-16',
  status: 'pending_payment', qrCode: null, createdAt: '2026-10-16T10:00:00',
};

describe('SCRUM-86 payment API', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it('reads member payments from the allowed endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getMyPayments()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/payments/my', expect.anything());
  });

  it('creates only a pending bank transfer request for the backend subscription', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: 90, status: 'pending' } }) });
    vi.stubGlobal('fetch', fetchMock);
    await createPaymentRequest(subscription, 500000);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/payments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      memberId: 34, subscriptionId: 12, amount: 500000, method: 'online_wallet',
    });
  });

  it.each([400, 403, 409])('propagates HTTP %i and backend code', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status,
      json: async () => ({ code: 'PAYMENT_REJECTED', message: 'Yêu cầu bị từ chối' }),
    }));
    await expect(createPaymentRequest(subscription, 500000)).rejects.toMatchObject({
      status, code: 'PAYMENT_REJECTED', message: 'Yêu cầu bị từ chối',
    });
  });
});
