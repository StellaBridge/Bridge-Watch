/**
 * E2E Authentication Flow Tests (#1356)
 * 
 * Tests the complete authentication lifecycle:
 * - Login with valid/invalid credentials
 * - Session persistence across navigation
 * - Session timeout behavior
 * - Logout clears session
 */

import { test, expect, Page } from '@playwright/test';

// Test configuration - use baseURL from playwright config
const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:4173';
const TEST_USER = {
  email: 'test@example.com',
  password: 'SecurePassword123!',
};
const INVALID_USER = {
  email: 'invalid@example.com',
  password: 'WrongPassword',
};

test.describe('Authentication Flow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to login page before each test
    await page.goto(`${BASE_URL}/login`);
  });
  
  test('should login successfully with valid credentials', async ({ page }) => {
    // Fill login form
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for navigation to dashboard
    await page.waitForURL(`${BASE_URL}/dashboard`);
    
    // Verify successful login
    expect(page.url()).toContain('/dashboard');
    
    // Verify user menu or profile indicator is visible
    const userMenu = page.locator('[data-testid="user-menu"]');
    await expect(userMenu).toBeVisible();
  });
  
  test('should show error message for invalid credentials', async ({ page }) => {
    // Fill login form with invalid credentials
    await page.fill('input[name="email"]', INVALID_USER.email);
    await page.fill('input[name="password"]', INVALID_USER.password);
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Wait for error message
    const errorMessage = page.locator('[data-testid="login-error"]');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(/invalid.*credentials|incorrect.*password/i);
    
    // Verify still on login page
    expect(page.url()).toContain('/login');
  });
  
  test('should persist session across page navigation', async ({ page }) => {
    // Login
    await login(page, TEST_USER.email, TEST_USER.password);
    
    // Navigate to different pages
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    
    await page.goto(`${BASE_URL}/transactions`);
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    
    await page.goto(`${BASE_URL}/settings`);
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    
    // Verify no redirect to login page
    expect(page.url()).not.toContain('/login');
  });
  
  test('should persist session across page reload', async ({ page }) => {
    // Login
    await login(page, TEST_USER.email, TEST_USER.password);
    
    // Reload page
    await page.reload();
    
    // Verify session persists
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    expect(page.url()).toContain('/dashboard');
  });
  
  test('should handle session timeout and redirect to login', async ({ page }) => {
    // Login
    await login(page, TEST_USER.email, TEST_USER.password);
    
    // Simulate session timeout by clearing cookies
    // In real scenario, this would be time-based
    await page.context().clearCookies();
    
    // Try to access protected page
    await page.goto(`${BASE_URL}/dashboard`);
    
    // Should redirect to login
    await page.waitForURL(`${BASE_URL}/login`);
    expect(page.url()).toContain('/login');
    
    // Should show session expired message
    const sessionMessage = page.locator('[data-testid="session-expired"]');
    await expect(sessionMessage).toBeVisible();
  });
  
  test('should logout and clear session', async ({ page }) => {
    // Login
    await login(page, TEST_USER.email, TEST_USER.password);
    
    // Click logout button
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    
    // Should redirect to login page
    await page.waitForURL(`${BASE_URL}/login`);
    expect(page.url()).toContain('/login');
    
    // Verify session is cleared by trying to access protected page
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForURL(`${BASE_URL}/login`);
    expect(page.url()).toContain('/login');
  });
  
  test('should not allow access to protected routes without authentication', async ({ page }) => {
    // Try to access dashboard without login
    await page.goto(`${BASE_URL}/dashboard`);
    
    // Should redirect to login
    await page.waitForURL(`${BASE_URL}/login`);
    expect(page.url()).toContain('/login');
  });
  
  test('should remember me option persists session longer', async ({ page }) => {
    // Login with "Remember Me" checked
    await page.fill('input[name="email"]', TEST_USER.email);
    await page.fill('input[name="password"]', TEST_USER.password);
    await page.check('input[name="rememberMe"]');
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForURL(`${BASE_URL}/dashboard`);
    
    // Verify "Remember Me" cookie has longer expiration
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'sessionId');
    
    expect(sessionCookie).toBeDefined();
    // Session cookie should have expiration date (not session-only)
    expect(sessionCookie?.expires).toBeGreaterThan(Date.now() / 1000);
  });
  
  test('should prevent multiple simultaneous login attempts (rate limiting)', async ({ page }) => {
    // Attempt multiple rapid logins with invalid credentials
    for (let i = 0; i < 6; i++) {
      await page.fill('input[name="email"]', INVALID_USER.email);
      await page.fill('input[name="password"]', `attempt-${i}`);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(100);
    }
    
    // Should show rate limit error
    const rateLimitError = page.locator('[data-testid="rate-limit-error"]');
    await expect(rateLimitError).toBeVisible();
    await expect(rateLimitError).toContainText(/too many.*attempts|rate.*limit/i);
  });
  
});

// Helper function to login
async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/dashboard`);
}
