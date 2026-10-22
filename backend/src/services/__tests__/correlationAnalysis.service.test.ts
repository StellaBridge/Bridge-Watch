import { describe, it, expect, beforeEach, vi } from "vitest";
import { CorrelationAnalysisService } from "../correlationAnalysis.service.js";

vi.mock("../../database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation(() => mockDb);
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.orWhere = vi.fn().mockReturnValue(mockDb);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.first = vi.fn().mockResolvedValue(null);
  mockDb.insert = vi.fn().mockReturnValue(mockDb);
  mockDb.returning = vi.fn().mockResolvedValue([]);
  mockDb.raw = vi.fn((sql) => sql);
  return { getDatabase: () => mockDb };
});

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("CorrelationAnalysisService", () => {
  let service: CorrelationAnalysisService;

  beforeEach(() => {
    service = new CorrelationAnalysisService();
    vi.clearAllMocks();
  });

  describe("computeReturns", () => {
    it("should compute returns from price series", () => {
      const prices = [100, 102, 101, 103, 105];
      const returns = (service as any).computeReturns(prices);

      expect(Array.isArray(returns)).toBe(true);
      expect(returns.length).toBe(4);
      expect(returns[0]).toBeCloseTo(0.02, 5);
      expect(returns[1]).toBeCloseTo(-0.0098, 4);
    });

    it("should handle single price point", () => {
      const prices = [100];
      const returns = (service as any).computeReturns(prices);
      expect(returns.length).toBe(0);
    });

    it("should skip zero-price entries", () => {
      const prices = [100, 0, 102];
      const returns = (service as any).computeReturns(prices);
      expect(returns.length).toBe(1);
    });
  });

  describe("pearsonCorrelation", () => {
    it("should compute perfect positive correlation", () => {
      const x = [1, 2, 3, 4, 5];
      const y = [2, 4, 6, 8, 10];
      const correlation = (service as any).pearsonCorrelation(x, y);
      expect(correlation).toBeCloseTo(1, 5);
    });

    it("should compute perfect negative correlation", () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 4, 3, 2, 1];
      const correlation = (service as any).pearsonCorrelation(x, y);
      expect(correlation).toBeCloseTo(-1, 5);
    });

    it("should compute zero correlation for independent series", () => {
      const x = [1, 2, 3, 4, 5];
      const y = [5, 3, 1, 4, 2];
      const correlation = (service as any).pearsonCorrelation(x, y);
      expect(Math.abs(correlation)).toBeLessThan(0.5);
    });

    it("should handle empty arrays", () => {
      const correlation = (service as any).pearsonCorrelation([], []);
      expect(correlation).toBe(0);
    });

    it("should handle constant series", () => {
      const x = [5, 5, 5, 5];
      const y = [1, 2, 3, 4];
      const correlation = (service as any).pearsonCorrelation(x, y);
      expect(correlation).toBe(0);
    });
  });

  describe("computePValue", () => {
    it("should return 1 for sample size <= 2", () => {
      const pValue = (service as any).computePValue(0.5, 2);
      expect(pValue).toBe(1);
    });

    it("should compute p-value for valid correlation and sample size", () => {
      const pValue = (service as any).computePValue(0.8, 30);
      expect(pValue).toBeGreaterThan(0);
      expect(pValue).toBeLessThan(1);
    });

    it("should give lower p-values for stronger correlations", () => {
      const pValue1 = (service as any).computePValue(0.3, 50);
      const pValue2 = (service as any).computePValue(0.9, 50);
      expect(pValue2).toBeLessThan(pValue1);
    });
  });

  describe("classifyStrength", () => {
    it("should classify strong correlation", () => {
      expect((service as any).classifyStrength(0.8)).toBe("strong");
      expect((service as any).classifyStrength(-0.75)).toBe("strong");
    });

    it("should classify moderate correlation", () => {
      expect((service as any).classifyStrength(0.6)).toBe("moderate");
      expect((service as any).classifyStrength(-0.5)).toBe("moderate");
    });

    it("should classify weak correlation", () => {
      expect((service as any).classifyStrength(0.3)).toBe("weak");
      expect((service as any).classifyStrength(-0.25)).toBe("weak");
    });

    it("should classify negligible correlation", () => {
      expect((service as any).classifyStrength(0.1)).toBe("negligible");
      expect((service as any).classifyStrength(-0.05)).toBe("negligible");
    });
  });

  describe("computeCorrelation", () => {
    it("should compute correlation between two assets with period 1d", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockResolvedValue([
        { price: "100" },
        { price: "102" },
        { price: "103" },
      ]);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.insert = vi.fn().mockReturnValue(mockDb);
      mockDb.returning = vi.fn().mockResolvedValue([
        {
          id: "corr-123",
          asset_a: "USDC",
          asset_b: "EURC",
          period: "1d",
          correlation_coefficient: 0.85,
          sample_count: 100,
          p_value: 0.001,
          strength: "strong",
          computed_at: new Date(),
        },
      ]);

      const result = await service.computeCorrelation("USDC", "EURC", "1d");

      expect(result).toBeDefined();
      expect(result.assetA).toBe("USDC");
      expect(result.assetB).toBe("EURC");
      expect(result.correlationCoefficient).toBe(0.85);
      expect(result.strength).toBe("strong");
    });

    it("should compute correlation with different periods", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.select = vi.fn().mockResolvedValue([{ price: "100" }]);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.insert = vi.fn().mockReturnValue(mockDb);
      mockDb.returning = vi.fn().mockResolvedValue([
        {
          id: "corr-456",
          asset_a: "BTC",
          asset_b: "ETH",
          period: "4h",
          correlation_coefficient: 0.92,
          sample_count: 50,
          p_value: 0.0001,
          strength: "strong",
          computed_at: new Date(),
        },
      ]);

      const result = await service.computeCorrelation("BTC", "ETH", "4h");
      expect(result.period).toBe("4h");
    });
  });

  describe("getLatestCorrelation", () => {
    it("should retrieve latest correlation snapshot", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orWhere = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue({
        id: "corr-789",
        asset_a: "USDC",
        asset_b: "EURC",
        period: "1d",
        correlation_coefficient: 0.82,
        sample_count: 95,
        p_value: 0.002,
        strength: "strong",
        computed_at: new Date(),
      });

      const result = await service.getLatestCorrelation("USDC", "EURC", "1d");

      expect(result).toBeDefined();
      expect(result?.correlationCoefficient).toBe(0.82);
    });

    it("should return null if no correlation found", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orWhere = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockResolvedValue(null);

      const result = await service.getLatestCorrelation("UNKNOWN1", "UNKNOWN2", "1d");

      expect(result).toBeNull();
    });
  });

  describe("getCorrelationMatrix", () => {
    it("should compute correlation matrix for multiple assets", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orWhere = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
      mockDb.first = vi.fn().mockImplementation(function () {
        if (this.where.mock.lastCall?.[0]?.asset_a === "USD" && this.where.mock.lastCall?.[1]?.asset_b === "EUR") {
          return Promise.resolve({
            correlation_coefficient: 0.85,
          });
        }
        return Promise.resolve(null);
      });

      const matrix = await service.getCorrelationMatrix(["USD", "EUR", "GBP"], "1d");

      expect(matrix).toBeDefined();
      expect(matrix["USD"]["USD"]).toBe(1);
      expect(matrix["EUR"]["EUR"]).toBe(1);
      expect(matrix["GBP"]["GBP"]).toBe(1);
    });

    it("should handle empty asset list", async () => {
      const matrix = await service.getCorrelationMatrix([], "1d");
      expect(Object.keys(matrix).length).toBe(0);
    });
  });

  describe("createAlert", () => {
    it("should create correlation alert for owner", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.insert = vi.fn().mockReturnValue(mockDb);
      mockDb.returning = vi.fn().mockResolvedValue([
        {
          id: "alert-123",
          owner_address: "stellar1abc...",
          asset_a: "USDC",
          asset_b: "EURC",
          condition: "correlation > 0.8",
          threshold: 0.8,
          is_active: true,
          last_triggered_at: null,
          created_at: new Date(),
        },
      ]);

      const alert = await service.createAlert("stellar1abc...", "USDC", "EURC", "correlation > 0.8", 0.8);

      expect(alert).toBeDefined();
      expect(alert.ownerAddress).toBe("stellar1abc...");
      expect(alert.assetA).toBe("USDC");
      expect(alert.isActive).toBe(true);
    });
  });

  describe("listAlerts", () => {
    it("should list all alerts for an owner", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockResolvedValue([
        {
          id: "alert-1",
          owner_address: "stellar1abc...",
          asset_a: "USDC",
          asset_b: "EURC",
          condition: "correlation > 0.8",
          threshold: 0.8,
          is_active: true,
          last_triggered_at: null,
          created_at: new Date(),
        },
        {
          id: "alert-2",
          owner_address: "stellar1abc...",
          asset_a: "BTC",
          asset_b: "ETH",
          condition: "correlation < -0.5",
          threshold: -0.5,
          is_active: false,
          last_triggered_at: new Date(),
          created_at: new Date(),
        },
      ]);

      const alerts = await service.listAlerts("stellar1abc...");

      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.length).toBe(2);
      expect(alerts[0].ownerAddress).toBe("stellar1abc...");
    });

    it("should return empty list if owner has no alerts", async () => {
      const mockDb = vi.mocked(require("../../database/connection.js").getDatabase());
      mockDb.where = vi.fn().mockReturnValue(mockDb);
      mockDb.orderBy = vi.fn().mockResolvedValue([]);

      const alerts = await service.listAlerts("stellar1xyz...");

      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.length).toBe(0);
    });
  });

  describe("incompleteBeta", () => {
    it("should compute incomplete beta function", () => {
      const result = (service as any).incompleteBeta(1, 1, 0.5);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });

    it("should handle edge cases", () => {
      const result = (service as any).incompleteBeta(0.5, 0.5, 0.25);
      expect(result).toBeGreaterThan(0);
    });
  });

  describe("beta", () => {
    it("should compute beta function", () => {
      const result = (service as any).beta(2, 2);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });
  });

  describe("lnGamma", () => {
    it("should compute logarithm of gamma function", () => {
      const result = (service as any).lnGamma(5);
      expect(typeof result).toBe("number");
      expect(result).toBeGreaterThan(0);
    });

    it("should handle various inputs", () => {
      const r1 = (service as any).lnGamma(1);
      const r2 = (service as any).lnGamma(2);
      const r3 = (service as any).lnGamma(3);
      expect(r1).toBeLessThan(r2);
      expect(r2).toBeLessThan(r3);
    });
  });
});
