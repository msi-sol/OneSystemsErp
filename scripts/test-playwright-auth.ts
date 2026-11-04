import { chromium } from '@playwright/test';
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

async function testAuth() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to login...');
  await page.goto('http://localhost:3000/login');
  
  // Wait for React to hydrate
  await page.waitForTimeout(2000);

  console.log('Filling form...');
  await page.fill('input[name="email"]', 'admin@onesystemserp.com');
  await page.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD!);
  
  console.log('Clicking Sign In...');
  await page.click('button:has-text("Sign In")');

  console.log('Waiting for dashboard...');
  await page.waitForURL('**/', { timeout: 10000 });

  console.log('Fetching from page context...');
  const result = await page.evaluate(async () => {
    const res = await fetch('/api/auth/session');
    return res.json();
  });

  console.log('Session context:', result);
  
  await browser.close();
}

testAuth().catch(console.error);
