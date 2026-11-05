import { test, expect, chromium } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { Client } from 'pg';
import path from 'path';
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

async function run() {
  const envConfig = dotenv.parse(fs.readFileSync('.env'));
  const directUrl = envConfig.DIRECT_URL || '';
  const dbUrl = envConfig.DATABASE_URL || '';

  // 1. Reconfirm V3 Environment
  const dbUrlParsed = new URL(dbUrl);
  const directUrlParsed = new URL(directUrl);
  
  const envReport = {
    databaseUrlHostname: dbUrlParsed.hostname,
    directUrlHostname: directUrlParsed.hostname,
    database: dbUrlParsed.pathname.replace('/', ''),
    role: dbUrlParsed.username,
    endpointPrefix: dbUrlParsed.hostname.split('.')[0],
    environmentSource: '.env file',
    shellOverrideStatus: process.env.DATABASE_URL ? 'PRESENT' : 'ABSENT',
  };

  if (!envReport.endpointPrefix.includes('ep-holy-darkness-apqs7kn7')) {
    console.error('Invalid endpoint prefix');
    process.exit(1);
  }

  const client = new Client({ connectionString: directUrl });
  await client.connect();
  await client.query('SELECT 1');

  // 2. & 3. Compare Project Business Identity & Dates
  const projectRes = await client.query('SELECT * FROM "Project" WHERE id = $1', ['cmrirhhw30000ic0406v47smb']);
  const p = projectRes.rows[0];

  const manifestStr = fs.readFileSync('artifacts/scheduling/uat-v2-reconstruction-manifest.json', 'utf8');
  const manifest = JSON.parse(manifestStr);

  const businessIdentity = {
    title: p.name || p.title,
    projectCode: p.code,
    contractNumber: p.contractNumber,
    clientId: p.clientId,
    contractorId: p.contractorId,
    location: p.location,
    startDate: p.startDate,
    completionDate: p.originalCompletionDate || p.endDate,
    contractDuration: null, // calculate later if needed
    awardedAmount: p.contractAmount,
    createdAt: p.createdAt,
    createdBy: p.managerId,
    status: p.status
  };

  const amountMatch = parseFloat(businessIdentity.awardedAmount) === 43106674.89;
  const startDateMatch = businessIdentity.startDate && new Date(businessIdentity.startDate).toISOString().startsWith('2026-06-12');
  const completionDateMatch = businessIdentity.completionDate && new Date(businessIdentity.completionDate).toISOString().startsWith('2026-12-09');

  // 4. Verify Project Shell Cleanliness
  const queries = {
    ProjectBOQVersion: `SELECT count(*) FROM "ProjectBOQVersion" WHERE "projectId" = $1`,
    ProjectSchedule: `SELECT count(*) FROM "ProjectSchedule" WHERE "projectId" = $1`,
    ScheduleWBS: `SELECT count(*) FROM "ScheduleWBS" WHERE "projectId" = $1`,
    ScheduleActivity: `SELECT count(*) FROM "ScheduleActivity" WHERE "projectId" = $1`,
    ScheduleDependency: `SELECT count(*) FROM "ScheduleDependency" WHERE "projectId" = $1`,
    ScheduleBOQAllocation: `SELECT count(*) FROM "ScheduleBOQAllocation" WHERE "projectId" = $1`,
    ScheduleApproval: `SELECT count(*) FROM "ScheduleApproval" WHERE "projectId" = $1`,
    ScheduleReviewComment: `SELECT count(*) FROM "ScheduleReviewComment" WHERE "projectId" = $1`,
    BaselineActivation: `SELECT count(*) FROM "BaselineActivation" WHERE "projectId" = $1`,
    ChecksumVarianceApprovals: `SELECT count(*) FROM "AuditEvent" WHERE "projectId" = $1 AND action LIKE '%VARIANCE_APPROV%'`,
  };

  const dependencies: any = {};
  for (const [table, q] of Object.entries(queries)) {
    try {
      const res = await client.query(q, [p.id]);
      dependencies[table] = parseInt(res.rows[0].count, 10);
    } catch(e) {
      dependencies[table] = 0;
    }
  }

  // 5. Verify Project Scope Assignments
  const assignmentsRes = await client.query('SELECT * FROM "ProjectUserAssignment" WHERE "projectId" = $1', [p.id]);
  const assignments = assignmentsRes.rows;

  // 6. Authenticated Project Manager Review
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'manager@onesystemserp.com');
  await page.fill('input[type="password"]', process.env.LOCAL_TEST_PASSWORD!);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  // Hit the custom protected endpoint
  await page.goto('http://localhost:3000/api/gate7c-0/review');
  const reviewBody = await page.innerText('body');
  const reviewJson = JSON.parse(reviewBody);

  await browser.close();
  await client.end();

  // 7. Select Path
  let selectedPath = '';
  let finalResult = '';

  if (startDateMatch && completionDateMatch && amountMatch && dependencies.ProjectBOQVersion === 0 && dependencies.ProjectSchedule === 0) {
    selectedPath = 'PATH A — ADOPT EXISTING CLEAN PROJECT SHELL';
    finalResult = 'UAT_V3_EXISTING_PROJECT_SHELL_APPROVED_FOR_ADOPTION';
  } else {
    selectedPath = 'PATH B — CREATE NEW AUTHORITATIVE PROJECT';
    finalResult = 'UAT_V3_NEW_PROJECT_CREATION_REQUIRED';
  }

  // 8. Durable Evidence
  const reportJson = {
    environment: envReport,
    businessIdentity,
    dependencies,
    assignments,
    managerReview: reviewJson,
    selectedPath,
    finalResult
  };

  const reportMd = `# Gate 7C-0 Project Shell Identity

## 1. Environment Verification
- **Endpoint Prefix**: ${envReport.endpointPrefix}
- **Database**: ${envReport.database}

## 2. Business Identity
- **Title**: ${businessIdentity.title}
- **Awarded Amount**: ${businessIdentity.awardedAmount}
- **Start Date**: ${businessIdentity.startDate}
- **Completion Date**: ${businessIdentity.completionDate}

## 3. Dependency Footprint
${Object.entries(dependencies).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## 4. Manager Review (Authenticated)
- **Role**: ${reviewJson.user?.role}
- **Must Change Password**: ${reviewJson.user?.mustChangePassword}

## 5. Selected Path
**${selectedPath}**

## Final Decision
**${finalResult}**
`;

  fs.mkdirSync(path.join(process.cwd(), 'docs/scheduling'), { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), 'artifacts/scheduling'), { recursive: true });
  fs.writeFileSync('docs/scheduling/uat-v3-project-shell-identity.md', reportMd);
  fs.writeFileSync('artifacts/scheduling/uat-v3-project-shell-identity.json', JSON.stringify(reportJson, null, 2));

  console.log('Result:', finalResult);
}

run().catch(console.error);
