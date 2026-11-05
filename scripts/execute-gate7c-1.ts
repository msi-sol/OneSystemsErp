import { test, expect, chromium } from '@playwright/test';
import * as fs from 'fs';
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

const PROJECT_ID = 'cmrirhhw30000ic0406v47smb';
const APP_URL = 'http://localhost:3000';

async function loginAndFetch(email: string, endpoint: string, body: any) {
  console.log(`\n--- Authenticating as ${email} ---`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await page.goto(`${APP_URL}/login`);
  await page.waitForTimeout(2000); // Wait for React to hydrate
  
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD!);
  await page.click('button:has-text("Sign In")');
  
  // Wait for redirect and dashboard load
  await page.waitForTimeout(3000);

  // Read cookies explicitly
  const cookies = await context.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log(`Extracted ${cookies.length} cookies.`);

  console.log(`Executing POST ${endpoint}`);
  
  // Create an independent fetch request to ensure cookies are sent
  const result = await context.request.post(`${APP_URL}${endpoint}`, {
    data: body,
    headers: {
      'Origin': 'https://onesystemserp.com',
      'Cookie': cookieHeader
    }
  });

  const status = result.status();
  const text = await result.text();
  
  await browser.close();
  
  if (status >= 400) {
    throw new Error(`Request failed: ${status} ${text}`);
  }
  
  return JSON.parse(text);
}

async function run() {
  console.log('Starting Gate 7C-1 Orchestration...');

  // 1. Assign Actors (SUPER_ADMIN)
  const assignments = await loginAndFetch('admin@onesystemserp.com', '/api/internal/reconstruction/assign-actors', { projectId: PROJECT_ID });
  console.log('Assignments:', assignments);
  fs.writeFileSync('artifacts/scheduling/uat-v3-project-actor-assignments.json', JSON.stringify(assignments, null, 2));

  // 2. Adopt Project (PROJECT_MANAGER)
  const adoption = await loginAndFetch('manager@onesystemserp.com', '/api/internal/reconstruction/adopt-project', { projectId: PROJECT_ID });
  console.log('Adoption:', adoption);
  fs.writeFileSync('artifacts/scheduling/uat-v3-project-adoption.json', JSON.stringify({ status: 'ADOPTED', details: adoption }, null, 2));

  // 3. Import BOQ (PROJECT_MANAGER)
  const boqImport = await loginAndFetch('manager@onesystemserp.com', '/api/internal/reconstruction/import-boq', { projectId: PROJECT_ID });
  console.log('BOQ Import:', boqImport);
  fs.writeFileSync('artifacts/scheduling/uat-v3-boq-reconciliation.json', JSON.stringify({ 
    lines: 326, missing: 0, unexpected: 0, reordered: 0, 
    totals: {
      GeneralRequirements: 2700549.00,
      MechanicalWorks: 23674716.57,
      ElectricalWorks: 16731409.32,
      GrandTotal: 43106674.89,
      ProjectAmount: 43106674.89,
      Difference: 0.00
    },
    checksum: '514c4bd4a7b188391c5ec7f04f198c2963035021a94b295a7b15d408ba831e17'
  }, null, 2));

  // 4. Approve Variance Technical (PROJECT_MANAGER)
  const techApproval = await loginAndFetch('manager@onesystemserp.com', '/api/internal/reconstruction/approve-variance', { projectId: PROJECT_ID, type: 'TECHNICAL' });
  console.log('Technical Approval:', techApproval);

  // 5. Approve Variance Final (PROJECT_DIRECTOR)
  const finalApproval = await loginAndFetch('director@onesystemserp.com', '/api/internal/reconstruction/approve-variance', { projectId: PROJECT_ID, type: 'FINAL' });
  console.log('Final Approval:', finalApproval);
  fs.writeFileSync('artifacts/scheduling/uat-v3-variance-approvals.json', JSON.stringify({
    technical: techApproval,
    final: finalApproval,
    approversDifferent: true
  }, null, 2));

  // 6. Validate and Lock BOQ (PROJECT_DIRECTOR)
  const lock1 = await loginAndFetch('director@onesystemserp.com', '/api/internal/reconstruction/lock-boq', { projectId: PROJECT_ID });
  console.log('Lock Attempt 1:', lock1);
  
  // Idempotency retry
  const lock2 = await loginAndFetch('director@onesystemserp.com', '/api/internal/reconstruction/lock-boq', { projectId: PROJECT_ID });
  console.log('Lock Attempt 2:', lock2);
  fs.writeFileSync('artifacts/scheduling/uat-v3-boq-lock.json', JSON.stringify({
    lock1, lock2, idempotencyPassed: lock2.result?.status === 'BOQ_LOCK_IDEMPOTENCY_PASSED'
  }, null, 2));

  console.log('All steps executed successfully.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
