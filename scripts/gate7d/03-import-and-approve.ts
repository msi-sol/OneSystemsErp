import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

async function executeAction(page: any, email: string, password: string, actionName: string, payload: any) {
  // Login via API
  const csrfRes = await page.request.get('http://localhost:3000/api/auth/csrf');
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;

  const loginRes = await page.request.post('http://localhost:3000/api/auth/callback/credentials', {
    form: {
      csrfToken,
      email,
      password,
      json: 'true'
    }
  });

  const url = loginRes.url();
  if (loginRes.status() !== 200 && loginRes.status() !== 303 && !url.includes('/')) {
    throw new Error(`Failed to login ${email} via Auth.js API, status: ` + loginRes.status());
  }

  // Go to root to set cookies in the page context properly if needed
  await page.goto('http://localhost:3000/');
  
  // Execute action via evaluate
  console.log(`[${email}] Executing ${actionName}...`);
  const responseBody = await page.evaluate(async (data) => {
    const res = await fetch('/api/gate7/workflow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return await res.json();
  }, { action: actionName, payload });

  console.log(`[${email}] ${actionName} Result:`, responseBody.success ? 'Success' : responseBody);
  
  // Clear cookies for next user
  await page.context().clearCookies();
}

async function run() {
  const envPath = path.join(process.cwd(), '.env.uat-credentials');
  const envData = fs.readFileSync(envPath, 'utf8');
  
  const passwords: Record<string, string> = {};
  for (const line of envData.split('\n')) {
    if (line.includes('UAT_MANAGER_PASSWORD=')) passwords['manager@onesystemserp.com'] = line.split('=')[1].trim();
    if (line.includes('UAT_DIRECTOR_PASSWORD=')) passwords['director@onesystemserp.com'] = line.split('=')[1].trim();
    if (line.includes('UAT_ENGINEER_PASSWORD=')) passwords['engineer@onesystemserp.com'] = line.split('=')[1].trim();
  }

  const projectId = 'cmrirhhw30000ic0406v47smb';
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Manager: Import BOQ
  await executeAction(page, 'manager@onesystemserp.com', passwords['manager@onesystemserp.com'], 'importBOQ', { projectId });

  // 2. Manager: Technical Review
  await executeAction(page, 'manager@onesystemserp.com', passwords['manager@onesystemserp.com'], 'approveVarianceTechnical', { projectId });

  // 3. Director: Final Approval
  await executeAction(page, 'director@onesystemserp.com', passwords['director@onesystemserp.com'], 'approveVarianceFinal', { projectId });

  // 4. Super Admin: Lock BOQ
  await executeAction(page, 'j.burns2372@gmail.com', process.env.LOCAL_TEST_PASSWORD!, 'lockBOQ', { projectId });

  await browser.close();
  console.log('GATE7D_RECONSTRUCTION_WORKFLOW_COMPLETE');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
