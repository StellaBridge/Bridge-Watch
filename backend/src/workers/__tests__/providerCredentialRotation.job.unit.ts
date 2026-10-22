import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunRotationScheduler = vi.fn();

vi.mock("../../services/providerCredentialRotation.service.js", () => ({
  providerCredentialRotationService: {
    runRotationScheduler: mockRunRotationScheduler,
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { processProviderCredentialRotation } from "../providerCredentialRotation.job.js";

describe("providerCredentialRotation.job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call runRotationScheduler and log results on success", async () => {
    const result = {
      totalCredentials: 10,
      candidates: [
        {
          credential: {
            id: "cred-1",
            providerKey: "aws_api_key",
            credentialType: "api_key",
            expiresAt: "2024-11-03",
            lastRotatedAt: "2024-09-03",
            rotationIntervalDays: 90,
            status: "scheduled" as const,
            metadata: { region: "us-east-1" },
            createdAt: "2024-06-03",
            updatedAt: "2024-09-03",
          },
          daysUntilExpiry: 14,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
      ],
      results: [
        {
          credentialId: "cred-1",
          providerKey: "aws_api_key",
          credentialType: "api_key",
          success: true,
          rotatedAt: "2024-10-20",
          newExpiresAt: "2025-01-18",
          error: null,
        },
      ],
    };

    mockRunRotationScheduler.mockResolvedValue(result);

    const job = {
      id: "job-rotation-1",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).resolves.toBeUndefined();
    expect(mockRunRotationScheduler).toHaveBeenCalledOnce();
  });

  it("should handle no credentials needing rotation", async () => {
    const result = {
      totalCredentials: 5,
      candidates: [],
      results: [],
    };

    mockRunRotationScheduler.mockResolvedValue(result);

    const job = {
      id: "job-rotation-2",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).resolves.toBeUndefined();
    expect(mockRunRotationScheduler).toHaveBeenCalledOnce();
  });

  it("should handle mixed success and failure results", async () => {
    const result = {
      totalCredentials: 8,
      candidates: [
        {
          credential: {
            id: "cred-2",
            providerKey: "gcp_key",
            credentialType: "service_account",
            expiresAt: "2024-10-25",
            lastRotatedAt: "2024-07-25",
            rotationIntervalDays: 90,
            status: "rotating" as const,
            metadata: { project: "my-project" },
            createdAt: "2024-04-25",
            updatedAt: "2024-07-25",
          },
          daysUntilExpiry: 5,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
        {
          credential: {
            id: "cred-3",
            providerKey: "azure_secret",
            credentialType: "secret",
            expiresAt: null,
            lastRotatedAt: "2024-10-01",
            rotationIntervalDays: 30,
            status: "scheduled" as const,
            metadata: { vault: "prod" },
            createdAt: "2024-09-01",
            updatedAt: "2024-10-01",
          },
          daysUntilExpiry: null,
          daysUntilScheduledRotation: 11,
          reason: "scheduled" as const,
        },
      ],
      results: [
        {
          credentialId: "cred-2",
          providerKey: "gcp_key",
          credentialType: "service_account",
          success: true,
          rotatedAt: "2024-10-20",
          newExpiresAt: "2025-01-18",
          error: null,
        },
        {
          credentialId: "cred-3",
          providerKey: "azure_secret",
          credentialType: "secret",
          success: false,
          rotatedAt: "2024-10-20",
          newExpiresAt: null,
          error: "Failed to rotate: Vault authentication failed",
        },
      ],
    };

    mockRunRotationScheduler.mockResolvedValue(result);

    const job = {
      id: "job-rotation-3",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).resolves.toBeUndefined();
    expect(mockRunRotationScheduler).toHaveBeenCalledOnce();
  });

  it("should propagate errors from runRotationScheduler", async () => {
    const error = new Error("Database connection failed");
    mockRunRotationScheduler.mockRejectedValue(error);

    const job = {
      id: "job-rotation-error",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).rejects.toThrow(error);
  });

  it("should handle service throwing generic Error", async () => {
    const error = new Error("Service unavailable");
    mockRunRotationScheduler.mockRejectedValue(error);

    const job = {
      id: "job-rotation-generic-error",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).rejects.toThrow(error);
  });

  it("should handle very large number of credentials", async () => {
    const candidates = Array.from({ length: 1000 }, (_, i) => ({
      credential: {
        id: `cred-${i}`,
        providerKey: `provider_key_${i}`,
        credentialType: "api_key",
        expiresAt: "2024-11-03",
        lastRotatedAt: "2024-09-03",
        rotationIntervalDays: 90,
        status: "scheduled" as const,
        metadata: {},
        createdAt: "2024-06-03",
        updatedAt: "2024-09-03",
      },
      daysUntilExpiry: 14,
      daysUntilScheduledRotation: 0,
      reason: "expiry" as const,
    }));

    const result = {
      totalCredentials: 1000,
      candidates,
      results: candidates.map((c) => ({
        credentialId: c.credential.id,
        providerKey: c.credential.providerKey,
        credentialType: c.credential.credentialType,
        success: true,
        rotatedAt: "2024-10-20",
        newExpiresAt: "2025-01-18",
        error: null,
      })),
    };

    mockRunRotationScheduler.mockResolvedValue(result);

    const job = {
      id: "job-rotation-large",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).resolves.toBeUndefined();
  });

  it("should handle all successful rotations", async () => {
    const result = {
      totalCredentials: 3,
      candidates: [
        {
          credential: {
            id: "cred-success-1",
            providerKey: "api_key_1",
            credentialType: "api_key",
            expiresAt: "2024-11-03",
            lastRotatedAt: "2024-09-03",
            rotationIntervalDays: 90,
            status: "scheduled" as const,
            metadata: {},
            createdAt: "2024-06-03",
            updatedAt: "2024-09-03",
          },
          daysUntilExpiry: 14,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
        {
          credential: {
            id: "cred-success-2",
            providerKey: "api_key_2",
            credentialType: "api_key",
            expiresAt: "2024-11-10",
            lastRotatedAt: "2024-08-10",
            rotationIntervalDays: 90,
            status: "scheduled" as const,
            metadata: {},
            createdAt: "2024-05-10",
            updatedAt: "2024-08-10",
          },
          daysUntilExpiry: 21,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
        {
          credential: {
            id: "cred-success-3",
            providerKey: "api_key_3",
            credentialType: "api_key",
            expiresAt: "2024-12-20",
            lastRotatedAt: "2024-09-20",
            rotationIntervalDays: 90,
            status: "scheduled" as const,
            metadata: {},
            createdAt: "2024-06-20",
            updatedAt: "2024-09-20",
          },
          daysUntilExpiry: 61,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
      ],
      results: [
        {
          credentialId: "cred-success-1",
          providerKey: "api_key_1",
          credentialType: "api_key",
          success: true,
          rotatedAt: "2024-10-20",
          newExpiresAt: "2025-01-18",
          error: null,
        },
        {
          credentialId: "cred-success-2",
          providerKey: "api_key_2",
          credentialType: "api_key",
          success: true,
          rotatedAt: "2024-10-20",
          newExpiresAt: "2025-01-18",
          error: null,
        },
        {
          credentialId: "cred-success-3",
          providerKey: "api_key_3",
          credentialType: "api_key",
          success: true,
          rotatedAt: "2024-10-20",
          newExpiresAt: "2025-01-18",
          error: null,
        },
      ],
    };

    mockRunRotationScheduler.mockResolvedValue(result);

    const job = {
      id: "job-rotation-all-success",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).resolves.toBeUndefined();
    expect(mockRunRotationScheduler).toHaveBeenCalledOnce();
  });

  it("should handle all failed rotations", async () => {
    const result = {
      totalCredentials: 2,
      candidates: [
        {
          credential: {
            id: "cred-fail-1",
            providerKey: "api_key_fail",
            credentialType: "api_key",
            expiresAt: "2024-11-03",
            lastRotatedAt: "2024-09-03",
            rotationIntervalDays: 90,
            status: "failed" as const,
            metadata: {},
            createdAt: "2024-06-03",
            updatedAt: "2024-09-03",
          },
          daysUntilExpiry: 14,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
        {
          credential: {
            id: "cred-fail-2",
            providerKey: "secret_fail",
            credentialType: "secret",
            expiresAt: "2024-10-25",
            lastRotatedAt: "2024-07-25",
            rotationIntervalDays: 90,
            status: "failed" as const,
            metadata: {},
            createdAt: "2024-04-25",
            updatedAt: "2024-07-25",
          },
          daysUntilExpiry: 5,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
      ],
      results: [
        {
          credentialId: "cred-fail-1",
          providerKey: "api_key_fail",
          credentialType: "api_key",
          success: false,
          rotatedAt: "2024-10-20",
          newExpiresAt: null,
          error: "Provider API rate limit exceeded",
        },
        {
          credentialId: "cred-fail-2",
          providerKey: "secret_fail",
          credentialType: "secret",
          success: false,
          rotatedAt: "2024-10-20",
          newExpiresAt: null,
          error: "Invalid credentials for provider authentication",
        },
      ],
    };

    mockRunRotationScheduler.mockResolvedValue(result);

    const job = {
      id: "job-rotation-all-fail",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).resolves.toBeUndefined();
    expect(mockRunRotationScheduler).toHaveBeenCalledOnce();
  });

  it("should handle null error message in failed result", async () => {
    const result = {
      totalCredentials: 1,
      candidates: [
        {
          credential: {
            id: "cred-null-error",
            providerKey: "api_key",
            credentialType: "api_key",
            expiresAt: "2024-11-03",
            lastRotatedAt: "2024-09-03",
            rotationIntervalDays: 90,
            status: "failed" as const,
            metadata: {},
            createdAt: "2024-06-03",
            updatedAt: "2024-09-03",
          },
          daysUntilExpiry: 14,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
      ],
      results: [
        {
          credentialId: "cred-null-error",
          providerKey: "api_key",
          credentialType: "api_key",
          success: false,
          rotatedAt: "2024-10-20",
          newExpiresAt: null,
          error: null,
        },
      ],
    };

    mockRunRotationScheduler.mockResolvedValue(result);

    const job = {
      id: "job-rotation-null-error",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).resolves.toBeUndefined();
  });

  it("should handle result with new expiry dates", async () => {
    const result = {
      totalCredentials: 1,
      candidates: [
        {
          credential: {
            id: "cred-with-expiry",
            providerKey: "api_key",
            credentialType: "api_key",
            expiresAt: "2024-11-03",
            lastRotatedAt: "2024-09-03",
            rotationIntervalDays: 90,
            status: "rotated" as const,
            metadata: {},
            createdAt: "2024-06-03",
            updatedAt: "2024-10-20",
          },
          daysUntilExpiry: 14,
          daysUntilScheduledRotation: 0,
          reason: "expiry" as const,
        },
      ],
      results: [
        {
          credentialId: "cred-with-expiry",
          providerKey: "api_key",
          credentialType: "api_key",
          success: true,
          rotatedAt: "2024-10-20",
          newExpiresAt: "2025-01-18",
          error: null,
        },
      ],
    };

    mockRunRotationScheduler.mockResolvedValue(result);

    const job = {
      id: "job-rotation-new-expiry",
      data: {},
    } as any as Job;

    await expect(processProviderCredentialRotation(job)).resolves.toBeUndefined();
  });
});
