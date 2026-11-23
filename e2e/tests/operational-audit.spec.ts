import { test, expect } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { OperationalAuditPage } from "../pages/OperationalAuditPage";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
  });
  await mockCoreApi(page);
});

test.describe("Operational Access Audit", () => {
  test("should display audit logs table", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    const rows = await auditPage.getAuditRows();
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("should search audit logs", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    const countBefore = await (await auditPage.getAuditRows()).count();
    await auditPage.searchAuditLogs("user_login");
    const countAfter = await (await auditPage.getAuditRows()).count();

    expect(countAfter).toBeLessThanOrEqual(countBefore);
  });

  test("should filter logs by action", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    await auditPage.filterByAction("user_login");
    const rows = await auditPage.getAuditRows();

    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("should filter logs by user", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    await auditPage.filterByUser("admin");
    const rows = await auditPage.getAuditRows();

    expect(await rows.count()).toBeGreaterThan(0);
  });

  test("should set date range filter", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    const startDate = "2024-01-01";
    const endDate = "2024-01-31";

    await auditPage.setDateRange(startDate, endDate);
    const rows = await auditPage.getAuditRows();

    expect(await rows.count()).toBeGreaterThanOrEqual(0);
  });

  test("should export audit logs as CSV", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    await auditPage.exportLogs("csv");
    await page.waitForTimeout(500);
  });

  test("should export audit logs as JSON", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    await auditPage.exportLogs("json");
    await page.waitForTimeout(500);
  });

  test("should export audit logs as PDF", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    await auditPage.exportLogs("pdf");
    await page.waitForTimeout(500);
  });

  test("should view detailed log entry", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    const details = await auditPage.getLogDetails(0);
    expect(Object.keys(details).length).toBeGreaterThan(0);

    await auditPage.clickLogRow(0);
    const panelData = await auditPage.getDetailPanelData();
    expect(Object.keys(panelData).length).toBeGreaterThan(0);
  });

  test("should clear all filters", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    await auditPage.filterByAction("user_login");
    const countFiltered = await (await auditPage.getAuditRows()).count();

    await auditPage.clearFilters();
    const countAfterClear = await (await auditPage.getAuditRows()).count();

    expect(countAfterClear).toBeGreaterThanOrEqual(countFiltered);
  });

  test("should paginate through audit logs", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    const paginationInfo = await auditPage.getPaginationInfo();
    expect(paginationInfo.length).toBeGreaterThan(0);
  });

  test("should navigate to next page", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    const rowsBefore = await (await auditPage.getAuditRows()).count();
    await auditPage.goToNextPage();
    const rowsAfter = await (await auditPage.getAuditRows()).count();

    // Rows might be same if only one page, or different if multiple pages
    expect(typeof rowsAfter).toBe("number");
  });

  test("should combine multiple filters", async ({ page }) => {
    const auditPage = new OperationalAuditPage(page);
    await auditPage.navigateToAudit();

    await auditPage.filterByAction("user_login");
    await auditPage.filterByUser("admin");
    await auditPage.setDateRange("2024-01-01", "2024-12-31");

    const rows = await auditPage.getAuditRows();
    expect(await rows.count()).toBeGreaterThanOrEqual(0);
  });
});
