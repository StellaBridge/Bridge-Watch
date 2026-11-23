import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SessionDeviceManagement from "../SessionDeviceManagement";
import * as api from "../../services/api";
import type { SessionDeviceRecord } from "../../types";

vi.mock("../../services/api", () => ({
  listSessionDevices: vi.fn(),
  registerSessionDevice: vi.fn(),
  revokeSessionDevice: vi.fn(),
  revokeOtherSessionDevices: vi.fn(),
  setSessionDeviceTrust: vi.fn(),
}));

function device(overrides: Partial<SessionDeviceRecord> = {}): SessionDeviceRecord {
  return {
    id: "dev-1",
    userId: "user-operator-42",
    deviceFingerprint: "fp-macbook-pro-m2",
    deviceName: "Chrome on macOS Sonoma",
    deviceType: "DESKTOP",
    ipAddress: "192.168.1.50",
    location: "Lagos, NG",
    userAgent: "Mozilla/5.0",
    isActive: true,
    isTrusted: true,
    lastActiveAt: "2026-11-23T09:30:00Z",
    revokedAt: null,
    createdAt: "2026-11-01T09:00:00Z",
    updatedAt: "2026-11-23T09:30:00Z",
    ...overrides,
  };
}

const currentDevice = device();
const otherDevice = device({
  id: "dev-2",
  deviceFingerprint: "fp-windows-laptop-7",
  deviceName: "Firefox on Windows 11",
  ipAddress: "10.0.0.24",
  isTrusted: false,
  lastActiveAt: "2026-11-22T18:15:00Z",
});

function articleFor(name: string) {
  return screen.getByText(name).closest("article")!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listSessionDevices).mockResolvedValue({ devices: [currentDevice, otherDevice] });
  vi.mocked(api.revokeSessionDevice).mockResolvedValue({ device: otherDevice });
  vi.mocked(api.revokeOtherSessionDevices).mockResolvedValue({ revokedCount: 1 });
});

describe("SessionDeviceManagement (#1687)", () => {
  it("renders active sessions with browser, OS, IP address and last active time", async () => {
    render(<SessionDeviceManagement />);
    await screen.findByText("Chrome on macOS Sonoma");

    const current = articleFor("Chrome on macOS Sonoma");
    expect(within(current).getByText(/192\.168\.1\.50/)).toBeInTheDocument();
    expect(within(current).getByText(/DESKTOP/)).toBeInTheDocument();
    expect(within(current).getByText(new Date(currentDevice.lastActiveAt).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText("Active Sessions").nextElementSibling).toHaveTextContent("2");
    expect(api.listSessionDevices).toHaveBeenCalledWith("user-operator-42");
  });

  it("highlights the current device session with a badge", async () => {
    render(<SessionDeviceManagement />);
    await screen.findByText("Chrome on macOS Sonoma");

    expect(within(articleFor("Chrome on macOS Sonoma")).getByText("Current Device")).toBeInTheDocument();
    expect(within(articleFor("Firefox on Windows 11")).queryByText("Current Device")).toBeNull();
  });

  it("terminates a session through the API and removes it from the list", async () => {
    vi.mocked(api.listSessionDevices)
      .mockResolvedValueOnce({ devices: [currentDevice, otherDevice] })
      .mockResolvedValue({ devices: [currentDevice] });
    render(<SessionDeviceManagement />);
    await screen.findByText("Firefox on Windows 11");

    fireEvent.click(within(articleFor("Firefox on Windows 11")).getByRole("button", { name: "Terminate Session" }));

    await waitFor(() => expect(api.revokeSessionDevice).toHaveBeenCalledWith("dev-2", "user-operator-42"));
    await waitFor(() => expect(screen.queryByText("Firefox on Windows 11")).not.toBeInTheDocument());
    expect(screen.getByText("Chrome on macOS Sonoma")).toBeInTheDocument();
  });

  it("requires confirmation before terminating all other sessions", async () => {
    render(<SessionDeviceManagement />);
    await screen.findByText("Chrome on macOS Sonoma");

    fireEvent.click(within(articleFor("Chrome on macOS Sonoma"))
      .getByRole("button", { name: "Terminate All Other Sessions" }));
    expect(screen.getByRole("dialog", { name: "Terminate all other sessions?" })).toBeInTheDocument();
    expect(api.revokeOtherSessionDevices).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.revokeOtherSessionDevices).not.toHaveBeenCalled();

    fireEvent.click(within(articleFor("Chrome on macOS Sonoma"))
      .getByRole("button", { name: "Terminate All Other Sessions" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm terminate" }));

    await waitFor(() => expect(api.revokeOtherSessionDevices).toHaveBeenCalledWith("dev-1", "user-operator-42"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
