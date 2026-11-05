const { chromium } = require('playwright');
const fs = require('fs');
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let networkLogs = [];
  let consoleLogs = [];

  page.on('response', response => {
    if (response.request().method() === 'POST') {
       networkLogs.push(`${response.status()} POST ${response.url()}`);
    }
  });

  page.on('console', msg => {
    consoleLogs.push(msg.text());
  });

  await page.goto('http://localhost:3000/projects/cmrirhhw30000ic0406v47smb/scheduling', { waitUntil: 'networkidle' });

  if (page.url().includes('/login')) {
    await page.fill('input[name="email"]', 'engineer@onesystemserp.com');
    await page.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle' });
  }

  // Ensure we are on the right page
  if (!page.url().includes('/scheduling')) {
     await page.goto('http://localhost:3000/projects/cmrirhhw30000ic0406v47smb/scheduling', { waitUntil: 'networkidle' });
  }

  await page.waitForTimeout(3000); 

  const btns = await page.locator('button').all();
  let clicked = false;
  for (const btn of btns) {
     const text = await btn.textContent();
     if (text && text.includes('Validate')) {
        const isEnabled = await btn.isEnabled();
        if (isEnabled) {
           await btn.click({ force: true });
           clicked = true;
           networkLogs.push("CLICKED VALIDATE BUTTON");
        } else {
           networkLogs.push("VALIDATE BUTTON IS DISABLED");
        }
        break;
     }
  }
  
  if (clicked) {
    await page.waitForTimeout(2000);
    const html = await page.content();
    fs.writeFileSync('scratch/after_click_dom.html', html);
    
    // Dump all network and console logs
    fs.writeFileSync('scratch/diagnostics.json', JSON.stringify({ networkLogs, consoleLogs }, null, 2));
  } else {
    console.log("Validate button not found");
  }

  await browser.close();
})().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
