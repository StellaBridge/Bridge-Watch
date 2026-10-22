import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { DashboardPage } from "../pages/DashboardPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem("bridge-watch:dashboard-tour:v1", JSON.stringify({ completed: true, lastStep: 0, seen: true }));
  });
  await mockCoreApi(page);
  await page.route("**/api/v1/search**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        success: true,
        data: {
          results: [
            {
              id: "bridge-allbridge",
              type: "bridge",
              title: "Allbridge",
              description: "Bridge",
              relevanceScore: 1,
              highlights: [],
              metadata: {},
            },
          ],
          total: 1,
        },
      }),
    });
  });
});

test("opens with Ctrl+K, selecting a result navigates to it", async ({ page }) => {
  const dashboardPage = new DashboardPage(page);
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await dashboardPage.dismissOnboardingIfPresent();

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Global search" });
  await expect(dialog).toBeVisible();

  await dialog.getByPlaceholder(/Search assets, bridges/).fill("Allbridge");
  await dialog.getByRole("option", { name: /Allbridge/ }).click();

  await expect(page).toHaveURL(/\/bridges(?:\?|$)/);
});
