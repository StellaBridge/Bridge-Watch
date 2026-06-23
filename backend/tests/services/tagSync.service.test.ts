import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => vi.fn()),
}));

import { TagSyncService } from "../../src/services/tagSync.service.js";
import { TagModel } from "../../src/database/models/tag.model.js";

describe("TagSyncService", () => {
  let service: TagSyncService;

  beforeEach(() => {
    vi.restoreAllMocks();
    service = new TagSyncService();
  });

  describe("validateTag", () => {
    it("accepts valid tags", () => {
      expect(service.validateTag("stablecoin")).toBe("stablecoin");
      expect(service.validateTag("defi-protocol")).toBe("defi-protocol");
      expect(service.validateTag("bridged.usdc")).toBe("bridged.usdc");
    });

    it("trims and lowercases tags", () => {
      expect(service.validateTag("  StableCoin  ")).toBe("stablecoin");
    });

    it("rejects empty tags", () => {
      expect(service.validateTag("")).toBeNull();
      expect(service.validateTag("   ")).toBeNull();
    });

    it("rejects tags exceeding max length", () => {
      expect(service.validateTag("a".repeat(65))).toBeNull();
    });

    it("rejects tags with invalid characters", () => {
      expect(service.validateTag("has spaces")).toBeNull();
      expect(service.validateTag("special!char")).toBeNull();
      expect(service.validateTag("slash/tag")).toBeNull();
    });
  });

  describe("validateEntityType", () => {
    it("accepts valid entity types", () => {
      expect(service.validateEntityType("asset")).toBe(true);
      expect(service.validateEntityType("bridge")).toBe(true);
      expect(service.validateEntityType("incident")).toBe(true);
    });

    it("rejects invalid entity types", () => {
      expect(service.validateEntityType("invalid")).toBe(false);
      expect(service.validateEntityType("")).toBe(false);
    });
  });

  describe("addTag", () => {
    it("throws on invalid entity type", async () => {
      await expect(
        service.addTag("invalid", "entity-1", "tag1")
      ).rejects.toThrow("Invalid entity type");
    });

    it("throws on invalid tag", async () => {
      await expect(
        service.addTag("asset", "entity-1", "invalid tag!")
      ).rejects.toThrow("Invalid tag");
    });

    it("succeeds with valid inputs", async () => {
      const mockTag = {
        id: "tag-1",
        entity_type: "asset",
        entity_id: "entity-1",
        tag: "stablecoin",
        source: "manual",
        created_at: new Date(),
        updated_at: new Date(),
      };
      vi.spyOn(TagModel.prototype, "findByEntity").mockResolvedValue([]);
      vi.spyOn(TagModel.prototype, "addTag").mockResolvedValue(mockTag as any);
      vi.spyOn(TagModel.prototype, "logAudit" as any).mockResolvedValue(undefined);

      const result = await service.addTag("asset", "entity-1", "stablecoin");
      expect(result).toBeDefined();
      expect(result.tag).toBe("stablecoin");
    });
  });

  describe("removeTag", () => {
    it("throws on invalid entity type", async () => {
      await expect(
        service.removeTag("bad", "entity-1", "tag1")
      ).rejects.toThrow("Invalid entity type");
    });
  });

  describe("syncEntityTags", () => {
    it("throws on invalid entity type", async () => {
      await expect(
        service.syncEntityTags("bad-type", "entity-1", ["tag1"])
      ).rejects.toThrow("Invalid entity type");
    });

    it("succeeds with valid inputs", async () => {
      vi.spyOn(TagModel.prototype, "findByEntity").mockResolvedValue([]);
      vi.spyOn(TagModel.prototype, "addTag").mockResolvedValue({} as any);
      vi.spyOn(TagModel.prototype, "removeTag").mockResolvedValue(false);

      const result = await service.syncEntityTags("asset", "entity-1", [
        "valid-tag",
      ]);
      expect(result).toBeDefined();
      expect(result.added).toBeDefined();
      expect(result.removed).toBeDefined();
    });
  });

  describe("findEntitiesByTag", () => {
    it("returns empty for invalid tag", async () => {
      const result = await service.findEntitiesByTag("");
      expect(result).toEqual([]);
    });
  });
});
