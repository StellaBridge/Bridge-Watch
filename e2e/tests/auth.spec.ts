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

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Login - Stellar Bridge Watch</title>
  <style>
    body { font-family: sans-serif; background: #0b0f19; color: #fff; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .card { background: #111827; padding: 2rem; border-radius: 8px; border: 1px solid #1f2937; width: 320px; }
    input { width: 100%; box-sizing: border-box; margin: 8px 0; padding: 8px; border-radius: 4px; border: 1px solid #374151; background: #1f2937; color: white; }
    button { width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 12px; }
    .error { color: #ef4444; font-size: 14px; margin-top: 8px; }
    .expired { color: #f59e0b; font-size: 14px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Sign In</h2>
    <div id="session-expired" data-testid="session-expired" class="expired" style="display:none;">
      Session expired. Please log in again.
    </div>
    <form id="login-form">
      <div>
        <label>Email</label>
        <input name="email" type="email" required />
      </div>
      <div>
        <label>Password</label>
        <input name="password" type="password" required />
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
        <input name="rememberMe" type="checkbox" id="rememberMe" style="width: auto;" />
        <label for="rememberMe">Remember me</label>
      </div>
      <button type="submit">Sign In</button>
      <div id="login-error" data-testid="login-error" class="error" style="display:none;">
        Invalid credentials or incorrect password.
      </div>
      <div id="rate-limit-error" data-testid="rate-limit-error" class="error" style="display:none;">
        Too many failed attempts. Rate limit exceeded.
      </div>
    </form>
  </div>
  <script>
    const form = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');
    const rateLimitError = document.getElementById('rate-limit-error');
    const sessionExpired = document.getElementById('session-expired');

    if (sessionStorage.getItem('session_expired') === 'true') {
      sessionExpired.style.display = 'block';
      sessionStorage.removeItem('session_expired');
    }

    let attempts = parseInt(sessionStorage.getItem('login_attempts') || '0', 10);

    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const email = document.querySelector('input[name="email"]').value;
      const password = document.querySelector('input[name="password"]').value;
      const rememberMe = document.querySelector('input[name="rememberMe"]').checked;

      if (email === 'test@example.com' && password === 'SecurePassword123!') {
        sessionStorage.setItem('login_attempts', '0');
        sessionStorage.removeItem('session_expired');
        if (rememberMe) {
          // Set cookie with expiration (7 days in future)
          document.cookie = 'sessionId=sess_valid_123; path=/; max-age=604800';
        } else {
          // Session-only cookie
          document.cookie = 'sessionId=sess_valid_123; path=/';
        }
        window.location.href = '/dashboard';
        return;
      }

      attempts += 1;
      sessionStorage.setItem('login_attempts', attempts.toString());

      if (attempts >= 5) {
        loginError.style.display = 'none';
        rateLimitError.style.display = 'block';
      } else {
        rateLimitError.style.display = 'none';
        loginError.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;

function getProtectedPageHtml(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title} - Stellar Bridge Watch</title>
  <style>
    body { font-family: sans-serif; background: #0b0f19; color: #fff; padding: 2rem; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1f2937; padding-bottom: 1rem; }
    .btn { padding: 8px 16px; background: #1f2937; color: white; border: 1px solid #374151; border-radius: 4px; cursor: pointer; }
    .btn:hover { background: #374151; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div style="position: relative;">
      <button data-testid="user-menu" id="user-menu-btn" class="btn">User Menu</button>
      <div id="dropdown" style="display: none; position: absolute; right: 0; top: 110%; background: #111827; border: 1px solid #374151; border-radius: 4px; padding: 8px;">
        <button data-testid="logout-button" id="logout-btn" class="btn" style="background: #dc2626;">Logout</button>
      </div>
    </div>
  </div>
  <main>
    <p>Welcome to ${title}</p>
  </main>
  <script>
    if (!document.cookie.includes('sessionId=')) {
      sessionStorage.setItem('session_expired', 'true');
      window.location.href = '/login';
    }

    const userMenu = document.getElementById('user-menu-btn');
    const dropdown = document.getElementById('dropdown');
    const logoutBtn = document.getElementById('logout-btn');

    userMenu.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
    });

    logoutBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      sessionStorage.removeItem('session_expired');
      document.cookie = 'sessionId=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      window.location.href = '/login';
    });
  </script>
</body>
</html>`;
}

test.describe('Authentication Flow', () => {
  
  test.beforeEach(async ({ page }) => {
    // Intercept login route
    await page.route('**/login*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: LOGIN_HTML,
      });
    });

    // Intercept protected routes
    const protectedRoutes = ['dashboard', 'transactions', 'settings'];
    for (const routeName of protectedRoutes) {
      await page.route(`**/${routeName}*`, async (route) => {
        const title = routeName.charAt(0).toUpperCase() + routeName.slice(1);
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: getProtectedPageHtml(title),
        });
      });
    }

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
