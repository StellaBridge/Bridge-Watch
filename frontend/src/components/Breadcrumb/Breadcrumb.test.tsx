import { screen } from "../../test/utils";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Breadcrumb } from "./Breadcrumb";

// Helper to render Breadcrumb with a specific route
function renderAtRoute(path: string, props?: Parameters<typeof Breadcrumb>[0]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Breadcrumb {...props} />
    </MemoryRouter>,
  );
}

describe("Breadcrumb", () => {
  // ── Auto-generation from routes ────────────────────────

  it("auto-generates breadcrumbs from the current path", () => {
    renderAtRoute("/bridges");

    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Bridges")).toBeInTheDocument();
  });

  it("generates nested breadcrumbs for multi-segment paths", () => {
    renderAtRoute("/admin/api-keys");

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("API Keys")).toBeInTheDocument();
  });

  it("renders dynamic param segments with title-casing", () => {
    renderAtRoute("/assets/xlm-usd");

    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Xlm Usd")).toBeInTheDocument();
  });

  // ── Manual override items ──────────────────────────────

  it("uses manual items when provided", () => {
    renderAtRoute("/some-page", {
      items: [
        { label: "Custom Root", href: "/custom" },
        { label: "Current Page" },
      ],
    });

    expect(screen.getByText("Custom Root")).toBeInTheDocument();
    expect(screen.getByText("Current Page")).toBeInTheDocument();
    // Should NOT show auto-generated items
    expect(screen.queryByText("Some Page")).not.toBeInTheDocument();
  });

  // ── Current page indication ────────────────────────────

  it("marks the last item as current page", () => {
    renderAtRoute("/analytics");

    const currentItem = screen.getByText("Analytics").closest("[aria-current]");
    expect(currentItem).toHaveAttribute("aria-current", "page");
  });

  it("does not mark intermediate items as current", () => {
    renderAtRoute("/admin/api-keys");

    const adminLink = screen.getByText("Admin");
    expect(adminLink.closest("[aria-current]")).toBeNull();
  });

  // ── Clickable items ────────────────────────────────────

  it("renders intermediate items as links", () => {
    renderAtRoute("/admin/api-keys");

    const adminLink = screen.getByText("Admin").closest("a");
    expect(adminLink).toHaveAttribute("href", "/admin");
  });

  it("renders the Home item as a link to /dashboard", () => {
    renderAtRoute("/analytics");

    const homeLink = screen.getByText("Home").closest("a");
    expect(homeLink).toHaveAttribute("href", "/dashboard");
  });

  it("does not render the last item as a link", () => {
    renderAtRoute("/reports");

    const reportsItem = screen.getByText("Reports");
    expect(reportsItem.closest("a")).toBeNull();
  });

  // ── Home link ──────────────────────────────────────────

  it("includes Home link by default", () => {
    renderAtRoute("/settings");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("hides Home link when hideHome is true", () => {
    renderAtRoute("/settings", { hideHome: true });
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  // ── Truncation ─────────────────────────────────────────

  it("truncates labels exceeding maxLabelLength", () => {
    renderAtRoute("/page", {
      items: [{ label: "Very Long Breadcrumb Label Here" }],
      maxLabelLength: 10,
    });

    expect(screen.getByText("Very Long…")).toBeInTheDocument();
  });

  it("shows full label in title attribute when truncated", () => {
    renderAtRoute("/page", {
      items: [
        { label: "Extremely Long Label That Gets Cut", href: "/somewhere" },
        { label: "Short" },
      ],
      maxLabelLength: 12,
    });

    const truncatedLink = screen.getByText("Extremely L…").closest("a");
    expect(truncatedLink).toHaveAttribute("title", "Extremely Long Label That Gets Cut");
  });

  it("does not add title when label is within limit", () => {
    renderAtRoute("/bridges");

    const bridgesItem = screen.getByText("Bridges");
    expect(bridgesItem.closest("[title]")).toBeNull();
  });

  // ── SEO Structured Data ────────────────────────────────

  it("renders JSON-LD structured data", () => {
    renderAtRoute("/analytics");

    const scriptTag = document.querySelector('script[type="application/ld+json"]');
    expect(scriptTag).not.toBeNull();

    const data = JSON.parse(scriptTag!.textContent!);
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toBeInstanceOf(Array);
    expect(data.itemListElement.length).toBeGreaterThan(0);

    // Home should be first
    expect(data.itemListElement[0].name).toBe("Home");
    expect(data.itemListElement[0].position).toBe(1);
  });

  it("includes item URLs in structured data for linked items", () => {
    renderAtRoute("/admin/api-keys");

    const scriptTag = document.querySelector('script[type="application/ld+json"]');
    const data = JSON.parse(scriptTag!.textContent!);

    // Admin item (has href) should have item URL
    const adminEntry = data.itemListElement.find(
      (e: { name: string }) => e.name === "Admin",
    );
    expect(adminEntry.item).toContain("/admin");
  });

  // ── Accessible navigation ──────────────────────────────

  it("has an accessible navigation landmark with correct label", () => {
    renderAtRoute("/bridges");

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toBeInTheDocument();
  });

  it("uses an ordered list for semantic structure", () => {
    renderAtRoute("/bridges");

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const ol = nav.querySelector("ol");
    expect(ol).not.toBeNull();
  });

  // ── Icon support ───────────────────────────────────────

  it("renders icons when provided in manual items", () => {
    const TestIcon = () => <span data-testid="test-icon">★</span>;

    renderAtRoute("/page", {
      items: [{ label: "Starred Page", icon: <TestIcon /> }],
    });

    expect(screen.getByTestId("test-icon")).toBeInTheDocument();
  });

  // ── Edge cases ─────────────────────────────────────────

  it("renders nothing when path has no segments (root)", () => {
    renderAtRoute("/");

    // No nav should be present
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    renderAtRoute("/bridges", { className: "my-custom-class" });

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toHaveClass("my-custom-class");
  });
});
