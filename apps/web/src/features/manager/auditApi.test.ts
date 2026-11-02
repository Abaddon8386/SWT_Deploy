import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditApi } from './auditApi';
import * as client from '../../shared/api/client';

vi.mock('../../shared/api/client', () => ({
  apiFetch: vi.fn(),
}));

describe('auditApi', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not send the ALL placeholder as a filter, which the API would match literally', async () => {
    vi.mocked(client.apiFetch).mockResolvedValueOnce({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 8 });

    await auditApi.getAuditLogs({ action: 'ALL', entityType: 'ALL', page: 0, size: 8 });

    expect(client.apiFetch).toHaveBeenCalledWith('/admin/audit-logs?page=0&size=8');
  });

  it('sends real filters', async () => {
    vi.mocked(client.apiFetch).mockResolvedValueOnce({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 8 });

    await auditApi.getAuditLogs({ action: 'UPDATE', entityType: 'payments', page: 2, size: 8 });

    expect(client.apiFetch).toHaveBeenCalledWith('/admin/audit-logs?entity_type=payments&action=UPDATE&page=2&size=8');
  });

  it('surfaces request failures instead of substituting sample logs', async () => {
    vi.mocked(client.apiFetch).mockRejectedValueOnce(new Error('Không có quyền'));

    await expect(auditApi.getAuditLogs()).rejects.toThrow('Không có quyền');
  });

  it('returns an empty occupancy report as empty, not as sample data', async () => {
    vi.mocked(client.apiFetch).mockResolvedValueOnce([]);

    await expect(auditApi.getClassOccupancy()).resolves.toEqual([]);
  });

  it('rejects a malformed occupancy response', async () => {
    vi.mocked(client.apiFetch).mockResolvedValueOnce(null);

    await expect(auditApi.getClassOccupancy()).rejects.toThrow();
  });
});
