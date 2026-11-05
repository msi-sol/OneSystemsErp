const { chromium } = require('playwright');
const fs = require('fs');
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  let networkLogs = [];
  let consoleLogs = [];
  let failedStatus = null;
  let failedResponse = null;

  page.on('response', async response => {
    if (response.request().method() === 'POST') {
       networkLogs.push(`${response.status()} POST ${response.url()}`);
    }
    if (response.url().includes('review/validate') && response.request().method() === 'POST') {
      failedStatus = response.status();
      try {
        failedResponse = await response.json();
      } catch(e) {}
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

  await page.waitForTimeout(3000); 

  const btns = await page.locator('button').all();
  let clicked = false;
  for (const btn of btns) {
     const text = await btn.textContent();
     if (text && text.includes('Validate')) {
        const isEnabled = await btn.isEnabled();
        if (isEnabled) {
           // use DOM click
           await btn.evaluate(node => node.click());
           clicked = true;
           networkLogs.push("CLICKED VALIDATE BUTTON VIA DOM");
        }
        break;
     }
  }
  
  if (clicked) {
    await page.waitForTimeout(2000);
    // check for confirm modal
    const afterBtns = await page.locator('button').all();
    for(const btn of afterBtns) {
       const text = await btn.textContent();
       if (text && (text.includes('Confirm') || text.includes('Submit') || text.includes('Proceed') || text.includes('Yes') || text.includes('Continue'))) {
          await btn.evaluate(node => node.click());
          networkLogs.push(`CLICKED MODAL BUTTON: ${text.trim()}`);
          break;
       }
    }
    
    await page.waitForTimeout(5000);
    
    fs.writeFileSync('scratch/diagnostics2.json', JSON.stringify({ 
      failedStatus, failedResponse, networkLogs, consoleLogs 
    }, null, 2));
  } else {
    console.log("Validate button not found");
  }

  await browser.close();
})().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
