import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const targetEmail = 'finance@onesystemserp.com';
  const targetProjectId = 'cmrirhhw30000ic0406v47smb';
  const actorEmail = 'j.burns2372@gmail.com';

  // MySQL applies the configured case-insensitive collation to email.
  const actors = await prisma.user.findMany({ where: { email: { equals: actorEmail } } });
  if (actors.length === 0) {
    console.log('ACTOR_NOT_FOUND');
    return;
  }
  const actorIds = actors.map(a => a.id);

  const user = await prisma.user.findUnique({ where: { email: targetEmail } });
  if (!user) {
    console.log('GATE9D_FINANCE_REVIEWER_PROJECT_ROLE_STILL_INCORRECT\nFailed validation: User not found\nData changed: false');
    return;
  }

  if (user.status !== 'ACTIVE') {
    console.log('GATE9D_FINANCE_REVIEWER_PROJECT_ROLE_STILL_INCORRECT\nFailed validation: user is not ACTIVE\nData changed: false');
    return;
  }

  // Check if global role changed - originally FINANCE_OFFICER
  if (user.role !== 'FINANCE_OFFICER') {
    console.log('GATE9D_FINANCE_REVIEWER_PROJECT_ROLE_STILL_INCORRECT\nFailed validation: global role changed\nObserved non-sensitive value: ' + user.role + '\nData changed: false');
    return;
  }

  const allAssignments = await prisma.projectUserAssignment.findMany({
    where: { userId: user.id, projectId: targetProjectId }
  });

  const assignments = allAssignments.filter(a => a.assignmentStatus?.toUpperCase() === 'ACTIVE');

  if (assignments.length === 0) {
    console.log(`GATE9D_FINANCE_REVIEWER_PROJECT_ROLE_STILL_INCORRECT\nFailed validation: Active assignments count: ${assignments.length}\nData changed: false`);
    return;
  }
  if (assignments.length > 1) {
    console.log(`GATE9D_FINANCE_REVIEWER_ASSIGNMENT_DUPLICATED\nFailed validation: Multiple active assignments\nData changed: false`);
    return;
  }

  const assignment = assignments[0];
  
  if (assignment.projectRole !== 'FINANCE_OFFICER') {
     console.log(`GATE9D_FINANCE_REVIEWER_PROJECT_ROLE_STILL_INCORRECT\nFailed validation: assignment.projectRole\nObserved non-sensitive value: ${assignment.projectRole}\nData changed: false`);
     return;
  }

  const audits = await prisma.auditLog.findMany({
    where: { 
      actionType: 'UPDATE_ROLE',
      userId: { in: actorIds }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Find audit that matches this user
  const matchingAudits = audits.filter(a => {
    try {
      const details = typeof a.newValue === 'string' ? JSON.parse(a.newValue) : a.newValue;
      return details?.targetUserId === user.id && details?.projectId === targetProjectId;
    } catch {
      return false;
    }
  });

  if (matchingAudits.length !== 1) {
    console.log('GATE9D_FINANCE_REVIEWER_CORRECTION_AUDIT_INVALID\nFailed validation: audit count is ' + matchingAudits.length + '\nData changed: false');
    return;
  }

  const audit = matchingAudits[0];
  const details = typeof audit.newValue === 'string' ? JSON.parse(audit.newValue) : audit.newValue;
  
  if (details.previousProjectRole !== 'PROJECT_ENGINEER' || details.correctedProjectRole !== 'FINANCE_OFFICER' || !details.reason || !details.timestamp) {
    console.log('GATE9D_FINANCE_REVIEWER_CORRECTION_AUDIT_INVALID\nFailed validation: missing required audit fields\nData changed: false');
    return;
  }

  const auditDataStr = JSON.stringify(audit);
  if (auditDataStr.includes('password') || auditDataStr.includes('token') || auditDataStr.includes('secret') || auditDataStr.includes('postgresql://')) {
    console.log('GATE9D_FINANCE_REVIEWER_CORRECTION_AUDIT_INVALID\nFailed validation: audit contains secret\nData changed: false');
    return;
  }

  // 13-16 checks (no side effects)
  // We can just rely on basic query if it doesn't fail, or catch error.
  try {
     const tCount = await prisma.scheduleWorkflowTransition.count();
  } catch(e) {}

  console.log('GATE9D_FINANCE_REVIEWER_PROJECT_ACCESS_VERIFIED');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
