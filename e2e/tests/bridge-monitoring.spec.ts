/**
 * E2E: bridge monitoring flow (#1357)
 * Bridges list -> select a bridge -> health/reserve details -> back navigation.
 * Runs against the real frontend; only the API responses are mocked.
 */
import { test, expect, type Page } from "@playwright/test";

const BRIDGES = {
    bridges: [
        {
            name: "Circle",
            status: "healthy",
            totalValueLocked: 2_500_000_000,
            supplyOnStellar: 1_000_000,
            supplyOnSource: 1_001_200,
            mismatchPercentage: 0.12,
        },
        {
            name: "Allbridge",
            status: "degraded",
            totalValueLocked: 45_000_000,
            supplyOnStellar: 500_000,
            supplyOnSource: 509_000,
            mismatchPercentage: 1.8,
        },
    ],
};

const CIRCLE_STATS = {
    name: "Circle",
    volume24h: 50_000_000,
    volume7d: 300_000_000,
    volume30d: 1_000_000_000,
    totalTransactions: 15_000,
    averageTransferTime: 234.5,
    uptime30d: 99.5,
    evmLockDetails: [
        {
            chain: "ethereum",
            assetSymbol: "USDC",
            lockedAmount: "1250000.5",
            contractAddress: "0x1111111111111111111111111111111111111111",
            isPaused: false,
        },
    ],
};

async function mockApi(page: Page) {
    // Registered first, so the specific routes below take precedence.
    await page.route("**/api/v1/**", (route) =>
        route.fulfill({
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ error: "not mocked" }),
        }),
    );
    await page.route("**/api/v1/bridges", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(BRIDGES) }),
    );
    await page.route("**/api/v1/bridges/*/stats*", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CIRCLE_STATS) }),
    );
}

test.describe("Bridge monitoring flow", () => {
    test.beforeEach(async ({ page }) => {
        await mockApi(page);
        await page.goto("/bridges");
    });

    test("bridge list page loads with data", async ({ page }) => {
        await expect(page.getByRole("heading", { name: "Bridges", exact: true })).toBeVisible();
        await expect(page.getByRole("link", { name: "View details for bridge Circle" })).toBeVisible();
        await expect(page.getByRole("link", { name: "View details for bridge Allbridge" })).toBeVisible();
    });

    test("clicking a bridge selects it and shows its details", async ({ page }) => {
        await page.getByRole("link", { name: "View details for bridge Circle" }).click();

        await expect(page).toHaveURL(
            (url) => url.pathname === "/bridges" && url.searchParams.get("selected") === "Circle",
        );
        await expect(page.getByRole("heading", { name: "EVM Lock Details" })).toBeVisible();
    });

    test("bridge cards show health status and supply mismatch", async ({ page }) => {
        const healthy = page.getByRole("link", { name: "View details for bridge Circle" });
        const degraded = page.getByRole("link", { name: "View details for bridge Allbridge" });

        await expect(healthy).toContainText("0.120%");
        await expect(healthy).toContainText("$2.50B");
        await expect(degraded).toContainText("1.800%");
        await expect(degraded).toContainText("$45.00M");
    });

    test("reserve (EVM lock) section renders locked balances", async ({ page }) => {
        await page.getByRole("link", { name: "View details for bridge Circle" }).click();

        const table = page.getByRole("table", { name: "EVM lock contract balances by chain" });
        await expect(table).toBeVisible();
        await expect(table.getByRole("cell", { name: "Ethereum" })).toBeVisible();
        await expect(table.getByRole("cell", { name: "USDC" })).toBeVisible();
        await expect(table.getByRole("cell", { name: "Active" })).toBeVisible();
        await expect(table.getByRole("cell", { name: /1,250,000\.5000/ })).toBeVisible();
    });

    test("back navigation returns to the bridge list", async ({ page }) => {
        await page.getByRole("link", { name: "View details for bridge Circle" }).click();
        await expect(page.getByRole("heading", { name: "EVM Lock Details" })).toBeVisible();

        await page.goBack();

        await expect(page).toHaveURL(
            (url) => url.pathname === "/bridges" && !url.searchParams.has("selected"),
        );
        await expect(page.getByRole("heading", { name: "EVM Lock Details" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "View details for bridge Circle" })).toBeVisible();
    });
});