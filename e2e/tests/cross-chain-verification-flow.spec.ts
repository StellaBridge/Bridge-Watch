import { test, expect, type Page } from "@playwright/test";
import { mockCoreApi } from "../utils/mockApi";
import { CrossChainVerificationPage } from "../pages/CrossChainVerificationPage";

const verifiedResult = {
  bridgeId: "allbridge-usdc",
  bridgeName: "Allbridge",
  sourceChain: "ethereum",
  verifiedAt: "2026-06-26T12:00:00.000Z",
  ethereum: { formattedAmount: "1000", blockNumber: 12345, isPaused: false },
  stellar: { assetCode: "USDC", supply: "1000000", issuer: "GISSUER" },
  merkleProofValid: true,
  proofDepth: 3,
  proofLeafHash: "0xleafhash",
  leafCount: 8,
  latestCommitmentSequence: 42,
  stateConsistent: true,
  mismatchPct: 0.01,
  mismatchThreshold: 0.5,
  status: "verified",
  cacheHit: false,
  freshnessSeconds: 0,
};

const mismatchResult = {
  ...verifiedResult,
  bridgeId: "wormhole-xlm",
  bridgeName: "Wormhole",
  merkleProofValid: false,
  stateConsistent: false,
  mismatchPct: 2.5,
  status: "mismatch",
};

function summaryFor(results: typeof verifiedResult[]) {
  return {
    count: results.length,
    verified: results.filter((r) => r.status === "verified").length,
    mismatches: results.filter((r) => r.status === "mismatch").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  };
}

/**
 * Stubs the cross-chain verification API. Returns the list of bridge IDs that
 * received a POST to the re-verify endpoint, so tests can assert on it.
 */
async function mockVerification(page: Page, results: typeof verifiedResult[], options: { status?: number } = {}) {
  const reVerified: string[] = [];
  await page.route("**/api/v1/cross-chain-verification**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === "POST") {
      const match = url.pathname.match(/\/cross-chain-verification\/([^/]+)\/verify$/);
      const bridgeId = decodeURIComponent(match?.[1] ?? "");
      reVerified.push(bridgeId);
      const result = results.find((r) => r.bridgeId === bridgeId) ?? results[0];
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result),
      });
      return;
    }

    await route.fulfill({
      status: options.status ?? 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(options.status ? { error: "unavailable" } : summaryFor(results)),
    });
  });
  return reVerified;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bridge-watch:onboarding:v1", "true");
    window.localStorage.setItem(
      "bridge-watch:dashboard-tour:v1",
      JSON.stringify({ completed: true, lastStep: 0, seen: true })
    );
  });
  await mockCoreApi(page);
});

test("lists bridges with their verification status and summary", async ({ page }) => {
  await mockVerification(page, [verifiedResult, mismatchResult]);
  const verificationPage = new CrossChainVerificationPage(page);

  await verificationPage.goto();

  await expect(verificationPage.bridgeRow("Allbridge")).toBeVisible();
  await expect(verificationPage.bridgeRow("Allbridge")).toContainText("Verified");
  await expect(verificationPage.bridgeRow("Wormhole")).toContainText("Mismatch");
  await expect(verificationPage.refreshButton).toBeVisible();
});

test("expanding a verified bridge shows the Merkle proof badge and reserve commitment", async ({ page }) => {
  await mockVerification(page, [verifiedResult]);
  const verificationPage = new CrossChainVerificationPage(page);
  await verificationPage.goto();

  await verificationPage.expandBridge("Allbridge");

  await expect(page.getByText("Stellar State", { exact: true })).toBeVisible();
  await expect(page.getByText("Reserve Commitment", { exact: true })).toBeVisible();
  await expect(page.getByText("Valid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("0xleafhash")).toBeVisible();
});

test("a failed Merkle proof is shown as Invalid with the challenged commitment state", async ({ page }) => {
  await mockVerification(page, [mismatchResult]);
  const verificationPage = new CrossChainVerificationPage(page);
  await verificationPage.goto();

  await verificationPage.expandBridge("Wormhole");

  await expect(page.getByText("Invalid", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Challenged", { exact: true })).toBeVisible();
});

test("re-verify posts to the bridge's verify endpoint", async ({ page }) => {
  const reVerified = await mockVerification(page, [verifiedResult]);
  const verificationPage = new CrossChainVerificationPage(page);
  await verificationPage.goto();
  await verificationPage.expandBridge("Allbridge");

  await verificationPage.reVerifyButton().click();

  await expect.poll(() => reVerified).toEqual(["allbridge-usdc"]);
});

test("shows the load error when the verification API fails", async ({ page }) => {
  await mockVerification(page, [], { status: 500 });
  const verificationPage = new CrossChainVerificationPage(page);

  await verificationPage.goto();

  await expect(verificationPage.loadErrorMessage).toBeVisible();
});

test("shows the empty state when no bridge operators are configured", async ({ page }) => {
  await mockVerification(page, []);
  const verificationPage = new CrossChainVerificationPage(page);

  await verificationPage.goto();

  await expect(verificationPage.emptyStateMessage).toBeVisible();
});

// Not covered: the issue asks for a transaction-hash search box with
// "Transaction Not Found" and source-lock / attestation / destination-release
// badges, and a /verification?hash= deep link. None of these exist in
// CrossChainVerification.tsx or in App.tsx routes, so they are not tested here.
