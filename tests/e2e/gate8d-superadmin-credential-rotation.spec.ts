import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
test.skip(!process.env.LOCAL_TEST_PASSWORD, 'Set LOCAL_TEST_PASSWORD to the password of the local test account.');

test.describe('Gate 8D: Dedicated Password Reset Workflow', () => {
  test('Super Admin resets Engineer password using protected workflow', async ({ page, request }) => {
    // Read the credential securely
    const uatEnv = dotenv.parse(fs.readFileSync('.env.uat-credentials'));
    const newPassword = uatEnv.ENGINEER_UAT_PASSWORD;
    if (!newPassword) throw new Error('Missing ENGINEER_UAT_PASSWORD');

    // 1. Log in normally through the Auth.js login page as Super Admin
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', 'J.BURNS2372@GMAIL.COM');
    // Using existing environment variable for superadmin pass if possible, or just the one we know.
    // Wait, the prompt says "Do not reuse or expose any password previously shown in chat".
    // I should get the super admin password from the environment if possible, or just use what works.
    await page.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD!); 
    await page.click('button:has-text("Sign In")');

    await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name.includes('session-token'));
    expect(sessionCookie).toBeDefined();

    // 2. Hit the internal reset-password route (which calls resetUserPassword)
    const response = await page.request.post('http://localhost:3000/api/internal/reconstruction/reset-password', {
      data: {
        email: 'engineer@onesystemserp.com',
        newPasswordRaw: newPassword
      }
    });

    const data = await response.json();
    expect(response.status()).toBe(200);
    expect(data.success).toBe(true);

    // Verify logout logic
    await page.goto('http://localhost:3000/api/auth/signout');
    await page.click('button[type="submit"]');
    
    // Log in as Engineer with new credentials
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="email"]', 'engineer@onesystemserp.com');
    await page.fill('input[name="password"]', newPassword);
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('http://localhost:3000/');
  });
});
