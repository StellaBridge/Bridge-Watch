import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { fireEvent, render, screen, waitFor, within } from "../../test/utils";
import { server } from "../../test/mocks/server";
import OperationalAccessAudit from "../OperationalAccessAudit";

// Separate panels with their own data sources and tests.
vi.mock("../../components/UserActivityHeatmap", () => ({
  default: () => <div data-testid="activity-heatmap" />,
}));
vi.mock("../../components/LoginRiskSignals", () => ({
  LoginRiskSignals: () => <div data-testid="login-risk-signals" />,
}));

const API = "*/api/v1/admin/access-audit";

interface Entry {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  role: string;
  target: string;
}

function entry(n: number, overrides: Partial<Entry> = {}): Entry {
  return {
    id: `entry-${n}`,
    created_at: `2026-11-${String((n % 28) + 1).padStart(2, "0")}T10:00:00Z`,
    actor: `operator${n}@bridge.watch`,
    action: ["LOGIN", "CONFIG_CHANGE", "EXPORT"][n % 3],
    role: "Observer",
    target: `resource-${n}`,
    ...overrides,
  };
}

/** 120 entries served 50 per page, like the backend. */
const ALL_ENTRIES = Array.from({ length: 120 }, (_, i) => entry(i + 1));

let requests: URL[];

beforeEach(() => {
  requests = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(new URL(request.url));
  });
  server.use(
    http.get(`${API}/stats`, () =>
      HttpResponse.json({
        total: 120,
        byRole: [{ role: "SuperAdmin" }, { role: "Observer" }],
        byAction: [{ action: "CONFIG_CHANGE" }],
      })
    ),
    http.get(`${API}/entries`, ({ request }) => {
      const url = new URL(request.url);
      const page = Number(url.searchParams.get("page"));
      const limit = Number(url.searchParams.get("limit"));
      return HttpResponse.json({
        entries: ALL_ENTRIES.slice((page - 1) * limit, page * limit),
        total: ALL_ENTRIES.length,
      });
    }),
    http.get("*/api/v1/admin/audit-logs", () =>
      HttpResponse.json({
        logs: [
          { id: "log-1", actor_id: "admin-7", action: "ROLE_GRANT", resource_type: "member", severity: "warning" },
          { id: "log-2", action: "EXPORT" },
        ],
        total: 2,
      })
    ),
    http.get(`${API}/roles`, () =>
      HttpResponse.json({
        members: [
          { id: "m-1", member: "GALICE", role: "SuperAdmin", assigned_by: "GROOT" },
          { id: "m-2", address: "GBOB", role: "Observer" },
        ],
      })
    ),
    http.get(`${API}/sessions`, ({ request }) => {
      const status = new URL(request.url).searchParams.get("status");
      const sessions = [
        { id: "sess-active-0001", user: "alice", status: "active" },
        { id: "sess-revoked-002", user_id: "bob", status: "revoked" },
        { id: "sess-expired-003", user: "carol", status: "expired" },
      ];
      return HttpResponse.json({
        sessions: status === "all" ? sessions : sessions.filter((s) => s.status === status),
      });
    })
  );
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

/** jsdom's Blob has no text(). */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function table() {
  return screen.getByRole("table");
}

function bodyRows() {
  return within(table()).getAllByRole("row").slice(1);
}

