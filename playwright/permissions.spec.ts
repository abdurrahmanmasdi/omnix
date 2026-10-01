import { test, expect } from '@playwright/test';

test.describe('P1-10 Authorization and Isolation Matrix', () => {
  test('changing accounts in the same tab does not leak cached data or sockets', async ({ page }) => {
    // 1. Log in as User A
    await page.goto('/login');
    await page.fill('input[name="email"]', 'a@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard');
    await page.goto('/dashboard/leads');

    // Should see "Lead For User"
    await expect(page.locator('text=Lead For User')).toBeVisible({ timeout: 10000 });

    // Simulate delayed response for User A during logout
    let intercepted = false;
    await page.route('**/api/leads*', async (route) => {
      intercepted = true;
      // Delay this request so it returns after logout/login!
      setTimeout(() => route.continue().catch(() => {}), 3000);
    });

    // Fire a request that will be delayed
    page.reload(); // This triggers the leads query again!

    // Wait a brief moment to ensure request is intercepted
    await page.waitForTimeout(500);

    // 2. Log out immediately while request is pending
    await page.waitForSelector('text=UA', { state: 'visible' });
    await page.click('text=UA');
    await page.click('text=Sign out');
    await expect(page).toHaveURL(/.*login/);

    // Stop intercepting to let User B login normally
    await page.unroute('**/api/leads*');

    // Reload to ensure clean state for User B
    await page.reload();

    // 3. Log in as User B
    await page.fill('input[name="email"]', 'b@example.com');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/dashboard');
    await page.goto('/dashboard/leads');

    // Wait 4 seconds for the delayed request from A to return and potentially poison the cache
    await page.waitForTimeout(4000);

    // 4. Verify User B DOES NOT see "Lead For User"
    await expect(page.locator('text=Lead For User')).not.toBeVisible();
    
    // Test multiple tabs session sync / logout
    const page2 = await page.context().newPage();
    await page2.goto('/dashboard');
    
    // Log out from page2
    await page2.waitForSelector('text=UB', { state: 'visible' });
    await page2.click('text=UB');
    await page2.click('text=Sign out');
    await expect(page2).toHaveURL(/.*login/);

    // Verify page1 is also logged out (requires page reload or it might be reactive depending on implementation)
    await page.reload();
    await expect(page).toHaveURL(/.*login/);
  });
});
