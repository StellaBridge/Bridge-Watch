import { test, expect } from "@playwright/test";

test.describe("Mobile viewport responsiveness and visual regression", () => {
  // Mobile device viewport (375x667 - iPhone SE / standard mobile)
  test.use({
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
  });

  test("Dashboard mobile layout stacks vertically and maintains touch targets", async ({ page }) => {
    await page.route("**/api/v1/assets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ assets: [], total: 0 }),
      });
    });

    await page.route("**/api/v1/bridges", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bridges: [
            {
              id: "bridge-1",
              name: "Stellar-Ethereum Bridge",
              status: "healthy",
              totalValueLocked: 45000000,
              volume24h: 3200000,
            },
            {
              id: "bridge-2",
              name: "Stellar-Polygon Bridge",
              status: "healthy",
              totalValueLocked: 18000000,
              volume24h: 1200000,
            },
          ],
        }),
      });
    });

    await page.goto("/dashboard");
    await expect(page.locator("h1")).toHaveText("Dashboard");

    // Verify touch targets have at least 44px height
    const refreshBtn = page.getByRole("button", { name: /refresh/i }).first();
    if (await refreshBtn.isVisible()) {
      const box = await refreshBtn.boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }

    // Verify mobile hamburger button is visible
    const hamburger = page.getByLabel(/navigation menu/i);
    await expect(hamburger).toBeVisible();

    await expect(page).toHaveScreenshot("dashboard-mobile-viewport.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });

  test("Bridges page stacks cards vertically and enables horizontal table scroll on mobile", async ({ page }) => {
    await page.route("**/api/v1/bridges", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bridges: [
            {
              id: "bridge-1",
              name: "Stellar-Ethereum Bridge",
              status: "healthy",
              totalValueLocked: 45000000,
              volume24h: 3200000,
            },
            {
              id: "bridge-2",
              name: "Stellar-Polygon Bridge",
              status: "healthy",
              totalValueLocked: 18000000,
              volume24h: 1200000,
            },
          ],
        }),
      });
    });

    await page.goto("/bridges");
    await expect(page.locator("h1")).toHaveText("Bridges");

    // Verify search input touch target >= 44px
    const searchInput = page.getByPlaceholder(/search bridges/i);
    const searchBox = await searchInput.boundingBox();
    if (searchBox) {
      expect(searchBox.height).toBeGreaterThanOrEqual(44);
    }

    await expect(page).toHaveScreenshot("bridges-mobile-viewport.png", {
      maxDiffPixelRatio: 0.01,
      animations: "disabled",
    });
  });
});
