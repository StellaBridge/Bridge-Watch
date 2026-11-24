import { Page, Locator } from "@playwright/test";

export class OperationalAuditPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateToAudit() {
    await this.page.goto("/operations/audit-logs", { waitUntil: "networkidle" });
  }

  async getAuditTable(): Promise<Locator> {
    return this.page.locator('[data-testid="audit-logs-table"]');
  }

  async getAuditRows(): Promise<Locator> {
    return this.page.locator('[data-testid="audit-log-row"]');
  }

  async getSearchInput(): Promise<Locator> {
    return this.page.locator('[data-testid="audit-search-input"]');
  }

  async searchAuditLogs(query: string): Promise<void> {
    const input = await this.getSearchInput();
    await input.fill(query);
    await input.press("Enter");
  }

  async getFilterByAction(): Promise<Locator> {
    return this.page.locator('[data-testid="filter-action-select"]');
  }

  async filterByAction(action: string): Promise<void> {
    const filter = await this.getFilterByAction();
    await filter.selectOption(action);
  }

  async getFilterByUser(): Promise<Locator> {
    return this.page.locator('[data-testid="filter-user-select"]');
  }

  async filterByUser(username: string): Promise<void> {
    const filter = await this.getFilterByUser();
    await filter.selectOption(username);
  }

  async getFilterByDateRange(): Promise<Locator> {
    return this.page.locator('[data-testid="filter-date-range"]');
  }

  async getStartDateInput(): Promise<Locator> {
    return this.page.locator('[data-testid="audit-start-date"]');
  }

  async getEndDateInput(): Promise<Locator> {
    return this.page.locator('[data-testid="audit-end-date"]');
  }

  async setDateRange(startDate: string, endDate: string): Promise<void> {
    await (await this.getStartDateInput()).fill(startDate);
    await (await this.getEndDateInput()).fill(endDate);
  }

  async getExportButton(): Promise<Locator> {
    return this.page.locator('[data-testid="export-audit-logs-button"]');
  }

  async exportLogs(format: "csv" | "json" | "pdf"): Promise<void> {
    const btn = await this.getExportButton();
    await btn.click();
    await this.page.locator(`[data-testid="export-format-${format}"]`).click();
  }

  async getLogDetails(rowIndex: number): Promise<Record<string, string>> {
    const rows = await this.getAuditRows();
    const row = rows.nth(rowIndex);

    const details: Record<string, string> = {};
    const action = await row.locator('[data-testid="log-action"]').textContent();
    const user = await row.locator('[data-testid="log-user"]').textContent();
    const timestamp = await row.locator('[data-testid="log-timestamp"]').textContent();
    const resource = await row.locator('[data-testid="log-resource"]').textContent();
    const result = await row.locator('[data-testid="log-result"]').textContent();

    if (action) details["action"] = action;
    if (user) details["user"] = user;
    if (timestamp) details["timestamp"] = timestamp;
    if (resource) details["resource"] = resource;
    if (result) details["result"] = result;

    return details;
  }

  async clickLogRow(rowIndex: number): Promise<void> {
    const rows = await this.getAuditRows();
    await rows.nth(rowIndex).click();
  }

  async getLogDetailPanel(): Promise<Locator> {
    return this.page.locator('[data-testid="audit-log-detail-panel"]');
  }

  async getDetailPanelData(): Promise<Record<string, string>> {
    const panel = await this.getLogDetailPanel();
    const data: Record<string, string> = {};

    const fields = await panel.locator('[data-testid="detail-field"]').all();
    for (const field of fields) {
      const key = await field.locator('[data-testid="field-key"]').textContent();
      const value = await field.locator('[data-testid="field-value"]').textContent();
      if (key && value) {
        data[key.trim()] = value.trim();
      }
    }

    return data;
  }

  async getClearFiltersButton(): Promise<Locator> {
    return this.page.locator('[data-testid="clear-filters-button"]');
  }

  async clearFilters(): Promise<void> {
    const btn = await this.getClearFiltersButton();
    await btn.click();
  }

  async getPaginationInfo(): Promise<string> {
    const info = await this.page.locator('[data-testid="pagination-info"]').textContent();
    return info as string;
  }

  async goToNextPage(): Promise<void> {
    await this.page.locator('[data-testid="next-page-button"]').click();
  }

  async goToPreviousPage(): Promise<void> {
    await this.page.locator('[data-testid="previous-page-button"]').click();
  }
}
