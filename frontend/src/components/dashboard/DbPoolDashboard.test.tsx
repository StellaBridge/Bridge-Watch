import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { DbPoolDashboard } from "./DbPoolDashboard";

const sampleStatus = {
  pool_id: "postgres-primary",
  is_healthy: true,
  current_utilization: 0.6,
  active_connections: 6,
  idle_connections: 4,
  waiting_requests: 0,
  max_connections: 10,
  recent_errors: 0,
  last_heartbeat: "2026-10-21T12:00:00Z",
  recommended_actions: [],
};

function stubEndpoints(status: typeof sampleStatus | null = sampleStatus, metrics: object[] = [], events: object[] = []) {
  const fetchMock = vi.fn(async (resource: string | URL | Request) => {
    const url = String(resource);
    const data = url.includes("/metrics?") ? metrics : url.includes("/events?") ? events : status;
    return { ok: true, json: async () => ({ data }) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DbPoolDashboard (#1507)", () => {
  it("renders a loading indicator while metrics are being fetched", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(React.createElement(DbPoolDashboard));
    expect(screen.getByRole("status", { name: "Loading pool metrics" })).toBeInTheDocument();
  });

  it("shows active versus max connections and an accessible utilization gauge", async () => {
    const fetchMock = stubEndpoints();
    render(React.createElement(DbPoolDashboard));
    await waitFor(() => expect(screen.getByText("60.0%")).toBeInTheDocument());
    expect(screen.getByText("6 of 10 connections active")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "60");
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows a warning above 80% utilization, but not at the boundary", async () => {
    stubEndpoints({ ...sampleStatus, current_utilization: 0.81 });
    const { unmount } = render(React.createElement(DbPoolDashboard));
    await waitFor(() => expect(screen.getByText("81.0%")).toBeInTheDocument());
    expect(screen.getByText("High utilization warning")).toBeInTheDocument();
    unmount();

    stubEndpoints({ ...sampleStatus, current_utilization: 0.8 });
    render(React.createElement(DbPoolDashboard));
    await waitFor(() => expect(screen.getByText("80.0%")).toBeInTheDocument());
    expect(screen.queryByText("High utilization warning")).not.toBeInTheDocument();
  });

  it("handles empty datasets and missing pool status gracefully", async () => {
    stubEndpoints(null);
    render(React.createElement(DbPoolDashboard));
    await waitFor(() => expect(screen.getByText("No pool status available")).toBeInTheDocument());
    expect(screen.getByText("No pool metrics available")).toBeInTheDocument();
    expect(screen.getByText("No recent events")).toBeInTheDocument();
  });

  it("displays a fallback error message for a failed metrics endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request) => ({
      ok: !String(resource).includes("/metrics?"),
      json: async () => ({ data: [] }),
    })));
    render(React.createElement(DbPoolDashboard));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Failed to fetch database pool metrics"));
    expect(screen.getByText("No pool status available")).toBeInTheDocument();
  });

  it("renders recent events, their severity, and an unhealthy state", async () => {
    stubEndpoints(
      { ...sampleStatus, is_healthy: false, recommended_actions: ["Reduce concurrency"] },
      [],
      [{ id: 1, timestamp: "2026-10-21T12:00:00Z", pool_id: "postgres-primary", event_type: "timeout", severity: "critical", message: "Connection stalled" }],
    );
    render(React.createElement(DbPoolDashboard));
    await waitFor(() => expect(screen.getByText("Connection stalled")).toBeInTheDocument());
    expect(screen.getByText("Unhealthy")).toBeInTheDocument();
    expect(screen.getByText("Reduce concurrency")).toBeInTheDocument();
  });

  it("opens and closes pool controls without executing a destructive action", async () => {
    stubEndpoints();
    render(React.createElement(DbPoolDashboard));
    await waitFor(() => expect(screen.getByText("60.0%")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Pool Controls" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cleans up the refresh polling interval on unmount", () => {
    stubEndpoints();
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = render(React.createElement(DbPoolDashboard));
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30_000);
    const interval = setIntervalSpy.mock.results.find(result => result.type === "return")?.value;
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(interval);
  });
});
