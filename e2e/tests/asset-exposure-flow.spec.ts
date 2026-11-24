import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
  });
  await mockCoreApi(page);
  
  await page.route("**/api/v1/analytics/exposure", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: {
          ecosystem: "Stellar",
          assets: [
            { symbol: "USDC", exposure: 45000000, concentration: 0.35, custody_providers: 3 },
            { symbol: "XLM", exposure: 28000000, concentration: 0.22, custody_providers: 5 },
            { symbol: "BTC", exposure: 18000000, concentration: 0.14, custody_providers: 2 }
          ],
          total_exposure: 128000000,
          last_updated: new Date().toISOString()
        }
      })
    });
  });

  await page.route("**/api/v1/analytics/exposure/export", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 
        "content-type": "text/csv",
        "content-disposition": "attachment; filename=exposure-data.csv"
      },
      body: "Asset,Exposure,Concentration,Custody Providers\nUSDC,45000000,0.35,3\nXLM,28000000,0.22,5"
    });
  });
});

test("navigating to exposure analytics page loads successfully", async ({ page }) => {
  await page.goto("/analytics/exposure", { waitUntil: "networkidle" });
  
  await expect(page.locator("h1")).toContainText("Asset Exposure");
  await expect(page.locator('[data-testid="exposure-chart"]')).toBeVisible();
});

test("selecting Stellar ecosystem filter updates chart data", async ({ page }) => {
  await page.goto("/analytics/exposure", { waitUntil: "networkidle" });
  
  const ecosystemFilter = page.locator('[data-testid="ecosystem-filter"]');
  await ecosystemFilter.click();
  await page.getByRole("option", { name: "Stellar" }).click();
  
  await page.waitForResponse(response => 
    response.url().includes("/api/v1/analytics/exposure") && response.status() === 200
  );
  
  await expect(page.locator('[data-testid="exposure-chart"]')).toBeVisible();
  await expect(page.locator("text=USDC")).toBeVisible();
  await expect(page.locator("text=XLM")).toBeVisible();
});

test("clicking asset slice in chart highlights corresponding table row", async ({ page }) => {
  await page.goto("/analytics/exposure", { waitUntil: "networkidle" });
  
  const ecosystemFilter = page.locator('[data-testid="ecosystem-filter"]');
  await ecosystemFilter.click();
  await page.getByRole("option", { name: "Stellar" }).click();
  
  await page.waitForResponse(response => 
    response.url().includes("/api/v1/analytics/exposure") && response.status() === 200
  );
  
  const chartSlice = page.locator('[data-asset="USDC"]').first();
  await chartSlice.click();
  
  const highlightedRow = page.locator('[data-testid="asset-row-USDC"]');
  await expect(highlightedRow).toHaveClass(/highlighted|selected/);
});

test("downloading CSV export triggers file download", async ({ page }) => {
  await page.goto("/analytics/exposure", { waitUntil: "networkidle" });
  
  const downloadPromise = page.waitForEvent("download");
  
  await page.getByRole("button", { name: /Export|Download/ }).click();
  
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/exposure.*\.csv$/);
});
