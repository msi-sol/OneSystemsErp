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
        const json = await response.json();
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

  // Ensure we are on the right page
  if (!page.url().includes('/scheduling')) {
     await page.goto('http://localhost:3000/projects/cmrirhhw30000ic0406v47smb/scheduling', { waitUntil: 'networkidle' });
  }

  await page.waitForTimeout(3000); // WAIT FOR REACT TO RENDER

  const btns = await page.locator('button').all();
  let clicked = false;
  for (const btn of btns) {
     const text = await btn.textContent();
     if (text && text.includes('Validate')) {
        const isEnabled = await btn.isEnabled();
        if (isEnabled) {
           await btn.click();
           clicked = true;
        } else {
           console.log("Validate button is disabled");
           clicked = false;
        }
        break;
     }
  }
  
  if (clicked) {
    await page.waitForTimeout(2000);
    
    const afterBtns = await page.locator('button').all();
    for(const btn of afterBtns) {
       const text = await btn.textContent();
       if (text && (text.includes('Confirm') || text.includes('Submit') || text.includes('Proceed') || text.includes('Yes') || text.includes('Continue'))) {
          await btn.click();
          console.log(`Clicked modal button: ${text.trim()}`);
          break;
       }
    }

    await page.waitForTimeout(5000);
    
    if (failedStatus) {
       fs.writeFileSync('scratch/failedResponse.json', JSON.stringify({ status: failedStatus, response: failedResponse }));
       console.log("Recorded status: ", failedStatus);
    } else {
       console.log("No validation API failure recorded.");
    }
  } else {
    console.log("Validate button not found or disabled");
  }

  await browser.close();
})().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
