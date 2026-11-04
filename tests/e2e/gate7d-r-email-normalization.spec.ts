import { test, expect } from '@playwright/test';
test.skip(!process.env.LOCAL_TEST_PASSWORD, 'Set LOCAL_TEST_PASSWORD to the password of the local test account.');

test.describe('Gate 7D-R Email Normalization', () => {
  const emails = [
    'J.BURNS2372@GMAIL.COM',
    'j.burns2372@gmail.com',
    'J.Burns2372@gmail.com'
  ];

  for (const email of emails) {
    test(`Should resolve and login successfully for case variant: ${email}`, async ({ page }) => {
      await page.goto('http://localhost:3000/login');
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', process.env.LOCAL_TEST_PASSWORD!);
      await page.click('button:has-text("Sign In")');

      await page.waitForURL('http://localhost:3000/', { timeout: 10000 });

      // Super Admin redirects to /
      const url = page.url();
      expect(url).not.toContain('error=');
      expect(url).toBe('http://localhost:3000/');
    });
  }
});
