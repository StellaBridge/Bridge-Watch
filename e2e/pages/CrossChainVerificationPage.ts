import { type Locator, type Page, expect } from "@playwright/test";

export class CrossChainVerificationPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly refreshButton: Locator;
  readonly loadErrorMessage: Locator;
  readonly emptyStateMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Cross-Chain State Verification" });
    this.refreshButton = page.getByRole("button", { name: "Refresh all" });
    this.loadErrorMessage = page.getByText("Failed to load verification results.");
    this.emptyStateMessage = page.getByText("No active bridge operators found.");
  }

  async goto(): Promise<void> {
    await this.page.goto("/cross-chain-verification", { waitUntil: "networkidle" });
    await expect(this.heading).toBeVisible({ timeout: 15000 });
  }

  /** Expandable row for a bridge. The accessible name includes the bridge name. */
  bridgeRow(bridgeName: string): Locator {
    return this.page.getByRole("button", { name: new RegExp(bridgeName) });
  }

  async expandBridge(bridgeName: string): Promise<void> {
    const row = this.bridgeRow(bridgeName);
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
  }

  reVerifyButton(): Locator {
    return this.page.getByRole("button", { name: "Re-verify" });
  }
}
