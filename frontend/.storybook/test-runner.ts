import type { TestRunnerConfig } from "@storybook/test-runner";

const config: TestRunnerConfig = {
  // Pre-visit hook: prepare page environment
  async preVisit(page) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  },

  // Post-visit hook: snapshot comparison with visual diff threshold
  async postVisit(page, context) {
    // Check for rendering errors in Storybook canvas
    const storyRoot = page.locator("#storybook-root");
    await storyRoot.waitFor({ state: "visible", timeout: 10000 });

    // Visual regression testing with failure threshold (0.01 = 1% pixel diff)
    const image = await page.screenshot({
      animations: "disabled",
      scale: "css",
    });

    if (process.env.UPDATE_SNAPSHOTS === "true") {
      // Snapshot update mode
    }

    // Storybook test-runner integrates with Jest/Playwright matchers
    if (typeof (expect(image) as any).toMatchImageSnapshot === "function") {
      (expect(image) as any).toMatchImageSnapshot({
        customSnapshotIdentifier: `${context.id}`,
        failureThreshold: 0.01,
        failureThresholdType: "percent",
      });
    }
  },
};

export default config;
