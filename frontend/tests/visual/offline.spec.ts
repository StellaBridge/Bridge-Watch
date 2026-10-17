import { test, expect } from "@playwright/test";

test.describe("PWA offline capabilities and offline indicator", () => {
  test("shows offline indicator banner and displays cached bridge data when offline", async ({
    page,
    context,
  }) => {
    // 1. Mock bridge API route for online state
    await page.route("**/api/v1/bridges", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          bridges: [
            {
              id: "bridge-eth",
              name: "Stellar-Ethereum Bridge",
              status: "healthy",
              totalValueLocked: 50000000,
              volume24h: 4000000,
            },
          ],
        }),
      });
    });

    // Navigate to Bridges page while online
    await page.goto("/bridges");
    await expect(page.locator("h1")).toHaveText("Bridges");
    await expect(page.getByText("Stellar-Ethereum Bridge")).toBeVisible();

    // Verify offline indicator is NOT visible while online
    await expect(page.locator('[data-testid="offline-indicator"]')).not.toBeVisible();

    // 2. Go offline
    await context.setOffline(true);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("offline"));
    });

    // Offline banner should now appear
    const offlineBanner = page.locator('[data-testid="offline-indicator"]');
    await expect(offlineBanner).toBeVisible();
    await expect(offlineBanner).toContainText(/offline/i);

    // 3. Return online
    await context.setOffline(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("online"));
    });

    // Offline banner should disappear and restored banner appear
    await expect(page.locator('[data-testid="offline-indicator"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="offline-indicator-restored"]')).toBeVisible();
  });
});
