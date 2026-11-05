import { test, expect } from '@playwright/test';
test.skip(!process.env.LOCAL_TEST_PASSWORD, 'Set LOCAL_TEST_PASSWORD to the password of the local test account.');

test.describe('Gate 8D Authenticated Dry Run', () => {
  // Use engineer@onesystemserp.com / $LOCAL_TEST_PASSWORD
  
  test('Authenticate and Execute Dry Run', async ({ request, page }) => {
    test.setTimeout(120000);
    // 1. Login via UI to establish session cookies
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'engineer@onesystemserp.com');
    await page.fill('input[type="password"]', process.env.LOCAL_TEST_PASSWORD!);
    await page.click('button:has-text("Sign In")');

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'gate8d-login-debug.png' });
    console.log("Current URL:", page.url());

    // Now make the internal API call using the browser's fetch to ensure cookies/CSRF are attached
    const body = await page.evaluate(async () => {
      const res = await fetch('/api/internal/reconstruction/gate8d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: 'cmrirhhw30000ic0406v47smb',
          idempotencyKey: 'DRY_RUN_IDEMPOTENCY_KEY_' + Date.now()
        })
      });
      const data = await res.json();
      return { status: res.status, data };
    });

    console.log('Dry Run Response:', body.data);

    // It should succeed!
    expect(body.status).toBe(200);
    expect(body.data.status).toBe('SUCCESS');
    expect(body.data.scheduleId).toBeDefined();
  });
});
