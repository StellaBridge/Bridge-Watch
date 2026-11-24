import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
  });
  await mockCoreApi(page);
  
  await page.route("**/api/v1/health/timeline**", async (route) => {
    const url = new URL(route.request().url());
    const timeframe = url.searchParams.get("timeframe") || "30d";
    
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        timeframe,
        data: [
          {
            bridge_id: "stellar-ethereum-bridge",
            bridge_name: "Stellar-Ethereum Bridge",
            timeline: [
              { timestamp: "2026-11-01T00:00:00Z", status: "healthy", uptime: 100 },
              { timestamp: "2026-11-05T14:30:00Z", status: "degraded", uptime: 92, incident: "High latency detected" },
              { timestamp: "2026-11-10T00:00:00Z", status: "healthy", uptime: 100 }
            ]
          },
          {
            bridge_id: "polygon-arbitrum-bridge",
            bridge_name: "Polygon-Arbitrum Bridge",
            timeline: [
              { timestamp: "2026-11-01T00:00:00Z", status: "healthy", uptime: 100 },
              { timestamp: "2026-11-15T08:00:00Z", status: "degraded", uptime: 85, incident: "Oracle sync issues" }
            ]
          }
        ]
      })
    });
  });

  await page.route("**/api/v1/bridges/*", async (route) => {
    const bridgeId = route.request().url().match(/bridges\/([^\/\?]+)/)?.[1];
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bridge: {
          id: bridgeId,
          name: bridgeId?.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
          status: "operational",
          total_value_locked: 125000000
        }
      })
    });
  });
});

test("navigating to health timeline page loads successfully", async ({ page }) => {
  await page.goto("/health-timeline", { waitUntil: "networkidle" });
  
  await expect(page.locator("h1")).toContainText(/Health Timeline|Bridge Health/);
  await expect(page.locator('[data-testid="timeline-chart"]')).toBeVisible();
});

test("clicking 7D timeframe button updates chart data", async ({ page }) => {
  await page.goto("/health-timeline", { waitUntil: "networkidle" });
  
  const button7d = page.getByRole("button", { name: "7D" });
  await button7d.click();
  
  const response = await page.waitForResponse(response => 
    response.url().includes("/health/timeline") && 
    response.url().includes("timeframe=7d") &&
    response.status() === 200
  );
  
  expect(response.ok()).toBeTruthy();
  await expect(page.locator('[data-testid="timeline-chart"]')).toBeVisible();
});

test("clicking 30D timeframe button updates chart data", async ({ page }) => {
  await page.goto("/health-timeline", { waitUntil: "networkidle" });
  
  const button30d = page.getByRole("button", { name: "30D" });
  await button30d.click();
  
  const response = await page.waitForResponse(response => 
    response.url().includes("/health/timeline") && 
    response.url().includes("timeframe=30d") &&
    response.status() === 200
  );
  
  expect(response.ok()).toBeTruthy();
});

test("clicking 90D timeframe button updates chart data", async ({ page }) => {
  await page.goto("/health-timeline", { waitUntil: "networkidle" });
  
  const button90d = page.getByRole("button", { name: "90D" });
  await button90d.click();
  
  const response = await page.waitForResponse(response => 
    response.url().includes("/health/timeline") && 
    response.url().includes("timeframe=90d") &&
    response.status() === 200
  );
  
  expect(response.ok()).toBeTruthy();
  await expect(page.locator('[data-testid="timeline-chart"]')).toBeVisible();
});

test("hovering over incident marker displays tooltip", async ({ page }) => {
  await page.goto("/health-timeline", { waitUntil: "networkidle" });
  
  await page.waitForResponse(response => 
    response.url().includes("/health/timeline") && response.status() === 200
  );
  
  const incidentMarker = page.locator('[data-incident-type="degraded"]').first();
  await incidentMarker.hover();
  
  const tooltip = page.locator('[role="tooltip"], [data-testid="incident-tooltip"]');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(/High latency|Oracle sync|degraded/i);
});

test("clicking degraded bridge heatbar navigates to bridge detail view", async ({ page }) => {
  await page.goto("/health-timeline", { waitUntil: "networkidle" });
  
  await page.waitForResponse(response => 
    response.url().includes("/health/timeline") && response.status() === 200
  );
  
  const degradedBar = page.locator('[data-bridge-id="stellar-ethereum-bridge"][data-status="degraded"]').first();
  await degradedBar.click();
  
  await page.waitForURL(/\/bridges\/stellar-ethereum-bridge/);
  
  expect(page.url()).toContain("/bridges/stellar-ethereum-bridge");
  await expect(page.locator("h1")).toContainText(/Stellar.*Ethereum/);
});
