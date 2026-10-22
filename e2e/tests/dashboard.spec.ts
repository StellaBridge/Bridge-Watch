import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { DashboardPage } from "../pages/DashboardPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
  });
  await mockCoreApi(page);
});

test("hiding a widget from the layout customizer removes it from the grid", async ({ page }) => {
  const dashboardPage = new DashboardPage(page);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await dashboardPage.assertLoaded();

  const kpiWidget = page.locator('[data-widget-id="kpi-banner"]');
  await expect(kpiWidget).toBeVisible();

  await page.getByRole("button", { name: "Customize layout" }).click();
  const customizer = page.getByRole("dialog", { name: "Customize dashboard layout" });
  await customizer.getByRole("checkbox", { name: "Toggle visibility of KPI Metrics" }).uncheck();
  await customizer.getByRole("button", { name: "Close layout customizer" }).click();

  await expect(kpiWidget).toHaveCount(0);
});
