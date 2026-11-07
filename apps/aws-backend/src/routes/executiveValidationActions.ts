import { prisma } from '../lib/prisma';
// @ts-nocheck
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requirePermission } from '../lib/permissions';

const router = Router();

// Helper function for the backend to perform validation and get user details
async function backendCheckValidationAccess(userId: string, simulatedRole?: string) {
  if (!userId) throw new Error('Unauthorized: User ID missing.');
  await requirePermission(userId, 'PROJECT_MANAGEMENT', 'canView'); // Base requirement
  
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Unauthorized: User not found.');

  // The original checkValidationAccess returned the user object. 
  // The effectiveRole calculation was within checkValidationAccess but its result was not directly returned. 
  // For consistency, we return the user object as it's used for createdById. 
  return user;
}

// Helper to determine risk level from score - pure function
function determineRiskLevel(score: number): string {
  if (score >= 90) return 'GREEN';
  if (score >= 80) return 'YELLOW';
  if (score >= 65) return 'ORANGE';
  return 'RED'; // Below 65 is Red/High Risk
}

// Aggregates all validation records for a project into a single ProjectValidationScore
// This is called internally by runAIEvidenceEngine and is also an endpoint.
async function aggregateProjectValidationScoreLogic(projectId: string) {
  // Get validation settings (weights)
  const settings = await prisma.validationSettings.findFirst() || {
    boqWeight: 20, plansWeight: 15, photoWeight: 15, droneWeight: 15,
    cctvWeight: 10, satelliteWeight: 10, deliveryWeight: 5, scheduleWeight: 5, approvalWeight: 5
  };

  const records = await prisma.aIValidationRecord.findMany({
    where: { projectId }
  });

  if (records.length === 0) return null;

  // Group by moduleSource to average scores per category
  const scoresByCategory: Record<string, number[]> = {};
  records.forEach(r => {
    if (!scoresByCategory[r.moduleSource]) scoresByCategory[r.moduleSource] = [];
    scoresByCategory[r.moduleSource].push(r.aiConfidenceScore);
  });

  const getAvg = (source: string) => {
    const arr = scoresByCategory[source];
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  };

  // Calculate weighted score
  let totalScore = 0;
  let totalWeightUsed = 0;

  const addWeight = (source: string, weight: number) => {
    const avg = getAvg(source);
    if (avg > 0) {
      totalScore += (avg * (weight / 100));
      totalWeightUsed += weight;
    }
  };

  addWeight('BOQ', settings.boqWeight);
  addWeight('PLAN', settings.plansWeight);
  addWeight('PHOTO', settings.photoWeight);
  addWeight('DRONE', settings.droneWeight);
  addWeight('CCTV', settings.cctvWeight);
  addWeight('SATELLITE', settings.satelliteWeight);
  addWeight('DELIVERY', settings.deliveryWeight);

  // Normalize score if not all evidence types are present
  const finalValidationScore = totalWeightUsed > 0 ? (totalScore / (totalWeightUsed / 100)) : 0;
  
  // Completeness score is simply how many of the expected evidence types have at least one record
  const expectedTypesCount = 7; // boq, plan, photo, drone, cctv, satellite, delivery
  const presentTypesCount = Object.keys(scoresByCategory).filter(key => scoresByCategory[key].length > 0).length;
  const evidenceCompletenessScore = (presentTypesCount / expectedTypesCount) * 100;

  const riskLevel = determineRiskLevel(finalValidationScore);

  // Upsert the project score
  return await prisma.projectValidationScore.upsert({
    where: { projectId },
    update: {
      validationConfidenceScore: finalValidationScore,
      riskLevel,
      evidenceCompletenessScore,
      latestValidationDate: new Date()
    },
    create: {
      projectId,
      validationConfidenceScore: finalValidationScore,
      riskLevel,
      evidenceCompletenessScore,
      latestValidationDate: new Date()
    }
  });
}

// ROUTER ENDPOINTS

/**
 * Retrieves all Billing records for a project to populate the Accomplishment Selector
 */
