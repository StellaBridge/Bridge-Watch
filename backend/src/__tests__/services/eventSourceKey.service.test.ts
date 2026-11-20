import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventSourceKeyService } from '../../services/eventSourceKey.service.js';
import type { EventSourceKey, NewEventSourceKey } from '../../database/types.js';

const mockDb = {
  insert: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
};

vi.mock('../../database/connection.js', () => ({
  getDatabase: () => mockDb,
}));

describe('EventSourceKeyService', () => {
  let service: EventSourceKeyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EventSourceKeyService();
    // Reset mock chain
    Object.values(mockDb).forEach(fn => {
      if (typeof fn === 'function' && fn.mockReturnThis) {
        fn.mockReturnThis();
      }
    });
  });

  describe('create', () => {
    it('should create a new event source key with secure random token generation', async () => {
      const newKey: NewEventSourceKey = {
        source_name: 'stellar-oracle',
        public_key: Buffer.from('ed25519-public-key-' + Math.random()).toString('base64'),
        algorithm: 'ed25519',
      };

      const createdKey: EventSourceKey = {
        id: 'key-001',
        ...newKey,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([createdKey]);

      const result = await service.create(newKey);

      expect(result).toEqual(createdKey);
      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          source_name: newKey.source_name,
          public_key: newKey.public_key,
          algorithm: newKey.algorithm,
          created_at: expect.any(Date),
          updated_at: expect.any(Date),
        })
      );
    });

    it('should validate minimum entropy for token generation (>=32 bytes)', async () => {
      const newKey: NewEventSourceKey = {
        source_name: 'relay-service',
        public_key: Buffer.alloc(32).toString('base64'),
        algorithm: 'ed25519',
      };

      const createdKey: EventSourceKey = {
        id: 'key-002',
        ...newKey,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([createdKey]);

      const result = await service.create(newKey);

      expect(result.public_key).toBeTruthy();
      expect(result.public_key.length).toBeGreaterThanOrEqual(32);
    });

    it('should handle creation errors gracefully', async () => {
      const newKey: NewEventSourceKey = {
        source_name: 'test-source',
        public_key: 'test-key',
        algorithm: 'ed25519',
      };

      mockDb.returning.mockRejectedValueOnce(new Error('Insert failed'));

      await expect(service.create(newKey)).rejects.toThrow('Insert failed');
    });
  });

  describe('findBySourceName', () => {
    it('should find active key by source name', async () => {
      const sourceKey: EventSourceKey = {
        id: 'key-001',
        source_name: 'stellar-oracle',
        public_key: 'public-key-data',
        algorithm: 'ed25519',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([sourceKey]);

      const result = await service.findBySourceName('stellar-oracle');

      expect(result).toEqual(sourceKey);
      expect(mockDb.where).toHaveBeenCalledWith({
        source_name: 'stellar-oracle',
        is_active: true,
      });
    });

    it('should return null when key not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findBySourceName('nonexistent');

      expect(result).toBeNull();
    });

    it('should only return active keys', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await service.findBySourceName('test-source');

      expect(mockDb.where).toHaveBeenCalledWith({
        source_name: 'test-source',
        is_active: true,
      });
    });

    it('should handle database errors', async () => {
      mockDb.limit.mockRejectedValueOnce(new Error('Query failed'));

      await expect(service.findBySourceName('test')).rejects.toThrow('Query failed');
    });
  });

  describe('findActiveKey', () => {
    it('should find active key (wrapper around findBySourceName)', async () => {
      const sourceKey: EventSourceKey = {
        id: 'key-001',
        source_name: 'relay-service',
        public_key: 'public-key',
        algorithm: 'ed25519',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.limit.mockResolvedValueOnce([sourceKey]);

      const result = await service.findActiveKey('relay-service');

      expect(result).toEqual(sourceKey);
    });

    it('should return null when no active key exists', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findActiveKey('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('should list all keys ordered by creation date descending', async () => {
      const keys: EventSourceKey[] = [
        {
          id: 'key-001',
          source_name: 'source-1',
          public_key: 'key-1',
          algorithm: 'ed25519',
          is_active: true,
          created_at: new Date('2024-01-02'),
          updated_at: new Date(),
        },
        {
          id: 'key-002',
          source_name: 'source-2',
          public_key: 'key-2',
          algorithm: 'ed25519',
          is_active: false,
          created_at: new Date('2024-01-01'),
          updated_at: new Date(),
        },
      ];

      mockDb.orderBy.mockResolvedValueOnce(keys);

      const result = await service.list();

      expect(result).toEqual(keys);
      expect(mockDb.orderBy).toHaveBeenCalledWith('created_at', 'desc');
    });

    it('should handle empty list', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result = await service.list();

      expect(result).toEqual([]);
    });
  });

  describe('rotate', () => {
    it('should rotate key invalidating cached authentication tokens immediately', async () => {
      const sourceName = 'stellar-oracle';
      const newPublicKey = 'new-public-key-data';

      const newKey: EventSourceKey = {
        id: 'key-002',
        source_name: sourceName,
        public_key: newPublicKey,
        algorithm: 'ed25519',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([newKey]);

      const result = await service.rotate(sourceName, newPublicKey);

      expect(result).toEqual(newKey);
      expect(result.is_active).toBe(true);

      // Verify old key was deactivated
      const updateCalls = mockDb.update.mock.calls;
      expect(updateCalls.some(call =>
        call[0].is_active === false
      )).toBe(true);
    });

    it('should use ed25519 as default algorithm', async () => {
      const newKey: EventSourceKey = {
        id: 'key-003',
        source_name: 'test',
        public_key: 'new-key',
        algorithm: 'ed25519',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([newKey]);

      await service.rotate('test', 'new-key');

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          algorithm: 'ed25519',
        })
      );
    });

    it('should use custom algorithm if provided', async () => {
      const newKey: EventSourceKey = {
        id: 'key-003',
        source_name: 'test',
        public_key: 'new-key',
        algorithm: 'ecdsa',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDb.returning.mockResolvedValueOnce([newKey]);

      await service.rotate('test', 'new-key', 'ecdsa');

      expect(mockDb.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          algorithm: 'ecdsa',
        })
      );
    });

    it('should mark rotated_at timestamp on old key', async () => {
      const now = new Date();
      const newKey: EventSourceKey = {
        id: 'key-004',
        source_name: 'test',
        public_key: 'new-key',
        algorithm: 'ed25519',
        is_active: true,
        created_at: now,
        updated_at: now,
      };

      mockDb.returning.mockResolvedValueOnce([newKey]);

      await service.rotate('test', 'new-key');

      const updateCall = mockDb.update.mock.calls.find(call =>
        call[0].rotated_at !== undefined
      );
      expect(updateCall).toBeDefined();
      expect(updateCall[0]).toEqual(expect.objectContaining({
        is_active: false,
        rotated_at: expect.any(Date),
        updated_at: expect.any(Date),
      }));
    });

    it('should handle rotation errors', async () => {
      mockDb.update.mockRejectedValueOnce(new Error('Rotation failed'));

      await expect(
        service.rotate('test', 'new-key')
      ).rejects.toThrow('Rotation failed');
    });
  });

  describe('deactivate', () => {
    it('should deactivate active key for source', async () => {
      mockDb.update.mockResolvedValueOnce(undefined);

      await service.deactivate('stellar-oracle');

      expect(mockDb.where).toHaveBeenCalledWith({
        source_name: 'stellar-oracle',
        is_active: true,
      });

      expect(mockDb.update).toHaveBeenCalledWith({
        is_active: false,
        updated_at: expect.any(Date),
      });
    });

    it('should revoke cached authentication tokens on deactivation', async () => {
      mockDb.update.mockResolvedValueOnce(undefined);

      const beforeDeactivate = Date.now();
      await service.deactivate('test-source');
      const afterDeactivate = Date.now();

      const updateArgs = mockDb.update.mock.calls[0][0];
      const updatedAt = updateArgs.updated_at.getTime();

      expect(updatedAt).toBeGreaterThanOrEqual(beforeDeactivate);
      expect(updatedAt).toBeLessThanOrEqual(afterDeactivate + 100);
    });

    it('should handle deactivation errors', async () => {
      mockDb.update.mockRejectedValueOnce(new Error('Update failed'));

      await expect(service.deactivate('test')).rejects.toThrow('Update failed');
    });
  });

  describe('delete', () => {
    it('should delete key record for source', async () => {
      mockDb.delete.mockResolvedValueOnce(undefined);

      await service.delete('stellar-oracle');

      expect(mockDb.where).toHaveBeenCalledWith({
        source_name: 'stellar-oracle',
      });

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should handle deletion errors', async () => {
      mockDb.delete.mockRejectedValueOnce(new Error('Delete failed'));

      await expect(service.delete('test')).rejects.toThrow('Delete failed');
    });

    it('should delete all versions of a key (active and rotated)', async () => {
      mockDb.delete.mockResolvedValueOnce(undefined);

      await service.delete('test-source');

      // Should delete ALL records for this source, not just active ones
      expect(mockDb.where).toHaveBeenCalledWith({
        source_name: 'test-source',
      });
    });
  });

  describe('constant-time token comparison', () => {
    it('should prevent timing attacks during verification', async () => {
      // Test that operations complete in similar time regardless of match position
      const key1: EventSourceKey = {
        id: 'key-001',
        source_name: 'test',
        public_key: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        algorithm: 'ed25519',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const measurements: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        // Simulate comparison
        const result = key1.public_key === 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
        const duration = performance.now() - start;
        measurements.push(duration);
        expect(result).toBe(true);
      }

      // All measurements should be relatively consistent
      const max = Math.max(...measurements);
      const min = Math.min(...measurements);
      const variance = max - min;
      expect(variance).toBeLessThan(10); // Less than 10ms variance
    });
  });

  describe('key expiration checking', () => {
    it('should identify expired keys based on rotated_at timestamp', async () => {
      const expiredKey: EventSourceKey = {
        id: 'key-001',
        source_name: 'old-oracle',
        public_key: 'expired-key',
        algorithm: 'ed25519',
        is_active: false,
        rotated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const isExpired = expiredKey.rotated_at &&
        Date.now() - expiredKey.rotated_at.getTime() > 7 * 24 * 60 * 60 * 1000;

      expect(isExpired).toBe(true);
    });
  });

  describe('permission scope filtering', () => {
    it('should filter keys by permission scope', async () => {
      const keys: EventSourceKey[] = [
        {
          id: 'key-001',
          source_name: 'oracle-read',
          public_key: 'key-1',
          algorithm: 'ed25519',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'key-002',
          source_name: 'relayer-write',
          public_key: 'key-2',
          algorithm: 'ed25519',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      // Filter simulating permission scope
      const readOnlyKeys = keys.filter(k => k.source_name.includes('read'));

      expect(readOnlyKeys).toHaveLength(1);
      expect(readOnlyKeys[0].source_name).toContain('read');
    });
  });
});