describe("OperationalAccessAudit page (#1685)", () => {
  it("renders the stats bar and the first page of the access audit table", async () => {
    render(<OperationalAccessAudit />);

    expect(screen.getByRole("heading", { name: "Operational Access Audit" })).toBeInTheDocument();
    expect(within(table()).getByText("Loading…")).toBeInTheDocument();

    await screen.findByText("operator1@bridge.watch");
    expect(bodyRows()).toHaveLength(50);
    expect(within(table()).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Time",
      "Actor",
      "Action",
      "Role",
      "Target",
    ]);
    const first = within(bodyRows()[0]);
    expect(first.getByText("CONFIG_CHANGE")).toBeInTheDocument();
    expect(first.getByText("Observer")).toBeInTheDocument();
    expect(first.getByText("resource-1")).toBeInTheDocument();

    const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    await waitFor(() => expect(stat("Total Events")).toBe("120"));
    expect(stat("Top Role")).toBe("SuperAdmin");
    expect(stat("Top Action")).toBe("CONFIG_CHANGE");
    expect(stat("Roles Tracked")).toBe("2");
    expect(screen.getByTestId("login-risk-signals")).toBeInTheDocument();
  }, 15_000); // first render in a worker includes cold module loading

  it("pages through the audit log with Previous and Next", async () => {
    render(<OperationalAccessAudit />);
    await screen.findByText("operator1@bridge.watch");

    expect(screen.getByText("Page 1 of 3 (120 total)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("operator51@bridge.watch");
    expect(screen.getByText("Page 2 of 3 (120 total)")).toBeInTheDocument();
    expect(screen.queryByText("operator1@bridge.watch")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("operator101@bridge.watch");
    expect(bodyRows()).toHaveLength(20);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("operator51@bridge.watch");

    const pages = requests
      .filter((u) => u.pathname.endsWith("/access-audit/entries"))
      .map((u) => [u.searchParams.get("page"), u.searchParams.get("limit")]);
    // Page 2 is shown from the query cache on the way back (and may be
    // refreshed in the background), so only the first visits are fixed.
    expect(pages.slice(0, 3)).toEqual([
      ["1", "50"],
      ["2", "50"],
      ["3", "50"],
    ]);
    expect(pages.every(([, limit]) => limit === "50")).toBe(true);
  });

  it("hides pagination and shows an empty state when there are no entries", async () => {
    server.use(http.get(`${API}/entries`, () => HttpResponse.json({ entries: [], total: 0 })));
    render(<OperationalAccessAudit />);

    expect(await within(table()).findByText("No entries found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export CSV/ })).toBeDisabled();
  });

  it("filters sessions by status, sending the filter to the API", async () => {
    render(<OperationalAccessAudit />);
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));

    await screen.findByText("alice");
    expect(bodyRows()).toHaveLength(3);
    expect(within(table()).getByText("bob")).toBeInTheDocument(); // user_id fallback

    fireEvent.click(screen.getByRole("button", { name: "Revoked" }));
    await waitFor(() => expect(screen.queryByText("alice")).not.toBeInTheDocument());
    await within(table()).findByText("bob");
    expect(bodyRows()).toHaveLength(1);
    expect(within(bodyRows()[0]).getByText("revoked")).toHaveClass("bg-red-100");
    expect(within(bodyRows()[0]).getByText("sess-rev…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoked" })).toHaveClass("bg-primary");

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    await screen.findByText("alice");
    expect(bodyRows()).toHaveLength(1);

    const statuses = requests
      .filter((u) => u.pathname.endsWith("/access-audit/sessions"))
      .map((u) => u.searchParams.get("status"));
    expect(statuses).toEqual(["all", "revoked", "active"]);
  });

  it("shows RBAC action logs with actor, action, resource and severity fallbacks", async () => {
    render(<OperationalAccessAudit />);
    fireEvent.click(screen.getByRole("button", { name: "RBAC Audit Logs" }));

    await screen.findByText("ROLE_GRANT");
    const [granted, exported] = bodyRows();
    expect(within(granted).getByText("admin-7")).toBeInTheDocument();
    expect(within(granted).getByText("member")).toBeInTheDocument();
    expect(within(granted).getByText("warning")).toBeInTheDocument();
    expect(within(exported).getByText("admin")).toBeInTheDocument();
    expect(within(exported).getByText("info")).toBeInTheDocument();
  });

  it("shows role assignments and the activity heatmap tabs", async () => {
    render(<OperationalAccessAudit />);
    fireEvent.click(screen.getByRole("button", { name: "Roles" }));

    await screen.findByText("GALICE");
    expect(within(table()).getByText("GBOB")).toBeInTheDocument(); // address fallback
    expect(within(table()).getByText("SuperAdmin")).toHaveClass("bg-red-100");

    fireEvent.click(screen.getByRole("button", { name: "Activity Heatmap" }));
    expect(screen.getByTestId("activity-heatmap")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  describe("export", () => {
    let blobs: Blob[];
    let downloads: string[];

    beforeEach(() => {
      blobs = [];
      downloads = [];
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          blobs.push(blob);
          return "blob:audit";
        }),
        revokeObjectURL: vi.fn(),
      });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        downloads.push(this.download);
      });
    });

    it("downloads the visible access audit page as CSV", async () => {
      server.use(
        http.get(`${API}/entries`, () =>
          HttpResponse.json({
            entries: [
              entry(1, { action: "EXPORT", target: 'report "Q4", final' }),
              entry(2, { action: "LOGIN" }),
            ],
            total: 2,
          })
        )
      );
      render(<OperationalAccessAudit />);
      await screen.findByText("operator1@bridge.watch");

      fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatch(/^audit-logs-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(blobs[0].type).toBe("text/csv;charset=utf-8;");
      const lines = (await readBlob(blobs[0])).split("\n");
      expect(lines[0]).toBe("Timestamp,Actor,Action,Role/Resource,Target/ID");
      expect(lines).toHaveLength(3);
      // Quotes are escaped and commas stay inside their field.
      expect(lines[1]).toBe(
        '"2026-11-02T10:00:00.000Z","operator1@bridge.watch","EXPORT","Observer","report ""Q4"", final"'
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:audit");
      expect(document.querySelector("a[download]")).toBeNull();
    });

    it("downloads RBAC logs under their own file name", async () => {
      render(<OperationalAccessAudit />);
      fireEvent.click(screen.getByRole("button", { name: "RBAC Audit Logs" }));
      await screen.findByText("ROLE_GRANT");

      fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));

      expect(downloads[0]).toMatch(/^rbac-admin-audit-\d{4}-\d{2}-\d{2}\.csv$/);
      const lines = (await readBlob(blobs[0])).split("\n");
      expect(lines[1]).toBe('"","admin-7","ROLE_GRANT","member",""');
    });
  });
});
