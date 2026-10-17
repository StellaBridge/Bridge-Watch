import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { OwnershipMatrixService } from "../../src/services/ownershipMatrix.service.js";

// Mock dependencies
const { mockDb, mockAuditService, queryBuilder } = vi.hoisted(() => {
  const queryBuilder: any = {};
  queryBuilder.where = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.join = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.select = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.orderBy = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.limit = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.offset = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.count = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.whereIn = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.insert = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.update = vi.fn().mockReturnValue(queryBuilder);
  queryBuilder.returning = vi.fn().mockResolvedValue([]);
  queryBuilder.first = vi.fn().mockResolvedValue(null);
  queryBuilder.delete = vi.fn().mockResolvedValue(1);

  const dbFunc = vi.fn().mockImplementation(() => queryBuilder);
  
  Object.assign(dbFunc, queryBuilder);
  dbFunc.transaction = vi.fn();
  dbFunc.fn = { now: vi.fn(() => new Date()) };

  queryBuilder.transaction = dbFunc.transaction;
  queryBuilder.fn = dbFunc.fn;

  return {
    mockDb: dbFunc,
    mockAuditService: {
      log: vi.fn(),
      query: vi.fn(),
    },
    queryBuilder,
  };
});

function createMockTrx(overrides: any) {
  const trxQueryBuilder = {
    ...queryBuilder,
    ...overrides,
  };
  const trx = vi.fn().mockImplementation(() => trxQueryBuilder);
  Object.assign(trx, trxQueryBuilder);
  return trx;
}

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockDb,
}));

vi.mock("../../src/services/audit.service.js", () => ({
  auditService: mockAuditService,
}));

