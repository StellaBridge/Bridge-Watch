import { describe, it, expect, vi, beforeEach } from "vitest";
import { CircuitBreakerActionEngine } from "../../src/services/circuitBreakerActionEngine.service.js";
import { changeApprovalService } from "../../src/services/changeApproval.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => vi.fn(),
}));

vi.mock("../../src/services/circuitBreaker.service.js", () => ({
  getCircuitBreakerService: () => null,
  PauseScope: { Global: 0, Bridge: 1, Asset: 2 },
}));

vi.mock("../../src/services/changeApproval.service.js", () => {
  const changeApprovalService = {
    createDraft: vi.fn(),
    submitForApproval: vi.fn(),
    approve: vi.fn(),
    applyChange: vi.fn(),
    getById: vi.fn(),
  };
  return { changeApprovalService };
});

const mockedChangeService = vi.mocked(changeApprovalService, true);

const WEBHOOK_CONFIG = {
  url: "https://ops.example.com/circuit-breaker",
};

describe("CircuitBreakerActionEngine manual override authorization", () => {
  let engine: CircuitBreakerActionEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new CircuitBreakerActionEngine();
  });

  describe("requestManualOverride", () => {
    it("throws when the requester does not hold operator:admin", async () => {
      await expect(
        engine.requestManualOverride({
          title: "Trip the bridge",
          description: "Manual trip",
          actionType: "contract_pause",
          config: WEBHOOK_CONFIG,
          requestedBy: "operator-1",
          requesterScopes: ["operator:read"],
        })
      ).rejects.toThrow("'operator:admin' scope");

      expect(mockedChangeService.createDraft).not.toHaveBeenCalled();
    });

    it("queues the action as a pending change request instead of executing", async () => {
      const draft = { id: "cr-1", title: "Trip the bridge", submittedBy: "operator-1" };
      mockedChangeService.createDraft.mockResolvedValueOnce(draft as never);
      mockedChangeService.submitForApproval.mockResolvedValueOnce({
        ...draft,
        status: "pending_approval",
      } as never);

      const result = await engine.requestManualOverride({
        title: "Trip the bridge",
        description: "Manual trip",
        actionType: "contract_pause",
        config: WEBHOOK_CONFIG,
        requestedBy: "operator-1",
        requesterScopes: ["operator:admin"],
      });

      expect(mockedChangeService.createDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Trip the bridge",
          changeType: "other",
          createdBy: "operator-1",
          payload: {
            engine: "circuit_breaker_action_engine",
            actionType: "contract_pause",
            config: WEBHOOK_CONFIG,
            requestedBy: "operator-1",
          },
        })
      );
      expect(mockedChangeService.submitForApproval).toHaveBeenCalledWith("cr-1", "operator-1");
      expect((result as { status?: string }).status).toBe("pending_approval");
    });
  });

  describe("executeApprovedManualOverride", () => {
    it("throws when the approver does not hold operator:admin", async () => {
      await expect(
        engine.executeApprovedManualOverride({
          changeRequestId: "cr-1",
          approvedBy: "admin-2",
          approverScopes: ["operator:read"],
        })
      ).rejects.toThrow("'operator:admin' scope");

      expect(mockedChangeService.getById).not.toHaveBeenCalled();
    });

    it("throws when the approver is the same identity as the submitter", async () => {
      mockedChangeService.getById.mockResolvedValueOnce({
        id: "cr-1",
        title: "Trip the bridge",
        submittedBy: "admin-2",
        payload: {
          engine: "circuit_breaker_action_engine",
          actionType: "contract_pause",
          config: WEBHOOK_CONFIG,
          requestedBy: "admin-2",
        },
      } as never);

      await expect(
        engine.executeApprovedManualOverride({
          changeRequestId: "cr-1",
          approvedBy: "admin-2",
          approverScopes: ["operator:admin"],
        })
      ).rejects.toThrow("Four-eyes principle violation");

      expect(mockedChangeService.approve).not.toHaveBeenCalled();
    });

    it("throws when the change request is not a circuit breaker override", async () => {
      mockedChangeService.getById.mockResolvedValueOnce({
        id: "cr-2",
        title: "Unrelated change",
        submittedBy: "operator-1",
        payload: { engine: "something_else" },
      } as never);

      await expect(
        engine.executeApprovedManualOverride({
          changeRequestId: "cr-2",
          approvedBy: "admin-2",
          approverScopes: ["operator:admin"],
        })
      ).rejects.toThrow("is not a circuit breaker override");

      expect(mockedChangeService.approve).not.toHaveBeenCalled();
    });

    it("approves, applies, and executes the action after a distinct admin signs off", async () => {
      mockedChangeService.getById.mockResolvedValueOnce({
        id: "cr-1",
        title: "Trip the bridge",
        submittedBy: "operator-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        payload: {
          engine: "circuit_breaker_action_engine",
          actionType: "webhook",
          config: WEBHOOK_CONFIG,
          requestedBy: "operator-1",
        },
      } as never);
      mockedChangeService.approve.mockResolvedValueOnce({ id: "cr-1", status: "approved" } as never);
      mockedChangeService.applyChange.mockResolvedValueOnce({ id: "cr-1", status: "applied" } as never);

      const executeSpy = vi
        .spyOn(engine, "executeSingleAction")
        .mockResolvedValueOnce({ id: "log-1", status: "success" } as never);

      const log = await engine.executeApprovedManualOverride({
        changeRequestId: "cr-1",
        approvedBy: "admin-2",
        approverScopes: ["operator:admin"],
      });

      expect(mockedChangeService.approve).toHaveBeenCalledWith("cr-1", "admin-2");
      expect(mockedChangeService.applyChange).toHaveBeenCalledWith("cr-1", "admin-2");
      expect(executeSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: "webhook",
          config: JSON.stringify(WEBHOOK_CONFIG),
        }),
        expect.objectContaining({ alertType: "manual_override" })
      );
      expect(log.status).toBe("success");
    });
  });
});
