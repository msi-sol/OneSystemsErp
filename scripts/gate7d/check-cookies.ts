import { chromium } from 'playwright';
if (!process.env.LOCAL_TEST_PASSWORD) throw new Error('Set LOCAL_TEST_PASSWORD to the password of the local test account.');

async function run() {
  const b = await chromium.launch({ headless: true });
  const context = await b.newContext();
  const p = await context.newPage();
  
  await p.goto('http://localhost:3000/login');
  await p.fill('input[type="email"]', 'J.BURNS2372@GMAIL.COM');
  await p.fill('input[type="password"]', process.env.LOCAL_TEST_PASSWORD!);
  await p.click('button[type="submit"]');
  await p.waitForTimeout(3000);
  
  const cookies = await context.cookies();
  console.log('Cookies after login:', cookies);
  
  await b.close();
}
run();
