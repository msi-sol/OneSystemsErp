const { chromium } = require('playwright');
const fs = require('fs');
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let failedStatus = null;
  let failedResponse = null;

  page.on('response', async response => {
    if (response.url().includes('/api/projects/cmrirhhw30000ic0406v47smb/scheduling/641f4c56e72847e6a5e3288d0/review/validate') && response.request().method() === 'POST') {
      console.log("Validation API Response status:", response.status());
      failedStatus = response.status();
      try {
        const json = await response.json();
        console.log("Validation API Response body:", JSON.stringify(json));
        failedResponse = json;
      } catch(e) {}
    }
  });

  await page.goto('http://localhost:3000/projects/cmrirhhw30000ic0406v47smb/scheduling', { waitUntil: 'networkidle' });

  if (page.url().includes('/login')) {
    await page.fill('input[name="email"]', 'engineer@onesystemserp.com');
    await page.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' });
  }

  const validateBtn = page.locator('button', { hasText: /Validate & Request Review/i }).first();
  if (await validateBtn.isVisible()) {
    await validateBtn.click();
    await page.waitForTimeout(5000);
  }

  await browser.close();
  console.log("Done.");
})().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
