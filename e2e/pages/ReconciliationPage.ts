import { Page, Locator } from "@playwright/test";

export class ReconciliationPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateToReconciliation() {
    await this.page.goto("/operations/reconciliation", { waitUntil: "networkidle" });
  }

  async getDiscrepancyTable(): Promise<Locator> {
    return this.page.locator('[data-testid="discrepancy-table"]');
  }

  async getDiscrepancyRows(): Promise<Locator> {
    return this.page.locator('[data-testid="discrepancy-row"]');
  }

  async getDiscrepancyRowByIndex(index: number): Promise<Locator> {
    return this.page.locator(`[data-testid="discrepancy-row"]:nth-child(${index + 1})`);
  }

  async clickDiscrepancy(index: number): Promise<void> {
    const row = await this.getDiscrepancyRowByIndex(index);
    await row.click();
  }

  async getDiscrepancyDetailPanel(): Promise<Locator> {
    return this.page.locator('[data-testid="discrepancy-details-panel"]');
  }

  async getDiscrepancyDescription(): Promise<string> {
    const panel = await this.getDiscrepancyDetailPanel();
    return (await panel.locator('[data-testid="discrepancy-description"]').textContent()) as string;
  }

  async getResolveButton(): Promise<Locator> {
    const panel = await this.getDiscrepancyDetailPanel();
    return panel.locator('[data-testid="resolve-discrepancy-button"]');
  }

  async resolveDiscrepancy(): Promise<void> {
    const btn = await this.getResolveButton();
    await btn.click();
  }

  async getResolutionForm(): Promise<Locator> {
    return this.page.locator('[data-testid="resolution-form"]');
  }

  async getResolutionReasonSelect(): Promise<Locator> {
    const form = await this.getResolutionForm();
    return form.locator('[data-testid="resolution-reason-select"]');
  }

  async setResolutionReason(reason: string): Promise<void> {
    const select = await this.getResolutionReasonSelect();
    await select.selectOption(reason);
  }

  async getResolutionNotesField(): Promise<Locator> {
    const form = await this.getResolutionForm();
    return form.locator('[data-testid="resolution-notes"]');
  }

  async enterResolutionNotes(notes: string): Promise<void> {
    const field = await this.getResolutionNotesField();
    await field.fill(notes);
  }

  async getConfirmResolutionButton(): Promise<Locator> {
    const form = await this.getResolutionForm();
    return form.locator('[data-testid="confirm-resolution-button"]');
  }

  async confirmResolution(): Promise<void> {
    const btn = await this.getConfirmResolutionButton();
    await btn.click();
  }

  async getSuccessMessage(): Promise<Locator> {
    return this.page.locator('[data-testid="resolution-success-message"]');
  }

  async getFilterDropdown(): Promise<Locator> {
    return this.page.locator('[data-testid="discrepancy-filter"]');
  }

  async filterByStatus(status: "open" | "resolved" | "pending"): Promise<void> {
    const filter = await this.getFilterDropdown();
    await filter.selectOption(status);
  }

  async getOpenCount(): Promise<number> {
    const rows = await this.getDiscrepancyRows();
    return (await rows.count()) ?? 0;
  }

  async getExportButton(): Promise<Locator> {
    return this.page.locator('[data-testid="export-discrepancies-button"]');
  }

  async exportDiscrepancies(): Promise<void> {
    const btn = await this.getExportButton();
    await btn.click();
  }
}
