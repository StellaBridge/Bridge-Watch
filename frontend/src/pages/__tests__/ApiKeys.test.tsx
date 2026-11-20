import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ApiKeys from "../ApiKeys";
import * as api from "../../services/api";

vi.mock("../../services/api", () => ({
  listApiKeys: vi.fn(), listApiKeyTemplates: vi.fn(), createApiKey: vi.fn(),
  revokeApiKey: vi.fn(), rotateApiKey: vi.fn(), extendApiKey: vi.fn(),
}));

const active = {
  id: "active-1", name: "Production client", prefix: "bw_live",
  scopes: ["jobs:read"], rateLimitPerMinute: 120,
  revokedAt: null, lastUsedAt: null, expiresAt: null,
};
const revoked = {
  ...active, id: "revoked-2", name: "Old client",
  revokedAt: "2026-11-01T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.listApiKeys).mockResolvedValue({ keys: [active, revoked] } as never);
  vi.mocked(api.listApiKeyTemplates).mockResolvedValue({ templates: [] } as never);
  vi.mocked(api.revokeApiKey).mockResolvedValue(undefined as never);
  vi.mocked(api.createApiKey).mockResolvedValue({ apiKey: "bw_secret_once" } as never);
});

async function connect() {
  render(<ApiKeys />);
  fireEvent.change(screen.getByPlaceholderText("Paste your admin API key"), {
    target: { value: "admin-token" },
  });
  await screen.findByText("Production client");
}

describe("ApiKeys component (#1673)", () => {
  it("renders active and revoked API keys with accurate counts", async () => {
    await connect();
    expect(screen.getByText("Old client")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(api.listApiKeys).toHaveBeenCalledWith("admin-token");
  });

  it("displays an empty state when no API keys exist", async () => {
    vi.mocked(api.listApiKeys).mockResolvedValue({ keys: [] } as never);
    render(<ApiKeys />);
    fireEvent.change(screen.getByPlaceholderText("Paste your admin API key"), {
      target: { value: "admin-token" },
    });
    expect(await screen.findByText("No API keys yet. Create the first one from the form.")).toBeInTheDocument();
  });

  it("selects scopes and sends the selected permissions to the create API", async () => {
    await connect();
    fireEvent.change(screen.getByPlaceholderText("Partner monitor"), {
      target: { value: "Bridge partner" },
    });
    fireEvent.click(screen.getByLabelText("jobs:read"));
    fireEvent.click(screen.getByLabelText("admin:api-keys"));
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    await waitFor(() => expect(api.createApiKey).toHaveBeenCalledWith(
      "admin-token",
      expect.objectContaining({ name: "Bridge partner", scopes: ["jobs:trigger", "admin:api-keys"] })
    ));
  });

  it("shows a generated key once and copies it without exposing it in the active list", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { writeText },
    });
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Create API key" }));
    expect(await screen.findByText("bw_secret_once")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy generated API key" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("bw_secret_once"));
    expect(screen.getByRole("status")).toHaveTextContent("Copied API key");
    expect(within(screen.getByText("Production client").closest("article")!).queryByText("bw_secret_once")).toBeNull();
  });

  it("requires explicit confirmation before making the DELETE/revoke API call", async () => {
    await connect();
    const article = screen.getByText("Production client").closest("article")!;
    fireEvent.click(within(article).getByRole("button", { name: "Revoke" }));
    expect(screen.getByRole("dialog", { name: "Revoke API key?" })).toBeInTheDocument();
    expect(api.revokeApiKey).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.revokeApiKey).not.toHaveBeenCalled();
    fireEvent.click(within(article).getByRole("button", { name: "Revoke" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm revoke" }));
    await waitFor(() => expect(api.revokeApiKey).toHaveBeenCalledWith("admin-token", "active-1"));
  });

  it("loads and applies a permission scope template", async () => {
    vi.mocked(api.listApiKeyTemplates).mockResolvedValue({
      templates: [{ id: "reader", name: "Read-only", scopes: ["jobs:read"], rateLimitPerMinute: 40 }],
    } as never);
    await connect();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "reader" } });
    expect(screen.getByLabelText("jobs:read")).toBeChecked();
    expect(screen.getByLabelText("jobs:trigger")).not.toBeChecked();
    expect(screen.getByLabelText("Rate limit / minute")).toHaveValue(40);
  });
});
