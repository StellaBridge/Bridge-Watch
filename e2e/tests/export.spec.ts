import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { DashboardPage } from "../pages/DashboardPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
  });
  await mockCoreApi(page);
  await page.route("**/api/v1/exports", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        export: {
          id: "export-1",
          requested_by: "test-user",
          format: "csv",
          data_type: "analytics",
          filters: {},
          status: "completed",
          download_url: "/downloads/export-1.csv",
          download_url_expires_at: null,
          error_message: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      }),
    });
  });
});

test("requesting a CSV export surfaces a direct download link", async ({ page }) => {
  const dashboardPage = new DashboardPage(page);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await dashboardPage.assertLoaded();
  await dashboardPage.openExportDialog();

  await page.getByRole("button", { name: /Start export/ }).click();

  const downloadLink = page.getByRole("link", { name: "Direct download" });
  await expect(downloadLink).toBeVisible();
  await expect(downloadLink).toHaveAttribute("href", "/downloads/export-1.csv");
});
