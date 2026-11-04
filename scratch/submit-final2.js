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
    if (response.url().includes('review/validate') && response.request().method() === 'POST') {
      failedStatus = response.status();
      try {
        failedResponse = await response.json();
      } catch(e) {
        failedResponse = await response.text();
      }
    }
  });

  console.log("Navigating to scheduling page...");
  await page.goto('http://localhost:3000/projects/cmrirhhw30000ic0406v47smb/scheduling', { timeout: 60000, waitUntil: 'commit' });
  await page.waitForTimeout(3000);

  if (page.url().includes('/login')) {
    console.log("Logging in...");
    await page.fill('input[name="email"]', 'engineer@onesystemserp.com');
    await page.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(10000); 
  }

  if (!page.url().includes('/scheduling')) {
     console.log("Explicitly navigating back to scheduling...");
     await page.goto('http://localhost:3000/projects/cmrirhhw30000ic0406v47smb/scheduling', { timeout: 60000, waitUntil: 'commit' });
     await page.waitForTimeout(3000);
  }

  console.log("Waiting for Validate button to appear...");
  const validateBtn = page.locator('button', { hasText: 'Validate & Request Review' }).first();
  try {
    await validateBtn.waitFor({ state: 'visible', timeout: 30000 });
  } catch(e) {
    console.log("Validate button did not appear within 30s");
    process.exit(1);
  }

  const isEnabled = await validateBtn.isEnabled();
  if (!isEnabled) {
    console.log("Validate button is disabled!");
    process.exit(0);
  }

  console.log("Clicking Validate button...");
  await validateBtn.click();
  
  console.log("Waiting for potential Confirm modal...");
  const confirmBtn = page.locator('button', { hasText: /Confirm|Submit|Yes|Proceed|Continue/i }).filter({ hasNotText: 'Validate' }).first();
  try {
    await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log("Modal found! Clicking confirm...");
    await confirmBtn.click();
  } catch(e) {
    console.log("No modal found after clicking Validate. (Or timeout)");
  }

  console.log("Waiting up to 90 seconds for network requests to settle...");
  for(let i=0; i<90; i++) {
    await page.waitForTimeout(1000);
    if(failedStatus) break;
  }

  if (failedStatus) {
    console.log(`API called! Status: ${failedStatus}`);
    fs.writeFileSync('scratch/failedResponse.json', JSON.stringify({ status: failedStatus, response: failedResponse }, null, 2));
  } else {
    console.log("No API call to 'review/validate' was captured.");
  }

  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
