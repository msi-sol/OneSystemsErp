import { test, expect } from '@playwright/test';
test.skip(!process.env.LOCAL_TEST_PASSWORD, 'Set LOCAL_TEST_PASSWORD to the password of the local test account.');

test.describe('Assign Financial Reviewer', () => {
    test.setTimeout(120000);
    test('Super Admin assigns finance@onesystemserp.com to project', async ({ browser }) => {
        const adminContext = await browser.newContext();
        const adminPage = await adminContext.newPage();
        
        await adminPage.goto('http://localhost:3000/login');
        await adminPage.fill('input[name="email"]', 'admin01@demo.com');
        await adminPage.fill('input[name="password"]', process.env.LOCAL_TEST_PASSWORD!);
        await adminPage.click('button[type="submit"]');
        await adminPage.waitForURL('http://localhost:3000/dashboard');

        // Now post the project assignment
        const assignRes = await adminContext.request.post('http://localhost:3000/api/projectUserAssignment/addProjectAssignment', {
            data: {
                data: {
                    userId: 'cmrinioec001gvchcueq8v3db', // finance@onesystemserp.com ID
                    projectId: 'cmrirhhw30000ic0406v47smb',
                    projectRole: 'FINANCE_OFFICER',
                    accessLevel: 'READ_WRITE'
                }
            }
        });

        const assignJson = await assignRes.json();
        console.log(assignJson);
        expect(assignJson.success).toBeTruthy();
        
        await adminContext.close();
    });
});