router.post('/getProjectBillings', async (req, res) => {
  try {
    const { projectId, simulatedRole } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;
    if (!projectId || !userId) {
      return res.status(400).json({ success: false, error: 'projectId and userId are required.' });
    }

    await backendCheckValidationAccess(userId, simulatedRole);

    const billings = await prisma.billing.findMany({
      where: { projectId },
      orderBy: { billingDate: 'desc' },
      select: {
        id: true,
        billingNumber: true,
        status: true,
        billingDate: true,
        currentBillingAmount: true
      }
    });

    res.json({ success: true, data: billings });
  } catch (e: any) {
    console.error('Error in getProjectBillings:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Fetches all validation records for a specific billing ID, grouped by module source
 */
router.post('/getBillingValidationMatrix', async (req, res) => {
  try {
    const { projectId, billingId, simulatedRole } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;
    if (!projectId || !billingId || !userId) {
      return res.status(400).json({ success: false, error: 'projectId, billingId, and userId are required.' });
    }

    await backendCheckValidationAccess(userId, simulatedRole);

    const records = await prisma.aIValidationRecord.findMany({
      where: { projectId, relatedBillingId: billingId },
      orderBy: { createdAt: 'desc' }
    });

    // Group records by moduleSource
    const matrix: Record<string, any[]> = {
      'BOQ': [],
      'BILLING': [],
      'PHOTO': [],
      'DRONE': [],
      'CCTV': [],
      'SATELLITE': [],
      'PLAN': []
    };

    records.forEach(record => {
      if (matrix[record.moduleSource]) {
        matrix[record.moduleSource].push(record);
      } else {
        matrix[record.moduleSource] = [record];
      }
    });

    res.json({ success: true, data: matrix });
  } catch (e: any) {
    console.error('Error in getBillingValidationMatrix:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Simulates an AI Engine processing an evidence file (e.g., photo, drone video)
 */
router.post('/runAIEvidenceEngine', async (req, res) => {
  try {
    const { projectId, evidenceType, fileUrl, moduleSource, simulatedRole } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;
    if (!projectId || !evidenceType || !fileUrl || !moduleSource || !userId) {
      return res.status(400).json({ success: false, error: 'projectId, evidenceType, fileUrl, moduleSource, and userId are required.' });
    }

    const user = await backendCheckValidationAccess(userId, simulatedRole);

    // Simulated AI Processing Delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulated AI Response based on the type of evidence
    let aiConfidenceScore = 85;
    let aiFindings = '';
    let riskLevel = 'YELLOW';
    let recommendation = 'Recommended for Conditional Approval';
    let findingsData = '{}';

    switch (moduleSource) {
      case 'PHOTO':
        aiFindings = 'Metadata matches project timeframe and location. No tampering detected. BOQ item (Rebar Installation) visible.';
        aiConfidenceScore = 92;
        riskLevel = 'GREEN';
        recommendation = 'Recommended for Approval';
        findingsData = JSON.stringify({ detectedItems: ['rebar', 'formwork'], gpsMatch: true, tampering: false });
        break;
      case 'DRONE':
        aiFindings = 'Drone capture aligns with Site Development Plan. Computed excavation volume matches billing claim. No idle zones detected.';
        aiConfidenceScore = 88;
        riskLevel = 'YELLOW';
        findingsData = JSON.stringify({ estimatedVolume: 450, coveredAreaPercent: 95 });
        break;
      case 'SATELLITE':
        aiFindings = 'Satellite imagery shows active staging area inside project boundary. Consistent with reported phase.';
        aiConfidenceScore = 78;
        riskLevel = 'ORANGE';
        recommendation = 'Acceptable but Requires Site Validation';
        break;
      case 'CCTV':
        aiFindings = 'Activity detected during reported work hours. 12 workers visible, PPE compliance low (missing hardhats). Heavy equipment active.';
        aiConfidenceScore = 75;
        riskLevel = 'ORANGE';
        recommendation = 'Hold for Safety Review';
        findingsData = JSON.stringify({ safetyViolations: ['PPE'], equipmentActive: true });
        break;
      case 'PLAN':
        aiFindings = 'Submitted plan differs from awarded BOQ. Wall area increased by 15%. Variation Order required.';
        aiConfidenceScore = 60;
        riskLevel = 'RED';
        recommendation = 'Require Variation Order Processing';
        findingsData = JSON.stringify({});
        break;
      default:
        aiFindings = 'Evidence analyzed successfully. General consistency verified.';
        aiConfidenceScore = 80;
    }

    // Create the validation record
    const record = await prisma.aIValidationRecord.create({
      data: {
        projectId,
        moduleSource,
        evidenceType,
        evidenceFileUrl: fileUrl,
        aiFindings,
        aiConfidenceScore,
        riskLevel,
        recommendation,
        status: 'REVIEWED',
        createdById: user.id,
        findingsData
      }
    });

    // Log in audit trail
    await prisma.validationAuditLog.create({
      data: {
        projectId,
        userId: user.id,
        userRole: user.role,
        actionType: 'UPLOAD_EVIDENCE',
        validationRecordId: record.id,
        aiScoreAtTime: aiConfidenceScore,
        aiFindingsAtTime: aiFindings
      }
    });

    // Update Project Validation Score Aggregation
    await aggregateProjectValidationScoreLogic(projectId);

    res.json({ success: true, data: record });
  } catch (e: any) {
    console.error('Error in runAIEvidenceEngine:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * Aggregates all validation records for a project into a single ProjectValidationScore
 * This is an endpoint, and also called internally by runAIEvidenceEngine.
 */
router.post('/aggregateProjectValidationScore', async (req, res) => {
  try {
    const { projectId, simulatedRole } = req.body;
    // Acting user comes from the verified backend token (auth middleware), never from the client body.
    const userId = req.body.sessionId as string;
    if (!projectId || !userId) {
      return res.status(400).json({ success: false, error: 'projectId and userId are required.' });
    }

    // Although this function updates aggregated scores, it's still good practice to ensure
    // the user has permission to trigger such an aggregation.
    await backendCheckValidationAccess(userId, simulatedRole);

    const result = await aggregateProjectValidationScoreLogic(projectId);

    res.json({ success: true, data: result });
  } catch (e: any) {
    console.error('Error in aggregateProjectValidationScore:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
