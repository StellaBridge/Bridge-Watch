import { type Locator, type Page, expect } from "@playwright/test";

export class AlertConfigPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly adminTokenInput: Locator;
  readonly ownerFilterInput: Locator;
  readonly addRuleButton: Locator;
  readonly ruleNameInput: Locator;
  readonly ownerAddressInput: Locator;
  readonly severityCheckboxes: Locator;
  readonly channelCheckboxes: Locator;
  readonly assetCodesInput: Locator;
  readonly sourceTypesInput: Locator;
  readonly suppressionWindowInput: Locator;
  readonly priorityOrderInput: Locator;
  readonly isActiveCheckbox: Locator;
  readonly saveRuleButton: Locator;
  readonly cancelButton: Locator;
  readonly ruleRows: Locator;
  readonly auditEntries: Locator;
  readonly errorMessage: Locator;
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Alert Routing Admin", level: 1 });
    this.adminTokenInput = page.getByLabel("Admin API Key");
    this.ownerFilterInput = page.getByLabel("Filter by owner address");
    this.addRuleButton = page.getByRole("button", { name: "Add Rule" });
    this.ruleNameInput = page.getByLabel("Rule name");
    this.ownerAddressInput = page.getByLabel("Owner address");
    this.severityCheckboxes = page.getByLabel("Severity levels");
    this.channelCheckboxes = page.getByLabel("Channels");
    this.assetCodesInput = page.getByLabel("Asset codes (comma-separated)");
    this.sourceTypesInput = page.getByLabel("Source types (comma-separated)");
    this.suppressionWindowInput = page.getByLabel("Suppression window (seconds)");
    this.priorityOrderInput = page.getByLabel("Priority order");
    this.isActiveCheckbox = page.getByLabel("Active");
    this.saveRuleButton = page.getByRole("button", { name: "Save Rule" });
    this.cancelButton = page.getByRole("button", { name: "Cancel" });
    this.ruleRows = page.getByRole("row", { name: /alert rule/i });
    this.auditEntries = page.getByRole("row", { name: /audit entry/i });
    this.errorMessage = page.getByRole("alert");
    this.loadingIndicator = page.getByRole("status");
  }

  async goto(): Promise<void> {
    await this.page.goto("/admin/alert-routing", { waitUntil: "networkidle" });
    await expect(this.heading).toBeVisible({ timeout: 15000 });
  }

  async setAdminToken(token: string): Promise<void> {
    await this.adminTokenInput.fill(token);
    // The form should auto-submit or we can press Enter
    await this.adminTokenInput.press("Enter");
    await expect(this.loadingIndicator).toBeHidden({ timeout: 10000 });
  }

  async filterByOwner(ownerAddress: string): Promise<void> {
    await this.ownerFilterInput.fill(ownerAddress);
    await this.ownerFilterInput.press("Enter");
    await expect(this.loadingIndicator).toBeHidden({ timeout: 10000 });
  }

  async clickAddRule(): Promise<void> {
    await this.addRuleButton.click();
    // Wait for modal/form to appear
    await expect(this.ruleNameInput).toBeVisible({ timeout: 5000 });
  }

  async fillRuleForm(rule: {
    name: string;
    ownerAddress: string;
    severities?: string[];
    channels?: string[];
    assetCodes?: string;
    sourceTypes?: string;
    suppressionWindow?: number;
    priorityOrder?: number;
    isActive?: boolean;
  }): Promise<void> {
    await this.ruleNameInput.fill(rule.name);
    await this.ownerAddressInput.fill(rule.ownerAddress);

    if (rule.severities) {
      for (const severity of rule.severities) {
        await this.page.getByLabel(`Severity: ${severity}`).check();
      }
    }

    if (rule.channels) {
      for (const channel of rule.channels) {
        await this.page.getByLabel(`Channel: ${channel}`).check();
      }
    }

    if (rule.assetCodes) {
      await this.assetCodesInput.fill(rule.assetCodes);
    }

    if (rule.sourceTypes) {
      await this.sourceTypesInput.fill(rule.sourceTypes);
    }

    if (rule.suppressionWindow !== undefined) {
      await this.suppressionWindowInput.fill(String(rule.suppressionWindow));
    }

    if (rule.priorityOrder !== undefined) {
      await this.priorityOrderInput.fill(String(rule.priorityOrder));
    }

    if (rule.isActive !== undefined) {
      if (rule.isActive) {
        await this.isActiveCheckbox.check();
      } else {
        await this.isActiveCheckbox.uncheck();
      }
    }
  }

  async saveRule(): Promise<void> {
    await this.saveRuleButton.click();
    await expect(this.loadingIndicator).toBeHidden({ timeout: 10000 });
  }

  async cancelRule(): Promise<void> {
    await this.cancelButton.click();
  }

  async assertRuleVisible(name: string): Promise<void> {
    await expect(this.page.getByRole("row", { name })).toBeVisible();
  }

  async assertRuleHidden(name: string): Promise<void> {
    await expect(this.page.getByRole("row", { name })).toBeHidden();
  }

  async editRule(name: string): Promise<void> {
    await this.page.getByRole("row", { name }).getByRole("button", { name: "Edit" }).click();
    await expect(this.ruleNameInput).toBeVisible({ timeout: 5000 });
  }

  async deleteRule(name: string): Promise<void> {
    await this.page.getByRole("row", { name }).getByRole("button", { name: "Delete" }).click();
    // Confirm deletion if there's a confirmation dialog
    const confirmButton = this.page.getByRole("button", { name: /confirm|yes|delete/i });
    if (await confirmButton.isVisible({ timeout: 2000 })) {
      await confirmButton.click();
    }
    await expect(this.loadingIndicator).toBeHidden({ timeout: 10000 });
  }

  async enableRule(name: string): Promise<void> {
    await this.page.getByRole("row", { name }).getByRole("button", { name: "Enable" }).click();
    await expect(this.loadingIndicator).toBeHidden({ timeout: 10000 });
  }

  async disableRule(name: string): Promise<void> {
    await this.page.getByRole("row", { name }).getByRole("button", { name: "Disable" }).click();
    await expect(this.loadingIndicator).toBeHidden({ timeout: 10000 });
  }

  async simulateAlert(ruleName: string): Promise<void> {
    await this.page.getByRole("row", { name: ruleName }).getByRole("button", { name: "Simulate" }).click();
    // Wait for simulation to complete
    await expect(this.loadingIndicator).toBeHidden({ timeout: 15000 });
  }

  async assertAuditEntryVisible(description: string): Promise<void> {
    await expect(this.page.getByRole("row", { name: description })).toBeVisible();
  }
}