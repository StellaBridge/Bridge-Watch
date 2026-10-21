import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Job } from "bullmq";
import { processApiContractMonitor } from "../../workers/apiContractMonitor.job.js";
import { apiContractMonitorService } from "../../services/apiContractMonitor.service.js";

vi.mock("../../services/apiContractMonitor.service.js", () => ({
  apiContractMonitorService: {
    runAllChecks: vi.fn(),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockRunAllChecks = vi.mocked(apiContractMonitorService.runAllChecks);

function makeJob(overrides: Partial<Job> = {}): Job {
  return { id: "job-1", data: {}, ...overrides } as unknown as Job;
}

function makeRunResult(overrides: Partial<{
  checked: number;
  driftsDetected: number;
  breakingChanges: number;
}> = {}) {
  return {
    checkedAt: new Date().toISOString(),
    totalEndpoints: 2,
    checked: 2,
    driftsDetected: 0,
    breakingChanges: 0,
    results: [],
    ...overrides,
  };
}

describe("processApiContractMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls runAllChecks and resolves when no drift is detected", async () => {
    mockRunAllChecks.mockResolvedValue(makeRunResult());

    await expect(processApiContractMonitor(makeJob())).resolves.toBeUndefined();
    expect(mockRunAllChecks).toHaveBeenCalledTimes(1);
  });

  it("resolves when non-breaking drifts are detected", async () => {
    mockRunAllChecks.mockResolvedValue(
      makeRunResult({ driftsDetected: 2, breakingChanges: 0 }),
    );

    await expect(processApiContractMonitor(makeJob())).resolves.toBeUndefined();
  });

  it("resolves when breaking changes are detected", async () => {
    mockRunAllChecks.mockResolvedValue(
      makeRunResult({ driftsDetected: 1, breakingChanges: 1 }),
    );

    await expect(processApiContractMonitor(makeJob())).resolves.toBeUndefined();
  });

  it("rethrows when runAllChecks rejects (network timeout)", async () => {
    const err = new Error("connect ETIMEDOUT");
    mockRunAllChecks.mockRejectedValue(err);

    await expect(processApiContractMonitor(makeJob())).rejects.toThrow("connect ETIMEDOUT");
  });

  it("rethrows when runAllChecks rejects with a 5xx error", async () => {
    const err = new Error("External API returned 503");
    mockRunAllChecks.mockRejectedValue(err);

    await expect(processApiContractMonitor(makeJob())).rejects.toThrow("External API returned 503");
  });

  it("passes the job id through without mutating it", async () => {
    mockRunAllChecks.mockResolvedValue(makeRunResult());
    const job = makeJob({ id: "unique-job-42" });

    await processApiContractMonitor(job);

    expect(job.id).toBe("unique-job-42");
  });
});
