import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import s3Routes from './routes/s3';
import projectsRoutes from './routes/projects';
import procurementRoutes from './routes/procurement';
import canvassRoutes from './routes/canvass';
import issuanceRoutes from './routes/issuance';
import deliveryRoutes from './routes/delivery';
import workersRoutes from './routes/workers';
import equipmentRoutes from './routes/equipment';
import payrollRoutes from './routes/payroll';
import financeRoutes from './routes/finance';
import subcontractingRoutes from './routes/subcontracting';
import progressRoutes from './routes/progress';
import consolidationRoutes from './routes/consolidation';
import schedulingRoutes from './routes/scheduling';
import securityRoutes from './routes/security';
import permissionsRoutes from './routes/permissions';
import knowledgeRoutes from './routes/knowledge';
import aiRoutes from './routes/ai';
import jobsRoutes from './routes/jobs';
import { requireAuth } from './middleware/auth';
import accomplishmentFileActionsRoutes from './routes/accomplishmentFileActions';
import aiAssistantActionsRoutes from './routes/aiAssistantActions';
import aiPaymentValidationActionsRoutes from './routes/aiPaymentValidationActions';
import aiQueryActionsRoutes from './routes/aiQueryActions';
import aiVariationValidationActionsRoutes from './routes/aiVariationValidationActions';
import authRoutes from './routes/auth';
import boqTemplateServiceRoutes from './routes/boqTemplateService';
import documentActionsRoutes from './routes/documentActions';
import documentTemplateActionsRoutes from './routes/documentTemplateActions';
import executiveActionsRoutes from './routes/executiveActions';
import executiveValidationActionsRoutes from './routes/executiveValidationActions';
import fleetTelemetryServiceRoutes from './routes/fleetTelemetryService';
import fundingActionsRoutes from './routes/fundingActions';
import hikvisionDeviceServiceRoutes from './routes/hikvisionDeviceService';
import jobOrderActionsRoutes from './routes/jobOrderActions';
import knowledgeEnforcementRoutes from './routes/knowledgeEnforcement';
import ledgerActionsRoutes from './routes/ledgerActions';
import migrationRoutes from './routes/migration';
import notebookRoutes from './routes/notebook';
import paymentBatchActionsRoutes from './routes/paymentBatchActions';
import payrollAiChatRoutes from './routes/payrollAiChat';
import payrollAiValidatorRoutes from './routes/payrollAiValidator';
import payrollBankActionsRoutes from './routes/payrollBankActions';
import payrollEngineRoutes from './routes/payrollEngine';
import payrollFundingActionsRoutes from './routes/payrollFundingActions';
import payslipAiRoutes from './routes/payslipAi';
import payslipQueueActionsRoutes from './routes/payslipQueueActions';
import pettyCashActionsRoutes from './routes/pettyCashActions';
import poUpdatesRoutes from './routes/poUpdates';
import profileRoutes from './routes/profile';
import profitabilityActionsRoutes from './routes/profitabilityActions';
import progressActionsRoutes from './routes/progressActions';
import projectUserAssignmentRoutes from './routes/projectUserAssignment';
import reconciliationActionsRoutes from './routes/reconciliationActions';
import reportActionsRoutes from './routes/reportActions';
import returnActionsRoutes from './routes/returnActions';
import simulationActionsRoutes from './routes/simulationActions';
import simulationClearActionsRoutes from './routes/simulationClearActions';
import socActionsRoutes from './routes/socActions';
import subcontractingActionsRoutes from './routes/subcontractingActions';
import supplierActionsRoutes from './routes/supplierActions';
import systemResetActionsRoutes from './routes/systemResetActions';
import templateActionsRoutes from './routes/templateActions';
import userRolesRoutes from './routes/user-roles';
import userRoutes from './routes/user';
import variationOrderActionsRoutes from './routes/variationOrderActions';

dotenv.config();

