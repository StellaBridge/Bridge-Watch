import { Page, Locator } from "@playwright/test";

export class DataProvenanceGraphPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateToProvenance() {
    await this.page.goto("/analytics/data-provenance", { waitUntil: "networkidle" });
  }

  async getGraphContainer(): Promise<Locator> {
    return this.page.locator('[data-testid="provenance-graph-container"]');
  }

  async getGraphNodes(): Promise<Locator> {
    return this.page.locator('[data-testid="provenance-node"]');
  }

  async getNodeByLabel(label: string): Promise<Locator> {
    return this.page.locator(`[data-testid="provenance-node"][data-label="${label}"]`);
  }

  async clickNode(label: string): Promise<void> {
    const node = await this.getNodeByLabel(label);
    await node.click();
  }

  async getNodeInspector(): Promise<Locator> {
    return this.page.locator('[data-testid="node-inspector-panel"]');
  }

  async getNodeInspectorTitle(): Promise<string> {
    const inspector = await this.getNodeInspector();
    return inspector.locator('[data-testid="node-title"]').textContent() as Promise<string>;
  }

  async getNodeInspectorDetails(): Promise<Record<string, string>> {
    const inspector = await this.getNodeInspector();
    const details: Record<string, string> = {};

    const rows = await inspector.locator('[data-testid="detail-row"]').all();
    for (const row of rows) {
      const key = await row.locator('[data-testid="detail-key"]').textContent();
      const value = await row.locator('[data-testid="detail-value"]').textContent();
      if (key && value) {
        details[key.trim()] = value.trim();
      }
    }

    return details;
  }

  async expandNodeDetails(label: string): Promise<void> {
    const node = await this.getNodeByLabel(label);
    const expandButton = node.locator('[data-testid="node-expand-button"]');
    await expandButton.click();
  }

  async isNodeExpanded(label: string): Promise<boolean> {
    const node = await this.getNodeByLabel(label);
    const expandedAttr = await node.getAttribute("data-expanded");
    return expandedAttr === "true";
  }

  async getEdgeConnections(): Promise<Locator> {
    return this.page.locator('[data-testid="provenance-edge"]');
  }

  async hoverOverNode(label: string): Promise<void> {
    const node = await this.getNodeByLabel(label);
    await node.hover();
  }

  async getTooltipContent(): Promise<string> {
    const tooltip = this.page.locator('[data-testid="node-tooltip"]');
    return tooltip.textContent() as Promise<string>;
  }

  async zoomIn(): Promise<void> {
    await this.page.locator('[data-testid="zoom-in-button"]').click();
  }

  async zoomOut(): Promise<void> {
    await this.page.locator('[data-testid="zoom-out-button"]').click();
  }

  async resetZoom(): Promise<void> {
    await this.page.locator('[data-testid="zoom-reset-button"]').click();
  }

  async isGraphLoaded(): Promise<boolean> {
    const container = await this.getGraphContainer();
    const nodes = await this.getGraphNodes();
    return (await container.isVisible()) && (await nodes.count()) > 0;
  }
}
