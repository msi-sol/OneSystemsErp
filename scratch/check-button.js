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

  await page.goto('http://localhost:3000/projects/cmrirhhw30000ic0406v47smb/scheduling', { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('scratch/page_dump.html', html);
  
  // also extract all button texts
  const btns = await page.locator('button').all();
  console.log(`Found ${btns.length} buttons.`);
  for(let i=0; i<btns.length; i++) {
     const text = await btns[i].textContent();
     console.log(`Button ${i}: ${text.trim()}`);
  }

  await browser.close();
})();