describe("OwnershipMatrixService", () => {
  let service: OwnershipMatrixService;

  beforeEach(() => {
    service = new OwnershipMatrixService();
    vi.clearAllMocks();

    mockDb.mockImplementation(() => queryBuilder);

    // Setup default mock chain
    mockDb.where.mockReturnThis();
    mockDb.join.mockReturnThis();
    mockDb.select.mockReturnThis();
    mockDb.orderBy.mockReturnThis();
    mockDb.limit.mockReturnThis();
    mockDb.offset.mockReturnThis();
    mockDb.count.mockReturnThis();
    mockDb.whereIn.mockReturnThis();
    mockDb.insert.mockReturnThis();
    mockDb.update.mockReturnThis();
    mockDb.returning.mockResolvedValue([]);
    mockDb.first.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("assignOwner", () => {
    it("should create ownership record and audit log entry for new assignment", async () => {
      const alertId = "alert-123";
      const ownerId = "owner-456";
      const ownerType = "user";
      const actorId = "actor-789";

      const mockAlert = { id: alertId, name: "Test Alert" };
      const mockOwnership = {
        id: "ownership-1",
        alert_id: alertId,
        owner_type: ownerType,
        owner_id: ownerId,
        created_by: actorId,
        created_at: new Date(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const trx = createMockTrx({
          where: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValueOnce(null), // No existing ownership
          insert: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([mockOwnership]),
        });
        return callback(trx);
      });

      mockDb.where.mockReturnThis();
      mockDb.first.mockResolvedValue(mockAlert);

      const result = await service.assignOwner(alertId, ownerId, ownerType, actorId);

      expect(result.alertId).toBe(alertId);
      expect(result.ownerId).toBe(ownerId);
      expect(result.ownerType).toBe(ownerType);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "alert.ownership_assigned",
          actorId,
          resourceType: "alert_ownership",
          resourceId: alertId,
        })
      );
    });

    it("should record previous owner in audit log for transfer", async () => {
      const alertId = "alert-123";
      const newOwnerId = "new-owner";
      const ownerType = "user";
      const actorId = "actor-789";

      const mockAlert = { id: alertId, name: "Test Alert" };
      const existingOwnership = {
        id: "ownership-1",
        alert_id: alertId,
        owner_type: "user",
        owner_id: "old-owner",
        created_by: "old-actor",
        created_at: new Date(),
      };

      const updatedOwnership = {
        ...existingOwnership,
        owner_id: newOwnerId,
        created_by: actorId,
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const trx = createMockTrx({
          where: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValueOnce(existingOwnership),
          update: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([updatedOwnership]),
        });
        return callback(trx);
      });

      mockDb.where.mockReturnThis();
      mockDb.first.mockResolvedValue(mockAlert);

      await service.assignOwner(alertId, newOwnerId, ownerType, actorId);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "alert.ownership_transferred",
          before: {
            ownerType: "user",
            ownerId: "old-owner",
          },
          after: {
            ownerType,
            ownerId: newOwnerId,
          },
        })
      );
    });

    it("should reject invalid alertId", async () => {
      const alertId = "invalid-alert";

      mockDb.where.mockReturnThis();
      mockDb.first.mockResolvedValue(null);

      await expect(
        service.assignOwner(alertId, "owner", "user", "actor")
      ).rejects.toThrow("Alert not found");
    });
  });

  describe("addEscalationContact", () => {
    it("should add contact at correct order", async () => {
      const alertId = "alert-123";
      const contactUserId = "contact-456";
      const order = 2;
      const actorId = "actor-789";

      const mockAlert = { id: alertId, name: "Test Alert" };
      const mockContact = {
        id: "contact-1",
        alert_id: alertId,
        contact_user_id: contactUserId,
        order,
        created_by: actorId,
        created_at: new Date(),
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const trx = createMockTrx({
          where: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValueOnce(null), // No existing contact
          insert: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([mockContact]),
        });
        return callback(trx);
      });

      mockDb.where.mockReturnThis();
      mockDb.first.mockResolvedValue(mockAlert);

      const result = await service.addEscalationContact(
        alertId,
        contactUserId,
        order,
        actorId
      );

      expect(result.order).toBe(order);
      expect(result.contactUserId).toBe(contactUserId);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "alert.escalation_added",
          resourceType: "escalation_contact",
        })
      );
    });

    it("should reject duplicate contact", async () => {
      const alertId = "alert-123";
      const contactUserId = "contact-456";

      const mockAlert = { id: alertId, name: "Test Alert" };
      const existingContact = {
        id: "contact-1",
        alert_id: alertId,
        contact_user_id: contactUserId,
      };

      mockDb.transaction.mockImplementation(async (callback) => {
        const trx = createMockTrx({
          where: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValueOnce(existingContact),
        });
        return callback(trx);
      });

      mockDb.where.mockReturnThis();
      mockDb.first.mockResolvedValue(mockAlert);

      await expect(
        service.addEscalationContact(alertId, contactUserId, 1, "actor")
      ).rejects.toThrow("Contact already exists");
    });
  });

  describe("getEscalationContacts", () => {
    it("should return contacts in ascending order", async () => {
      const alertId = "alert-123";
      const mockContacts = [
        {
          id: "c1",
          alert_id: alertId,
          contact_user_id: "user1",
          order: 1,
          created_by: "actor",
          created_at: new Date(),
        },
        {
          id: "c2",
          alert_id: alertId,
          contact_user_id: "user2",
          order: 2,
          created_by: "actor",
          created_at: new Date(),
        },
      ];

      mockDb.where.mockReturnThis();
      mockDb.orderBy.mockResolvedValue(mockContacts);

      const result = await service.getEscalationContacts(alertId);

      expect(result).toHaveLength(2);
      expect(result[0].order).toBe(1);
      expect(result[1].order).toBe(2);
    });
  });

  describe("getAuditHistory", () => {
    it("should return entries in reverse chronological order", async () => {
      const alertId = "alert-123";
      const mockEntries = [
        {
          id: "audit-1",
          action: "alert.ownership_assigned",
          actorId: "actor1",
          before: null,
          after: { ownerId: "owner1" },
          metadata: {},
          createdAt: new Date("2026-01-02"),
        },
        {
          id: "audit-2",
          action: "alert.escalation_added",
          actorId: "actor2",
          before: null,
          after: { contactUserId: "contact1" },
          metadata: {},
          createdAt: new Date("2026-01-01"),
        },
      ];

      mockAuditService.query.mockResolvedValue({
        entries: mockEntries,
        total: 2,
      });

      const result = await service.getAuditHistory(alertId, { page: 1, limit: 50 });

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].action).toBe("alert.ownership_assigned");
    });
  });

  describe("exportOwnershipMatrix", () => {
    it("should generate CSV with correct headers and rows", async () => {
      const mockData = [
        {
          alertId: "alert-1",
          alertName: "Alert 1",
          ownerType: "user" as const,
          ownerId: "owner-1",
          createdBy: "actor-1",
          createdAt: new Date("2026-01-01"),
          escalationContacts: [{ contactUserId: "contact-1", order: 1 }],
        },
      ];

      // Mock getOwnershipMatrix
      vi.spyOn(service, "getOwnershipMatrix").mockResolvedValue({
        data: mockData,
        meta: { total: 1, page: 1, limit: 10000, totalPages: 1 },
      });

      const csv = await service.exportOwnershipMatrix("csv", {});

      expect(csv).toContain("alert_id");
      expect(csv).toContain("alert_name");
      expect(csv).toContain("owner_type");
      expect(csv).toContain("alert-1");
      expect(csv).toContain("Alert 1");
    });

    it("should generate JSON matching getOwnershipMatrix shape", async () => {
      const mockData = [
        {
          alertId: "alert-1",
          alertName: "Alert 1",
          ownerType: "user" as const,
          ownerId: "owner-1",
          createdBy: "actor-1",
          createdAt: new Date("2026-01-01"),
          escalationContacts: [],
        },
      ];

      vi.spyOn(service, "getOwnershipMatrix").mockResolvedValue({
        data: mockData,
        meta: { total: 1, page: 1, limit: 10000, totalPages: 1 },
      });

      const json = await service.exportOwnershipMatrix("json", {});
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].alertId).toBe("alert-1");
    });
  });

  describe("searchOwnership", () => {
    it("should return results matching alert name, owner name, and team name", async () => {
      const query = "test";
      const mockResults = [
        {
          alert_id: "alert-1",
          alert_name: "Test Alert",
          owner_type: "user",
          owner_id: "owner-1",
          created_by: "actor-1",
          created_at: new Date(),
        },
      ];

      mockDb.where.mockReturnThis();
      mockDb.join.mockReturnThis();
      mockDb.select.mockReturnThis();

      let orderByCallCount = 0;
      mockDb.orderBy.mockImplementation(() => {
        orderByCallCount++;
        if (orderByCallCount === 1) {
          return queryBuilder;
        }
        return Promise.resolve([]);
      });

      mockDb.limit.mockReturnThis();
      mockDb.offset.mockResolvedValue(mockResults);

      mockDb.count.mockReturnThis();
      mockDb.first.mockResolvedValue({ count: 1 });

      mockDb.whereIn.mockReturnThis();

      const result = await service.searchOwnership(query, { page: 1, limit: 50 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].alertName).toBe("Test Alert");
      expect(result.meta.total).toBe(1);
    });
  });

  describe("getOwner", () => {
    it("should return owner for valid alertId", async () => {
      const mockOwner = {
        alert_id: "alert-1",
        owner_type: "user",
        owner_id: "owner-1",
        created_by: "actor-1",
        created_at: new Date(),
      };

      mockDb.first.mockResolvedValue(mockOwner);

      const result = await service.getOwner("alert-1");
      expect(result).not.toBeNull();
      expect(result?.alertId).toBe("alert-1");
    });

    it("should return null when no owner found", async () => {
      mockDb.first.mockResolvedValue(null);

      const result = await service.getOwner("nonexistent");
      expect(result).toBeNull();
    });

    it("should handle database errors gracefully", async () => {
      mockDb.first.mockRejectedValue(new Error("db error"));

      const result = await service.getOwner("alert-1");
      expect(result).toBeNull();
    });
  });

  describe("getOwnershipMatrix", () => {
    it("should return paginated ownership records", async () => {
      const mockRows = [
        {
          alert_id: "alert-1",
          alert_name: "Test Alert",
          owner_type: "user",
          owner_id: "owner-1",
          created_by: "actor-1",
          created_at: new Date(),
        },
      ];

      mockDb.select.mockReturnThis();
      mockDb.join.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.orderBy.mockReturnThis();
      mockDb.limit.mockReturnThis();
      mockDb.offset.mockResolvedValue(mockRows);
      mockDb.count.mockReturnThis();
      mockDb.first.mockResolvedValue({ count: 1 });

      const result = await service.getOwnershipMatrix({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it("should handle empty results", async () => {
      mockDb.select.mockReturnThis();
      mockDb.join.mockReturnThis();
      mockDb.where.mockReturnThis();
      mockDb.orderBy.mockReturnThis();
      mockDb.limit.mockReturnThis();
      mockDb.offset.mockResolvedValue([]);
      mockDb.count.mockReturnThis();
      mockDb.first.mockResolvedValue({ count: 0 });

      const result = await service.getOwnershipMatrix({ page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  describe("removeEscalationContact", () => {
    it("should remove contact successfully", async () => {
      mockDb.where.mockReturnThis();
      mockDb.delete.mockResolvedValue(1);

      const result = await service.removeEscalationContact("alert-1", "contact-1");
      expect(result).toBe(true);
    });

    it("should return false when contact not found", async () => {
      mockDb.where.mockReturnThis();
      mockDb.delete.mockResolvedValue(0);

      const result = await service.removeEscalationContact("alert-1", "nonexistent");
      expect(result).toBe(false);
    });

    it("should handle database errors gracefully", async () => {
      mockDb.where.mockReturnThis();
      mockDb.delete.mockRejectedValue(new Error("db error"));

      await expect(
        service.removeEscalationContact("alert-1", "contact-1"),
      ).rejects.toThrow("db error");
    });
  });

  describe("getAuditHistory", () => {
    it("should return audit history in reverse chronological order", async () => {
      const mockRows = [
        {
          id: "audit-2",
          alert_id: "alert-1",
          action: "transfer",
          actor: "actor-2",
          created_at: new Date("2024-01-02"),
        },
        {
          id: "audit-1",
          alert_id: "alert-1",
          action: "assign",
          actor: "actor-1",
          created_at: new Date("2024-01-01"),
        },
      ];

      mockDb.where.mockReturnThis();
      mockDb.orderBy.mockReturnThis();
      mockDb.limit.mockReturnThis();
      mockDb.offset.mockResolvedValue(mockRows);
      mockDb.count.mockReturnThis();
      mockDb.first.mockResolvedValue({ count: 2 });

      const result = await service.getAuditHistory("alert-1", { page: 1, limit: 10 });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].id).toBe("audit-2");
      expect(result.meta.total).toBe(2);
    });

    it("should handle empty audit history", async () => {
      mockDb.where.mockReturnThis();
      mockDb.orderBy.mockReturnThis();
      mockDb.limit.mockReturnThis();
      mockDb.offset.mockResolvedValue([]);
      mockDb.count.mockReturnThis();
      mockDb.first.mockResolvedValue({ count: 0 });

      const result = await service.getAuditHistory("alert-1", { page: 1, limit: 10 });
      expect(result.data).toHaveLength(0);
    });
  });
});
