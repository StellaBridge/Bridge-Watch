import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { DataProvenanceGraphPage } from "../pages/DataProvenanceGraphPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
  });
  await mockCoreApi(page);
});

test.describe("Data Provenance Graph", () => {
  test("should navigate to provenance graph and display nodes", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    expect(await graphPage.isGraphLoaded()).toBe(true);
    expect(await graphPage.getGraphNodes()).toBeTruthy();
  });

  test("should inspect node details when clicking a node", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    await graphPage.clickNode("Source Bridge");

    const inspector = await graphPage.getNodeInspector();
    expect(await inspector.isVisible()).toBe(true);
    expect(await graphPage.getNodeInspectorTitle()).toBe("Source Bridge");
  });

  test("should display node details in inspector panel", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    await graphPage.clickNode("Asset Transfer");

    const details = await graphPage.getNodeInspectorDetails();
    expect(Object.keys(details).length).toBeGreaterThan(0);
    expect(details).toHaveProperty("type");
    expect(details).toHaveProperty("timestamp");
  });

  test("should expand node details when clicking expand button", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    const isExpandedBefore = await graphPage.isNodeExpanded("Destination");
    await graphPage.expandNodeDetails("Destination");
    const isExpandedAfter = await graphPage.isNodeExpanded("Destination");

    expect(isExpandedAfter).not.toBe(isExpandedBefore);
  });

  test("should show tooltip on node hover", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    await graphPage.hoverOverNode("Transaction");

    const tooltip = await graphPage.getTooltipContent();
    expect(tooltip.length).toBeGreaterThan(0);
  });

  test("should display edge connections between nodes", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    const edges = await graphPage.getEdgeConnections();
    expect(await edges.count()).toBeGreaterThan(0);
  });

  test("should zoom in on graph", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    const containerBefore = await graphPage.getGraphContainer();
    const scaleBefore = await containerBefore.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });

    await graphPage.zoomIn();

    const containerAfter = await graphPage.getGraphContainer();
    const scaleAfter = await containerAfter.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });

    expect(scaleAfter).not.toBe(scaleBefore);
  });

  test("should zoom out on graph", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    const containerBefore = await graphPage.getGraphContainer();
    const scaleBefore = await containerBefore.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });

    await graphPage.zoomOut();

    const containerAfter = await graphPage.getGraphContainer();
    const scaleAfter = await containerAfter.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });

    expect(scaleAfter).not.toBe(scaleBefore);
  });

  test("should reset zoom to default level", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    await graphPage.zoomIn();
    await graphPage.zoomIn();

    const containerBefore = await graphPage.getGraphContainer();
    const scaleBefore = await containerBefore.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });

    await graphPage.resetZoom();

    const containerAfter = await graphPage.getGraphContainer();
    const scaleAfter = await containerAfter.evaluate((el) => {
      return window.getComputedStyle(el).transform;
    });

    expect(scaleAfter).not.toBe(scaleBefore);
  });

  test("should navigate through multiple nodes and inspect each", async ({ page }) => {
    const graphPage = new DataProvenanceGraphPage(page);
    await graphPage.navigateToProvenance();

    const nodes = ["Source Bridge", "Asset Transfer", "Destination"];

    for (const nodeName of nodes) {
      await graphPage.clickNode(nodeName);
      const inspector = await graphPage.getNodeInspector();
      expect(await inspector.isVisible()).toBe(true);
      expect(await graphPage.getNodeInspectorTitle()).toBe(nodeName);
    }
  });
});
