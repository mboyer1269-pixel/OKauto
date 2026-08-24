import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@okauto/database';
import bcrypt from 'bcryptjs';
import { POST as loginHandler } from '@/app/api/v1/auth/login/route';
import { GET as presignGetHandler, POST as presignPostHandler } from '@/app/api/v1/photos/presign/route';
import { POST as addPhotoHandler } from '@/app/api/v1/vehicles/[id]/photos/route';
import { DELETE as deletePhotoHandler } from '@/app/api/v1/vehicles/[id]/photos/[photoId]/route';
import { GET as syncSourcesHandler, POST as createSyncSourceHandler } from '@/app/api/v1/admin/sync-sources/route';
import { PATCH as updateSyncSourceHandler, DELETE as deleteSyncSourceHandler } from '@/app/api/v1/admin/sync-sources/[id]/route';
import { POST as triggerSyncHandler } from '@/app/api/v1/admin/sync-sources/[id]/sync/route';
import { GET as syncHealthHandler } from '@/app/api/v1/admin/sync-health/route';

function makeRequest(url: string, options: RequestInit = {}): Request {
  return new Request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    },
  });
}

async function loginAs(email: string): Promise<string> {
  const res = await loginHandler(
    makeRequest('http://localhost/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'Demo1234!' }),
    }) as never
  );
  const data = await res.json();
  if (!data.accessToken) throw new Error(`Login failed for ${email}`);
  return data.accessToken;
}

