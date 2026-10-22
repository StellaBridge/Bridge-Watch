import { describe, it, expect } from "vitest";
import { getDashboardWidgetContract, listDashboardWidgetContracts, type WidgetContract } from "../dashboardWidgetContracts.service.js";

describe("dashboardWidgetContracts", () => {
  describe("listDashboardWidgetContracts", () => {
    it("should return a list of available widget contracts", () => {
      const contracts = listDashboardWidgetContracts();

      expect(Array.isArray(contracts)).toBe(true);
      expect(contracts.length).toBeGreaterThan(0);
    });

    it("should return contracts with required properties", () => {
      const contracts = listDashboardWidgetContracts();

      contracts.forEach((contract: WidgetContract) => {
        expect(contract).toHaveProperty("id");
        expect(contract).toHaveProperty("title");
        expect(contract).toHaveProperty("version");
        expect(contract).toHaveProperty("refreshSeconds");
        expect(contract).toHaveProperty("requiredFields");
        expect(contract).toHaveProperty("example");

        expect(typeof contract.id).toBe("string");
        expect(typeof contract.title).toBe("string");
        expect(typeof contract.version).toBe("string");
        expect(typeof contract.refreshSeconds).toBe("number");
        expect(Array.isArray(contract.requiredFields)).toBe(true);
        expect(typeof contract.example).toBe("object");
      });
    });

    it("should include endpoint-reliability contract", () => {
      const contracts = listDashboardWidgetContracts();
      const reliability = contracts.find((c) => c.id === "endpoint-reliability");

      expect(reliability).toBeDefined();
      expect(reliability?.title).toBe("Endpoint Reliability Scorecard");
      expect(reliability?.version).toBe("1.0.0");
      expect(reliability?.refreshSeconds).toBe(60);
    });

    it("should include cache-hit-rate contract", () => {
      const contracts = listDashboardWidgetContracts();
      const cacheHit = contracts.find((c) => c.id === "cache-hit-rate");

      expect(cacheHit).toBeDefined();
      expect(cacheHit?.title).toBe("Cache Hit-Rate Attribution");
      expect(cacheHit?.refreshSeconds).toBe(30);
    });

    it("should include worker-capacity contract", () => {
      const contracts = listDashboardWidgetContracts();
      const workerCapacity = contracts.find((c) => c.id === "worker-capacity");

      expect(workerCapacity).toBeDefined();
      expect(workerCapacity?.title).toBe("Worker Capacity Planning");
      expect(workerCapacity?.refreshSeconds).toBe(30);
    });

    it("should include saved-query-versions contract", () => {
      const contracts = listDashboardWidgetContracts();
      const queryVersions = contracts.find((c) => c.id === "saved-query-versions");

      expect(queryVersions).toBeDefined();
      expect(queryVersions?.title).toBe("Saved Query Version History");
      expect(queryVersions?.refreshSeconds).toBe(300);
    });
  });

  describe("getDashboardWidgetContract", () => {
    it("should retrieve contract by id", () => {
      const contract = getDashboardWidgetContract("endpoint-reliability");

      expect(contract).toBeDefined();
      expect(contract?.id).toBe("endpoint-reliability");
    });

    it("should return null for non-existent contract", () => {
      const contract = getDashboardWidgetContract("non-existent");

      expect(contract).toBeNull();
    });

    it("should return contract with valid required fields structure", () => {
      const contract = getDashboardWidgetContract("endpoint-reliability");

      expect(contract).toBeDefined();
      expect(Array.isArray(contract?.requiredFields)).toBe(true);
      expect(contract?.requiredFields.length).toBeGreaterThan(0);

      contract?.requiredFields.forEach((field) => {
        expect(field).toHaveProperty("name");
        expect(field).toHaveProperty("type");
        expect(field).toHaveProperty("description");
        expect(typeof field.name).toBe("string");
        expect(typeof field.type).toBe("string");
        expect(typeof field.description).toBe("string");
      });
    });

    it("should retrieve endpoint-reliability with correct fields", () => {
      const contract = getDashboardWidgetContract("endpoint-reliability");

      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "endpoint",
          type: "string",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "score",
          type: "number",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "p95Ms",
          type: "number",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "errorRate",
          type: "number",
        })
      );
    });

    it("should retrieve cache-hit-rate with correct fields", () => {
      const contract = getDashboardWidgetContract("cache-hit-rate");

      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "namespace",
          type: "string",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "hits",
          type: "number",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "misses",
          type: "number",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "hitRate",
          type: "number|null",
        })
      );
    });

    it("should retrieve worker-capacity with correct fields", () => {
      const contract = getDashboardWidgetContract("worker-capacity");

      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "queue",
          type: "string",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "waiting",
          type: "number",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "active",
          type: "number",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "capacityUtilization",
          type: "number",
        })
      );
    });

    it("should retrieve saved-query-versions with correct fields", () => {
      const contract = getDashboardWidgetContract("saved-query-versions");

      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "presetId",
          type: "string",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "version",
          type: "string",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "createdBy",
          type: "string",
        })
      );
      expect(contract?.requiredFields).toContainEqual(
        expect.objectContaining({
          name: "changeNotes",
          type: "string|null",
        })
      );
    });

    it("should return example data matching contract specification", () => {
      const contract = getDashboardWidgetContract("endpoint-reliability");

      expect(contract?.example).toBeDefined();
      expect(contract?.example).toHaveProperty("endpoint");
      expect(contract?.example).toHaveProperty("score");
      expect(contract?.example).toHaveProperty("p95Ms");
      expect(contract?.example).toHaveProperty("errorRate");
      expect(typeof contract?.example.endpoint).toBe("string");
      expect(typeof contract?.example.score).toBe("number");
    });

    it("should support backward compatibility checks", () => {
      const contract = getDashboardWidgetContract("cache-hit-rate");
      const allContracts = listDashboardWidgetContracts();

      const existing = allContracts.find((c) => c.id === contract?.id);
      expect(existing).toEqual(contract);
    });

    it("should handle case sensitivity", () => {
      const contract1 = getDashboardWidgetContract("endpoint-reliability");
      const contract2 = getDashboardWidgetContract("Endpoint-Reliability");
      const contract3 = getDashboardWidgetContract("ENDPOINT-RELIABILITY");

      expect(contract1).toBeDefined();
      expect(contract2).toBeNull();
      expect(contract3).toBeNull();
    });
  });

  describe("Widget Contract Schema Validation", () => {
    it("should validate all contracts have valid version strings", () => {
      const contracts = listDashboardWidgetContracts();

      contracts.forEach((contract) => {
        const versionRegex = /^\d+\.\d+\.\d+$/;
        expect(contract.version).toMatch(versionRegex);
      });
    });

    it("should validate refresh seconds are positive", () => {
      const contracts = listDashboardWidgetContracts();

      contracts.forEach((contract) => {
        expect(contract.refreshSeconds).toBeGreaterThan(0);
      });
    });

    it("should validate required fields have names and descriptions", () => {
      const contracts = listDashboardWidgetContracts();

      contracts.forEach((contract) => {
        contract.requiredFields.forEach((field) => {
          expect(field.name.length).toBeGreaterThan(0);
          expect(field.description.length).toBeGreaterThan(0);
          expect(field.type.length).toBeGreaterThan(0);
        });
      });
    });

    it("should validate example contains all required field names", () => {
      const contract = getDashboardWidgetContract("endpoint-reliability");

      expect(contract).toBeDefined();
      contract?.requiredFields.forEach((field) => {
        expect(contract.example).toHaveProperty(field.name);
      });
    });

    it("should support nullable fields in example data", () => {
      const contract = getDashboardWidgetContract("cache-hit-rate");

      expect(contract?.example.hitRate).toBeGreaterThanOrEqual(0);
    });

    it("should support unions in field types", () => {
      const contracts = listDashboardWidgetContracts();
      const fieldsWithUnions = contracts
        .flatMap((c) => c.requiredFields)
        .filter((f) => f.type.includes("|"));

      expect(fieldsWithUnions.length).toBeGreaterThan(0);
    });
  });

  describe("Widget Contract Consistency", () => {
    it("should have unique contract ids", () => {
      const contracts = listDashboardWidgetContracts();
      const ids = contracts.map((c) => c.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it("should have consistent titles for same contract", () => {
      const contract1 = getDashboardWidgetContract("endpoint-reliability");
      const contract2 = listDashboardWidgetContracts().find((c) => c.id === "endpoint-reliability");

      expect(contract1?.title).toBe(contract2?.title);
    });

    it("should have all contracts retrievable by id", () => {
      const contracts = listDashboardWidgetContracts();

      contracts.forEach((contract) => {
        const retrieved = getDashboardWidgetContract(contract.id);
        expect(retrieved).toEqual(contract);
      });
    });
  });
});
