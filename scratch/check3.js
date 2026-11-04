const { chromium } = require('playwright');
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3000/projects/cmrirhhw30000ic0406v47smb/scheduling', { waitUntil: 'networkidle' });

  if (page.url().includes('/login')) {
    await page.fill('input[name="email"]', 'engineer@onesystemserp.com');
    await page.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' });
  }

  await page.waitForTimeout(3000); 

  const btns = await page.locator('button').all();
  let found = false;
  for (const btn of btns) {
     const text = await btn.textContent();
     if (text && text.includes('Validate')) {
        found = true;
        console.log("Found Validate Button!");
        await btn.click({ force: true });
        break;
     }
  }

  if (!found) {
     console.log("Validate button not found!");
     console.log("Current URL:", page.url());
     const allTexts = [];
     for(const b of btns) { allTexts.push(await b.textContent()); }
     console.log("Available buttons:", allTexts.map(t => t?.trim()));
  }

  await browser.close();
})().catch(err => {
  console.error(err);
  process.exit(1);
});
