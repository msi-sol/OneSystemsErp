import { chromium } from 'playwright';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

const prisma = new PrismaClient();

async function run() {
  console.log('Starting credential rotation via authenticated Super Admin session...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Get CSRF token
  const csrfRes = await page.request.get('http://localhost:3000/api/auth/csrf');
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.csrfToken;

  // 2. Login via NextAuth API directly to ensure cookies are set
  const loginRes = await page.request.post('http://localhost:3000/api/auth/callback/credentials', {
    form: {
      csrfToken,
      email: 'j.burns2372@gmail.com',
      password: process.env.LOCAL_TEST_PASSWORD!,
      json: 'true'
    }
  });

  const url = loginRes.url();
  if (loginRes.status() !== 200 && loginRes.status() !== 303 && !url.includes('/')) {
    throw new Error('Failed to login via Auth.js API, status: ' + loginRes.status());
  }

  // Go to home to verify
  await page.goto('http://localhost:3000/');
  
  const targets = [
    'manager@onesystemserp.com',
    'director@onesystemserp.com',
    'engineer@onesystemserp.com'
  ];

  const newPasswords: Record<string, string> = {};

  for (const email of targets) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`User ${email} not found`);

    const newPassword = `Recon7D_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
    newPasswords[email] = newPassword;

    console.log(`Resetting password for ${email}...`);
    
    const responseBody = await page.evaluate(async (data) => {
      const res = await fetch('/api/gate7/reset-passwords', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return await res.json();
    }, { targetUserId: user.id, newPassword });

    console.log(`Password reset for ${email} succeeded via API:`, responseBody);
  }

  await browser.close();

  // Write to .env.uat-credentials
  let envContent = '';
  for (const [email, pwd] of Object.entries(newPasswords)) {
    const safeEmail = email.split('@')[0].toUpperCase();
    envContent += `UAT_${safeEmail}_PASSWORD=${pwd}\n`;
  }
  
  const envPath = path.join(process.cwd(), '.env.uat-credentials');
  fs.writeFileSync(envPath, envContent, 'utf-8');
  console.log(`Credentials saved to ${envPath}`);

  console.log('GATE7D_TEST_CREDENTIALS_ROTATED');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => {
  prisma.$disconnect();
});
