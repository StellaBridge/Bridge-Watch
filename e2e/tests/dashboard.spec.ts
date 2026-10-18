import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem(
      "bridge-watch:dashboard-tour:v1",
      JSON.stringify({ completed: true, lastStep: 0, seen: true }),
    );
  });
  await mockCoreApi(page);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
});

test("renders dashboard widgets with mocked data", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Key metrics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Asset Health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bridge Status" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View details for bridge Allbridge" })).toBeVisible();

  const monitoredAssets = page
    .locator('[data-widget-id="kpi-banner"] article')
    .filter({ hasText: "Monitored assets" })
    .locator("div.mt-3.text-2xl");
  await expect(monitoredAssets).toHaveText("2");
});

test("collapses and expands a widget through layout visibility controls", async ({ page }) => {
  const assetHealth = page.getByRole("heading", { name: "Asset Health" });
  await expect(assetHealth).toBeVisible();

  await page.getByRole("button", { name: "Customize layout" }).click();
  const layoutDialog = page.getByRole("dialog", { name: "Customize dashboard layout" });
  const visibilityToggle = layoutDialog.getByRole("checkbox", {
    name: "Toggle visibility of Asset Discovery & Health",
  });
  await visibilityToggle.uncheck();
  await expect(assetHealth).toBeHidden();

  await visibilityToggle.check();
  await expect(assetHealth).toBeVisible();
  await layoutDialog.getByRole("button", { name: "Done" }).click();
});

test("applying asset and time-range filters updates dashboard metrics", async ({ page }) => {
  const monitoredAssets = page
    .locator('[data-widget-id="kpi-banner"] article')
    .filter({ hasText: "Monitored assets" })
    .locator("div.mt-3.text-2xl");
  await expect(monitoredAssets).toHaveText("2");

  await page.getByRole("checkbox", { name: "XLM" }).check();
  await expect(page).toHaveURL(/assets=XLM/);
  await expect(monitoredAssets).toHaveText("1");

  await page.getByRole("checkbox", { name: "XLM" }).uncheck();
  await page.getByRole("button", { name: "Last 24h" }).click();
  await expect(page).toHaveURL(/range=24h/);
  await expect(monitoredAssets).toHaveText("1");
});

test("time-range selection filters out stale asset data", async ({ page }) => {
  await expect(
    page
      .locator('[data-widget-id="kpi-banner"] article')
      .filter({ hasText: "Monitored assets" })
      .locator("div.mt-3.text-2xl"),
  ).toHaveText("2");

  await page.getByRole("button", { name: "Last 24h" }).click();
  await expect(page).toHaveURL(/range=24h/);
  await expect(
    page
      .locator('[data-widget-id="kpi-banner"] article')
      .filter({ hasText: "Monitored assets" })
      .locator("div.mt-3.text-2xl"),
  ).toHaveText("1");
});

test("reorders dashboard widgets with the layout controls", async ({ page }) => {
  const widgetMarkers = '[data-tour="kpis"], [data-tour="status-cards"]';
  const originalOrder = await page.locator(widgetMarkers).evaluateAll((widgets) =>
    widgets.map((widget) => widget.getAttribute("data-tour")),
  );

  await page.getByRole("button", { name: "Customize layout" }).click();
  const layoutDialog = page.getByRole("dialog", { name: "Customize dashboard layout" });
  await layoutDialog.getByRole("button", { name: "Move Status at a Glance up" }).click();
  await layoutDialog.getByRole("button", { name: "Done" }).click();

  const reordered = await page.locator(widgetMarkers).evaluateAll((widgets) =>
    widgets.map((widget) => widget.getAttribute("data-tour")),
  );
  expect(reordered).not.toEqual(originalOrder);
  expect(reordered).toEqual(["status-cards", "kpis"]);
});