const app = express();
const PORT = Number(process.env.ERP_BACKEND_PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Every API router, including legacy action proxies, requires signed internal context.
app.use('/api', requireAuth);

app.use('/api/s3', s3Routes);
app.use('/api/accomplishmentFileActions', accomplishmentFileActionsRoutes);
app.use('/api/aiAssistantActions', aiAssistantActionsRoutes);
app.use('/api/aiPaymentValidationActions', aiPaymentValidationActionsRoutes);
app.use('/api/aiQueryActions', aiQueryActionsRoutes);
app.use('/api/aiVariationValidationActions', aiVariationValidationActionsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/boqTemplateService', boqTemplateServiceRoutes);
app.use('/api/consolidation', consolidationRoutes);
app.use('/api/documentActions', documentActionsRoutes);
app.use('/api/documentTemplateActions', documentTemplateActionsRoutes);
app.use('/api/executiveActions', executiveActionsRoutes);
app.use('/api/executiveValidationActions', executiveValidationActionsRoutes);
app.use('/api/fleetTelemetryService', fleetTelemetryServiceRoutes);
app.use('/api/fundingActions', fundingActionsRoutes);
app.use('/api/hikvisionDeviceService', hikvisionDeviceServiceRoutes);
app.use('/api/jobOrderActions', jobOrderActionsRoutes);
app.use('/api/knowledgeEnforcement', knowledgeEnforcementRoutes);
app.use('/api/ledgerActions', ledgerActionsRoutes);
app.use('/api/migration', migrationRoutes);
app.use('/api/notebook', notebookRoutes);
app.use('/api/paymentBatchActions', paymentBatchActionsRoutes);
app.use('/api/payrollAiChat', payrollAiChatRoutes);
app.use('/api/payrollAiValidator', payrollAiValidatorRoutes);
app.use('/api/payrollBankActions', payrollBankActionsRoutes);
app.use('/api/payrollEngine', payrollEngineRoutes);
app.use('/api/payrollFundingActions', payrollFundingActionsRoutes);
app.use('/api/payslipAi', payslipAiRoutes);
app.use('/api/payslipQueueActions', payslipQueueActionsRoutes);
app.use('/api/pettyCashActions', pettyCashActionsRoutes);
app.use('/api/poUpdates', poUpdatesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/profitabilityActions', profitabilityActionsRoutes);
app.use('/api/progressActions', progressActionsRoutes);
app.use('/api/projectUserAssignment', projectUserAssignmentRoutes);
app.use('/api/reconciliationActions', reconciliationActionsRoutes);
app.use('/api/reportActions', reportActionsRoutes);
app.use('/api/returnActions', returnActionsRoutes);
app.use('/api/simulationActions', simulationActionsRoutes);
app.use('/api/simulationClearActions', simulationClearActionsRoutes);
app.use('/api/socActions', socActionsRoutes);
app.use('/api/subcontractingActions', subcontractingActionsRoutes);
app.use('/api/supplierActions', supplierActionsRoutes);
app.use('/api/systemResetActions', systemResetActionsRoutes);
app.use('/api/templateActions', templateActionsRoutes);
app.use('/api/user-roles', userRolesRoutes);
app.use('/api/user', userRoutes);
app.use('/api/variationOrderActions', variationOrderActionsRoutes);

app.use('/api/projects', projectsRoutes);
app.use('/api/procurement', procurementRoutes);
app.use('/api/canvass', canvassRoutes);
app.use('/api/issuance', issuanceRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/workers', workersRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/subcontracting', subcontractingRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/consolidation', consolidationRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/permissions', permissionsRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/jobs', jobsRoutes);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'onesystemserp-aws-backend',
    database: 'connected', // TODO: implement actual db check
    storage: 'connected', // TODO: implement actual storage check
    ai: 'configured',
    timestamp: new Date().toISOString()
  });
});

if (process.env.ERP_BACKEND_STANDALONE === 'true') {
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('Invalid ERP_BACKEND_PORT');
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`OneSystemsERP AWS Backend listening on port ${PORT}`);
  });
}

export default app;
