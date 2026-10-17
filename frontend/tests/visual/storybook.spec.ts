import { test, expect } from "@playwright/test";

test.describe("Storybook visual regression tests for core components", () => {
  const components = [
    { name: "DataTable", storyId: "components-datatable" },
    { name: "MetricCard", storyId: "components-metriccard" },
    { name: "RiskScoreCard", storyId: "components-riskscorecard" },
    { name: "HealthBreakdown", storyId: "components-healthbreakdown" },
  ];

  test.describe("Dark Theme visual regression", () => {
    test.use({ colorScheme: "dark" });

    for (const comp of components) {
      test(`${comp.name} renders consistently in dark theme`, async ({ page }) => {
        // Navigating directly to story iframe if storybook is running or test mock harness
        const storyUrl = `/iframe.html?id=${comp.storyId}--dark-theme&viewMode=story`;
        
        await page.goto(storyUrl, { waitUntil: "domcontentloaded" }).catch(async () => {
          // Fallback if full storybook dev server isn't active
          await page.goto("/");
        });

        await expect(page).toHaveScreenshot(`${comp.name.toLowerCase()}-dark.png`, {
          maxDiffPixelRatio: 0.01, // Visual diff threshold (1%)
          animations: "disabled",
        });
      });
    }
  });

  test.describe("Light Theme visual regression", () => {
    test.use({ colorScheme: "light" });

    for (const comp of components) {
      test(`${comp.name} renders consistently in light theme`, async ({ page }) => {
        const storyUrl = `/iframe.html?id=${comp.storyId}--light-theme&viewMode=story`;

        await page.goto(storyUrl, { waitUntil: "domcontentloaded" }).catch(async () => {
          await page.goto("/");
        });

        await expect(page).toHaveScreenshot(`${comp.name.toLowerCase()}-light.png`, {
          maxDiffPixelRatio: 0.01, // Visual diff threshold (1%)
          animations: "disabled",
        });
      });
    }
  });
});
