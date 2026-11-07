import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ManagerReportsPage } from './ManagerReportsPage';
const api = vi.hoisted(() => ({ getSummary: vi.fn(), createSnapshot: vi.fn(), toast: vi.fn() }));
vi.mock('./reportsApi', () => ({ reportsApi: api }));
vi.mock('../../shared/api/client', () => ({ getCurrentUser: () => ({ role: 'MANAGER' }) }));
vi.mock('../../shared/ui/toast', () => ({ toast: api.toast }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  api.getSummary.mockResolvedValue({ periodRevenue: 100, todayRevenue: 100, packagesSoldCount: 1, renewalRate: null,
    dailyRevenue: [{ date: '2026-10-21', revenue: 100, transactionCount: 1 }],
    packageRevenue: [{ packageId: 1, packageName: '=HYPERLINK("https://example.com")', subscriptionCount: 1, revenue: 100, percentage: 100 }],
    recentTransactions: [{ id: 1, invoiceNumber: '=invoice', memberName: ' +cmd', packageName: '@package', amount: 100, method: '=method', paidAt: '2026-10-21T08:00:00' }],
  });
  api.createSnapshot.mockResolvedValue({ id: 1 });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function exportReport() {
  await act(async () => root.render(<ManagerReportsPage />));
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Xuất báo cáo'))!;
  await act(async () => button.click());
}
it('protects every untrusted CSV text cell from spreadsheet formulas', async () => {
  await exportReport();
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  const csv = await blob.text();
  for (const value of ['=HYPERLINK(""https://example.com"")', '=invoice', ' +cmd', '@package', '=method']) {
    expect(csv).toContain('"' + "'" + value + '"');
  }
  expect(api.createSnapshot).toHaveBeenCalledTimes(1);
  expect(api.toast).toHaveBeenCalledWith('Đã lưu báo cáo đối soát và xuất tệp CSV.', 'success', { vi: 'Đã lưu báo cáo đối soát và xuất tệp CSV.', en: 'Reconciliation report saved and CSV exported.' });
});
it('does not report snapshot success or download a report when persistence fails', async () => {
  api.createSnapshot.mockRejectedValue(new Error('snapshot unavailable'));
  await exportReport();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  expect(api.toast).toHaveBeenCalledWith('snapshot unavailable', 'error');
  expect(api.toast).not.toHaveBeenCalledWith(expect.any(String), 'success');
});
