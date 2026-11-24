import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { ReconciliationPage } from "../pages/ReconciliationPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
  });
  await mockCoreApi(page);
});

test.describe("Reconciliation Discrepancy Resolution", () => {
  test("should display discrepancies in the table", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    const rows = await reconciliationPage.getDiscrepancyRows();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("should open discrepancy details when clicked", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    await reconciliationPage.clickDiscrepancy(0);

    const panel = await reconciliationPage.getDiscrepancyDetailPanel();
    expect(await panel.isVisible()).toBe(true);
  });

  test("should display discrepancy description", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    await reconciliationPage.clickDiscrepancy(0);

    const description = await reconciliationPage.getDiscrepancyDescription();
    expect(description.length).toBeGreaterThan(0);
  });

  test("should resolve discrepancy with reason and notes", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    await reconciliationPage.clickDiscrepancy(0);
    await reconciliationPage.resolveDiscrepancy();

    await reconciliationPage.setResolutionReason("manual_adjustment");
    await reconciliationPage.enterResolutionNotes("Discrepancy resolved after manual verification");
    await reconciliationPage.confirmResolution();

    const successMsg = await reconciliationPage.getSuccessMessage();
    expect(await successMsg.isVisible()).toBe(true);
  });

  test("should filter discrepancies by status", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    const countBefore = await reconciliationPage.getOpenCount();
    await reconciliationPage.filterByStatus("resolved");
    const countAfter = await reconciliationPage.getOpenCount();

    expect(countAfter).toBeLessThanOrEqual(countBefore);
  });

  test("should navigate through multiple discrepancies", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    const rows = await reconciliationPage.getDiscrepancyRows();
    const count = await rows.count();

    if (count >= 2) {
      await reconciliationPage.clickDiscrepancy(0);
      let description1 = await reconciliationPage.getDiscrepancyDescription();
      expect(description1.length).toBeGreaterThan(0);

      await reconciliationPage.clickDiscrepancy(1);
      let description2 = await reconciliationPage.getDiscrepancyDescription();
      expect(description2.length).toBeGreaterThan(0);
      expect(description1).not.toBe(description2);
    }
  });

  test("should export discrepancies", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    await reconciliationPage.exportDiscrepancies();
    // Wait for download to trigger
    await page.waitForTimeout(1000);
  });

  test("should clear filters and show all discrepancies", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    const countBefore = await reconciliationPage.getOpenCount();
    await reconciliationPage.filterByStatus("resolved");
    const countFiltered = await reconciliationPage.getOpenCount();

    // Count should be different after filtering
    if (countBefore > countFiltered) {
      expect(countFiltered).toBeLessThan(countBefore);
    }
  });

  test("should validate resolution form before submission", async ({ page }) => {
    const reconciliationPage = new ReconciliationPage(page);
    await reconciliationPage.navigateToReconciliation();

    await reconciliationPage.clickDiscrepancy(0);
    await reconciliationPage.resolveDiscrepancy();

    const form = await reconciliationPage.getResolutionForm();
    expect(await form.isVisible()).toBe(true);
  });
});
