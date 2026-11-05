import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogApi } from './catalogApi';

describe('catalogApi.ts (Disciplines, Rooms, Packages CRUD)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('handles disciplines list and create/update', async () => {
    const yoga = { id: 1, name: 'Yoga', description: 'Mindfulness' };
    const mockList = [yoga, { id: 5, name: 'Pilates', description: 'Core strength' }];
    const mockCreated = { id: 2, name: 'Yoga', description: 'Mindfulness' };

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: mockList }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ success: true, data: mockCreated }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { ...mockCreated, name: 'Hot Yoga' } }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const list = await catalogApi.disciplines();
    // Quản lý được xem và chỉnh sửa toàn bộ bộ môn trong danh mục.
    expect(list).toEqual(mockList);

    const created = await catalogApi.saveDiscipline(null, { name: 'Yoga', description: 'Mindfulness' });
    expect(created.id).toBe(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/disciplines',
      expect.objectContaining({ method: 'POST' }),
    );

    const updated = await catalogApi.saveDiscipline(2, { name: 'Hot Yoga', description: 'Mindfulness' });
    expect(updated.name).toBe('Hot Yoga');
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      '/api/v1/disciplines/2',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('handles rooms list and create/update', async () => {
    const mockRoom = { id: 1, name: 'Studio A', location: 'Floor 2', capacity: 20, status: 'available' as const };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [mockRoom] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const rooms = await catalogApi.rooms();
    expect(rooms).toHaveLength(1);
    expect(rooms[0].capacity).toBe(20);
  });

  it('handles packages list, save, and status update', async () => {
    const mockPackage = {
      id: 10,
      name: 'Monthly Gold',
      description: null,
      price: 1500000,
      durationDays: 30,
      classCreditLimit: null,
      status: 'active' as const,
    };

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [mockPackage] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { ...mockPackage, status: 'inactive' } }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const pkgs = await catalogApi.packages();
    expect(pkgs[0].name).toBe('Monthly Gold');

    const updated = await catalogApi.setPackageStatus(10, 'inactive');
    expect(updated.status).toBe('inactive');
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      '/api/v1/packages/10/status',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      }),
    );
  });

  it('deletes disciplines, rooms and packages with DELETE and surfaces an in-use conflict', async () => {
    const ok = { ok: true, status: 200, json: async () => ({ success: true, data: null }) };
    const conflict = {
      ok: false,
      status: 409,
      json: async () => ({ success: false, code: 'ROOM_IN_USE', message: 'Phòng đang được dùng' }),
    };
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce(ok)
      .mockResolvedValueOnce(conflict);
    vi.stubGlobal('fetch', mockFetch);

    await catalogApi.deleteDiscipline(3);
    await catalogApi.deleteRoom(4);
    await catalogApi.deletePackage(5);
    await expect(catalogApi.deleteRoom(6)).rejects.toThrow();

    expect(mockFetch).toHaveBeenNthCalledWith(1, '/api/v1/disciplines/3', expect.objectContaining({ method: 'DELETE' }));
    expect(mockFetch).toHaveBeenNthCalledWith(2, '/api/v1/rooms/4', expect.objectContaining({ method: 'DELETE' }));
    expect(mockFetch).toHaveBeenNthCalledWith(3, '/api/v1/packages/5', expect.objectContaining({ method: 'DELETE' }));
  });
});
