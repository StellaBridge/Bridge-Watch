import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/anomalyDetection.service.js", () => ({
  anomalyDetectionService: {
    evaluateAllAssets: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { anomalyDetectionService } from "../../src/services/anomalyDetection.service.js";
import { logger } from "../../src/utils/logger.js";
import { processAnomalyDetection } from "../../src/workers/anomalyDetection.job.js";

const evaluateAllAssets = vi.mocked(anomalyDetectionService.evaluateAllAssets);

function result(overrides: Record<string, unknown> = {}) {
  return {
    assetCode: "USDC",
    bridgeName: "Circle",
    anomaly: false,
    signals: [],
    explanation: { summary: "ok", rules: [], evidence: [] },
    ...overrides,
  };
}

describe("processAnomalyDetection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("evaluates all assets and logs emitted vs suppressed counts", async () => {
    evaluateAllAssets.mockResolvedValue([
      result({ assetCode: "USDC", anomaly: true, suppressed: false }),
      result({ assetCode: "EURC", anomaly: false, suppressed: true }),
      result({ assetCode: "XLM", anomaly: false }),
    ]);

    await processAnomalyDetection({ id: "job-1" } as never);

    expect(evaluateAllAssets).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith({ jobId: "job-1" }, "Starting anomaly detection job");
    expect(logger.info).toHaveBeenCalledWith(
      { evaluated: 3, emitted: 1, suppressed: 1 },
      "Completed anomaly detection job",
    );
  });

  it("handles an empty evaluation with zero counts", async () => {
    evaluateAllAssets.mockResolvedValue([]);

    await processAnomalyDetection({ id: "job-2" } as never);

    expect(logger.info).toHaveBeenCalledWith(
      { evaluated: 0, emitted: 0, suppressed: 0 },
      "Completed anomaly detection job",
    );
  });

  it("counts suppressed anomalies separately from emitted ones", async () => {
    evaluateAllAssets.mockResolvedValue([
      result({ anomaly: true, suppressed: true }),
      result({ anomaly: true, suppressed: true }),
    ]);

    await processAnomalyDetection({ id: "job-3" } as never);

    // Suppressed results carry anomaly:false, so only unsuppressed anomalies count as emitted.
    expect(logger.info).toHaveBeenCalledWith(
      { evaluated: 2, emitted: 2, suppressed: 2 },
      "Completed anomaly detection job",
    );
  });

  it("propagates evaluation failures without logging completion", async () => {
    evaluateAllAssets.mockRejectedValue(new Error("price service down"));

    await expect(processAnomalyDetection({ id: "job-4" } as never)).rejects.toThrow(
      "price service down",
    );
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});