describe('Phase 2 API integration', () => {
  let ownerToken: string;
  let salesToken: string;
  let vehicleId: string;
  let syncSourceId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Demo1234!', 12);
    const owner = await prisma.user.upsert({
      where: { email: 'owner@demo.okauto.local' },
      update: { passwordHash },
      create: { email: 'owner@demo.okauto.local', passwordHash, name: 'Michael Boyer' },
    });
    const sales = await prisma.user.upsert({
      where: { email: 'sales@demo.okauto.local' },
      update: { passwordHash },
      create: { email: 'sales@demo.okauto.local', passwordHash, name: 'Équipe Marketplace' },
    });
    const org = await prisma.organization.upsert({
      where: { slug: 'demo-motors' },
      update: {},
      create: { name: 'Demo Motors', slug: 'demo-motors' },
    });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: owner.id } },
      update: { role: 'OWNER' },
      create: { organizationId: org.id, userId: owner.id, role: 'OWNER' },
    });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: sales.id } },
      update: { role: 'SALESPERSON' },
      create: { organizationId: org.id, userId: sales.id, role: 'SALESPERSON' },
    });

    ownerToken = await loginAs('owner@demo.okauto.local');
    salesToken = await loginAs('sales@demo.okauto.local');

    const vehicle = await prisma.vehicle.findFirst({
      where: { organizationId: org.id },
      select: { id: true },
    });
    vehicleId = vehicle!.id;
  });

  afterAll(async () => {
    if (syncSourceId) {
      await prisma.syncSource.deleteMany({ where: { id: syncSourceId } });
    }
  });

  describe('S3 presign', () => {
    it('reports storage not configured in CI', async () => {
      const res = await presignGetHandler(
        makeRequest('http://localhost/api/v1/photos/presign', {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.configured).toBe(false);
    });

    it('returns 503 when S3 not configured for upload', async () => {
      const res = await presignPostHandler(
        makeRequest('http://localhost/api/v1/photos/presign', {
          method: 'POST',
          headers: { Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({
            vehicleId,
            filename: 'test.jpg',
            contentType: 'image/jpeg',
          }),
        }),
        { params: Promise.resolve({}) }
      );
      expect(res.status).toBe(503);
    });
  });

  describe('Photo CRUD', () => {
    let photoId: string;

    it('allows salesperson to add photo via URL', async () => {
      const res = await addPhotoHandler(
        makeRequest(`http://localhost/api/v1/vehicles/${vehicleId}/photos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${salesToken}` },
          body: JSON.stringify({ url: 'https://placehold.co/400x300/png?text=Test' }),
        }),
        { params: Promise.resolve({ id: vehicleId }) }
      );
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.url).toContain('placehold.co');
      photoId = data.id;
    });

    it('rejects invalid photo URL', async () => {
      const res = await addPhotoHandler(
        makeRequest(`http://localhost/api/v1/vehicles/${vehicleId}/photos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ url: 'not-a-url' }),
        }),
        { params: Promise.resolve({ id: vehicleId }) }
      );
      expect(res.status).toBe(400);
    });

    it('allows manager to delete photo', async () => {
      const res = await deletePhotoHandler(
        makeRequest(`http://localhost/api/v1/vehicles/${vehicleId}/photos/${photoId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({ id: vehicleId, photoId }) }
      );
      expect(res.status).toBe(200);
    });

    it('forbids salesperson from deleting photos', async () => {
      const createRes = await addPhotoHandler(
        makeRequest(`http://localhost/api/v1/vehicles/${vehicleId}/photos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ url: 'https://placehold.co/400x300/png?text=Del' }),
        }),
        { params: Promise.resolve({ id: vehicleId }) }
      );
      const created = await createRes.json();

      const res = await deletePhotoHandler(
        makeRequest(`http://localhost/api/v1/vehicles/${vehicleId}/photos/${created.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${salesToken}` },
        }),
        { params: Promise.resolve({ id: vehicleId, photoId: created.id }) }
      );
      expect(res.status).toBe(403);

      await deletePhotoHandler(
        makeRequest(`http://localhost/api/v1/vehicles/${vehicleId}/photos/${created.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({ id: vehicleId, photoId: created.id }) }
      );
    });
  });

  describe('Sync sources', () => {
    it('creates a sync source', async () => {
      const res = await createSyncSourceHandler(
        makeRequest('http://localhost/api/v1/admin/sync-sources', {
          method: 'POST',
          headers: { Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({
            name: 'Test Feed',
            url: 'https://example.com/inventory.json',
            adapter: 'generic',
            intervalMinutes: 60,
          }),
        }),
        { params: Promise.resolve({}) }
      );
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.name).toBe('Test Feed');
      syncSourceId = data.id;
    });

    it('lists sync sources', async () => {
      const res = await syncSourcesHandler(
        makeRequest('http://localhost/api/v1/admin/sync-sources', {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.sources.some((s: { id: string }) => s.id === syncSourceId)).toBe(true);
    });

    it('updates sync source', async () => {
      const res = await updateSyncSourceHandler(
        makeRequest(`http://localhost/api/v1/admin/sync-sources/${syncSourceId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ isActive: false }),
        }),
        { params: Promise.resolve({ id: syncSourceId }) }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.isActive).toBe(false);
    });

    it('queues manual sync job', async () => {
      const res = await triggerSyncHandler(
        makeRequest(`http://localhost/api/v1/admin/sync-sources/${syncSourceId}/sync`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({ id: syncSourceId }) }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.queued).toBe(true);
    });

    it('returns sync health with sources', async () => {
      const res = await syncHealthHandler(
        makeRequest('http://localhost/api/v1/admin/sync-health', {
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({}) }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.health).toBeDefined();
      expect(Array.isArray(data.sources)).toBe(true);
    });

    it('forbids salesperson from creating sync sources', async () => {
      const res = await createSyncSourceHandler(
        makeRequest('http://localhost/api/v1/admin/sync-sources', {
          method: 'POST',
          headers: { Authorization: `Bearer ${salesToken}` },
          body: JSON.stringify({
            name: 'Blocked',
            url: 'https://example.com/feed.json',
            adapter: 'generic',
          }),
        }),
        { params: Promise.resolve({}) }
      );
      expect(res.status).toBe(403);
    });

    it('deletes sync source', async () => {
      const res = await deleteSyncSourceHandler(
        makeRequest(`http://localhost/api/v1/admin/sync-sources/${syncSourceId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${ownerToken}` },
        }),
        { params: Promise.resolve({ id: syncSourceId }) }
      );
      expect(res.status).toBe(200);
      syncSourceId = '';
    });
  });
});
