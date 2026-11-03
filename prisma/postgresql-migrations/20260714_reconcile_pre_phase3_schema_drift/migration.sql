CREATE OR REPLACE FUNCTION _reconcile_check_column(
    p_table text, p_column text, p_type text, p_nullable boolean, p_default text
) RETURNS void AS $$
DECLARE
    v_type text;
    v_nullable boolean;
    v_default text;
BEGIN
    SELECT data_type, (is_nullable = 'YES'), column_default
    INTO v_type, v_nullable, v_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Column %.% is missing', p_table, p_column;
    END IF;

    IF v_type != p_type THEN
        RAISE EXCEPTION 'Column %.% type mismatch: expected %, got %', p_table, p_column, p_type, v_type;
    END IF;

    IF v_nullable != p_nullable THEN
        RAISE EXCEPTION 'Column %.% nullability mismatch: expected %, got %', p_table, p_column, p_nullable, v_nullable;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION _reconcile_check_fk(
    p_table text, p_constraint text, p_col text, p_ref_table text, p_ref_col text, p_on_delete text, p_on_update text
) RETURNS void AS $$
DECLARE
    v_ref_table text;
BEGIN
    SELECT ccu.table_name INTO v_ref_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = p_table AND tc.constraint_name = p_constraint;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Foreign key % on % is missing', p_constraint, p_table;
    END IF;

    IF v_ref_table != p_ref_table THEN
        RAISE EXCEPTION 'Foreign key % targets wrong table: expected %, got %', p_constraint, p_ref_table, v_ref_table;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION _reconcile_check_idx(
    p_name text, p_table text, p_col text
) RETURNS void AS $$
DECLARE
    v_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes WHERE tablename = p_table AND indexname = p_name
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Index % on % is missing', p_name, p_table;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BOQMapping' AND column_name='procurementBenchmarkItemId') THEN
        ALTER TABLE "public"."BOQMapping" ADD COLUMN "procurementBenchmarkItemId" TEXT;
    END IF;
    PERFORM _reconcile_check_column('BOQMapping', 'procurementBenchmarkItemId', 'text', true, null);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='BOQMapping' AND column_name='awardedBoqItemId' AND is_nullable='NO') THEN
        ALTER TABLE "public"."BOQMapping" ALTER COLUMN "awardedBoqItemId" DROP NOT NULL;
    END IF;
    PERFORM _reconcile_check_column('BOQMapping', 'awardedBoqItemId', 'text', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='CountermeasureLog' AND column_name='actualResult') THEN
        ALTER TABLE "public"."CountermeasureLog" ADD COLUMN "actualResult" TEXT, ADD COLUMN "expectedResult" TEXT, ADD COLUMN "passed" BOOLEAN, ADD COLUMN "responseTimeMs" INTEGER;
    END IF;
    PERFORM _reconcile_check_column('CountermeasureLog', 'actualResult', 'text', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SecurityEvent' AND column_name='actualResponse') THEN
        ALTER TABLE "public"."SecurityEvent" ADD COLUMN "actualResponse" TEXT, ADD COLUMN "expectedResponse" TEXT, ADD COLUMN "simulationPassed" BOOLEAN, ADD COLUMN "simulationRunId" TEXT;
    END IF;
    PERFORM _reconcile_check_column('SecurityEvent', 'actualResponse', 'text', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='SecurityIncident' AND column_name='evidenceJson') THEN
        ALTER TABLE "public"."SecurityIncident" ADD COLUMN "evidenceJson" TEXT, ADD COLUMN "linkedSimulationRunId" TEXT, ADD COLUMN "timelineJson" TEXT;
    END IF;
    PERFORM _reconcile_check_column('SecurityIncident', 'evidenceJson', 'text', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='BOQExtractedItem') THEN
    CREATE TABLE "public"."BOQExtractedItem" (
        "id" TEXT NOT NULL,
        "uploadedWorkbookFileId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "sectionId" TEXT ,
        "sheetName" TEXT ,
        "sourceRowNumber" INTEGER ,
        "itemNumber" TEXT ,
        "description" TEXT NOT NULL,
        "unit" TEXT ,
        "quantity" DOUBLE PRECISION ,
        "materialUnitCost" DOUBLE PRECISION ,
        "laborUnitCost" DOUBLE PRECISION ,
        "equipmentUnitCost" DOUBLE PRECISION ,
        "totalDirectCost" DOUBLE PRECISION ,
        "ocm" DOUBLE PRECISION ,
        "cp" DOUBLE PRECISION ,
        "vat" DOUBLE PRECISION ,
        "totalIndirectCost" DOUBLE PRECISION ,
        "unitCost" DOUBLE PRECISION ,
        "amount" DOUBLE PRECISION ,
        "percentage" DOUBLE PRECISION ,
        "formulaMapJson" TEXT ,
        "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
        "validationErrorsJson" TEXT ,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "BOQExtractedItem_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('BOQExtractedItem', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'uploadedWorkbookFileId', 'text', false, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'sectionId', 'text', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'sheetName', 'text', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'sourceRowNumber', 'integer', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'itemNumber', 'text', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'description', 'text', false, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'unit', 'text', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'quantity', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'materialUnitCost', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'laborUnitCost', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'equipmentUnitCost', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'totalDirectCost', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'ocm', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'cp', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'vat', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'totalIndirectCost', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'unitCost', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'amount', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'percentage', 'double precision', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'formulaMapJson', 'text', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'validationStatus', 'text', false, '''PENDING''');
    PERFORM _reconcile_check_column('BOQExtractedItem', 'validationErrorsJson', 'text', true, null);
    PERFORM _reconcile_check_column('BOQExtractedItem', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('BOQExtractedItem', 'updatedAt', 'timestamp without time zone', false, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='BOQExtractedSection') THEN
    CREATE TABLE "public"."BOQExtractedSection" (
        "id" TEXT NOT NULL,
        "uploadedWorkbookFileId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "sheetName" TEXT ,
        "sourceRowNumber" INTEGER ,
        "sectionCode" TEXT ,
        "sectionName" TEXT NOT NULL,
        "displayOrder" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "BOQExtractedSection_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('BOQExtractedSection', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('BOQExtractedSection', 'uploadedWorkbookFileId', 'text', false, null);
    PERFORM _reconcile_check_column('BOQExtractedSection', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('BOQExtractedSection', 'sheetName', 'text', true, null);
    PERFORM _reconcile_check_column('BOQExtractedSection', 'sourceRowNumber', 'integer', true, null);
    PERFORM _reconcile_check_column('BOQExtractedSection', 'sectionCode', 'text', true, null);
    PERFORM _reconcile_check_column('BOQExtractedSection', 'sectionName', 'text', false, null);
    PERFORM _reconcile_check_column('BOQExtractedSection', 'displayOrder', 'integer', false, '0');
    PERFORM _reconcile_check_column('BOQExtractedSection', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('BOQExtractedSection', 'updatedAt', 'timestamp without time zone', false, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='OnlyOfficeSession') THEN
    CREATE TABLE "public"."OnlyOfficeSession" (
        "id" TEXT NOT NULL,
        "uploadedWorkbookFileId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "workbookVersionId" TEXT ,
        "documentKey" TEXT NOT NULL,
        "mode" TEXT NOT NULL DEFAULT 'view',
        "userId" TEXT NOT NULL,
        "userName" TEXT ,
        "permissionsJson" TEXT ,
        "configJson" TEXT ,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "expiresAt" TIMESTAMP(3) ,
        "lastCallbackAt" TIMESTAMP(3) ,
        CONSTRAINT "OnlyOfficeSession_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'uploadedWorkbookFileId', 'text', false, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'workbookVersionId', 'text', true, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'documentKey', 'text', false, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'mode', 'text', false, '''view''');
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'userId', 'text', false, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'userName', 'text', true, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'permissionsJson', 'text', true, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'configJson', 'text', true, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'status', 'text', false, '''ACTIVE''');
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'expiresAt', 'timestamp without time zone', true, null);
    PERFORM _reconcile_check_column('OnlyOfficeSession', 'lastCallbackAt', 'timestamp without time zone', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='ProjectBOQVersion') THEN
    CREATE TABLE "public"."ProjectBOQVersion" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "sourceUploadedWorkbookFileId" TEXT ,
        "versionNumber" INTEGER NOT NULL,
        "versionLabel" TEXT ,
        "status" TEXT NOT NULL DEFAULT 'DRAFT',
        "committedBy" TEXT ,
        "committedAt" TIMESTAMP(3) ,
        "approvedBy" TEXT ,
        "approvedAt" TIMESTAMP(3) ,
        "totalDirectCost" DOUBLE PRECISION ,
        "totalIndirectCost" DOUBLE PRECISION ,
        "totalAmount" DOUBLE PRECISION ,
        "remarks" TEXT ,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ProjectBOQVersion_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'sourceUploadedWorkbookFileId', 'text', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'versionNumber', 'integer', false, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'versionLabel', 'text', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'status', 'text', false, '''DRAFT''');
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'committedBy', 'text', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'committedAt', 'timestamp without time zone', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'approvedBy', 'text', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'approvedAt', 'timestamp without time zone', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'totalDirectCost', 'double precision', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'totalIndirectCost', 'double precision', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'totalAmount', 'double precision', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'remarks', 'text', true, null);
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('ProjectBOQVersion', 'updatedAt', 'timestamp without time zone', false, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='SecuritySimulationArchive') THEN
    CREATE TABLE "public"."SecuritySimulationArchive" (
        "id" TEXT NOT NULL,
        "archiveNumber" TEXT NOT NULL,
        "simulationRunId" TEXT ,
        "campaignId" TEXT ,
        "scenarioName" TEXT ,
        "runMode" TEXT ,
        "environment" TEXT ,
        "initiatedBy" TEXT ,
        "clearedBy" TEXT ,
        "startedAt" TIMESTAMP(3) ,
        "completedAt" TIMESTAMP(3) ,
        "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "totalEventsArchived" INTEGER ,
        "totalIncidentsArchived" INTEGER ,
        "totalCountermeasuresArchived" INTEGER ,
        "detectionScore" DOUBLE PRECISION ,
        "responseScore" DOUBLE PRECISION ,
        "evidenceScore" DOUBLE PRECISION ,
        "finalScore" DOUBLE PRECISION ,
        "overallResult" TEXT ,
        "archiveJson" TEXT ,
        "exportedPdfUrl" TEXT ,
        "exportedExcelUrl" TEXT ,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "SecuritySimulationArchive_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'archiveNumber', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'simulationRunId', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'campaignId', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'scenarioName', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'runMode', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'environment', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'initiatedBy', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'clearedBy', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'startedAt', 'timestamp without time zone', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'completedAt', 'timestamp without time zone', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'clearedAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'totalEventsArchived', 'integer', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'totalIncidentsArchived', 'integer', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'totalCountermeasuresArchived', 'integer', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'detectionScore', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'responseScore', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'evidenceScore', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'finalScore', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'overallResult', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'archiveJson', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'exportedPdfUrl', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'exportedExcelUrl', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationArchive', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='SecuritySimulationCampaign') THEN
    CREATE TABLE "public"."SecuritySimulationCampaign" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT ,
        "severity" TEXT NOT NULL,
        "scenarioSequenceJson" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "createdBy" TEXT ,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "SecuritySimulationCampaign_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'name', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'description', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'severity', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'scenarioSequenceJson', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'status', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'createdBy', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('SecuritySimulationCampaign', 'updatedAt', 'timestamp without time zone', false, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='SecuritySimulationRun') THEN
    CREATE TABLE "public"."SecuritySimulationRun" (
        "id" TEXT NOT NULL,
        "scenarioId" TEXT ,
        "campaignId" TEXT ,
        "runMode" TEXT NOT NULL,
        "environment" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "initiatedBy" TEXT ,
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP(3) ,
        "detectionScore" DOUBLE PRECISION ,
        "responseScore" DOUBLE PRECISION ,
        "evidenceScore" DOUBLE PRECISION ,
        "finalScore" DOUBLE PRECISION ,
        "overallResult" TEXT ,
        "notes" TEXT ,
        CONSTRAINT "SecuritySimulationRun_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'scenarioId', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'campaignId', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'runMode', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'environment', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'status', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'initiatedBy', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'startedAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'completedAt', 'timestamp without time zone', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'detectionScore', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'responseScore', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'evidenceScore', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'finalScore', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'overallResult', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationRun', 'notes', 'text', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='SecuritySimulationScenario') THEN
    CREATE TABLE "public"."SecuritySimulationScenario" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT ,
        "category" TEXT NOT NULL,
        "severity" TEXT NOT NULL,
        "targetModule" TEXT NOT NULL,
        "targetRoute" TEXT ,
        "simulatedRole" TEXT ,
        "simulatedSourceIp" TEXT ,
        "simulatedCountry" TEXT ,
        "simulatedCity" TEXT ,
        "latitude" DOUBLE PRECISION ,
        "longitude" DOUBLE PRECISION ,
        "mitreTechnique" TEXT ,
        "owaspCategory" TEXT ,
        "expectedDetection" TEXT ,
        "expectedCountermeasure" TEXT ,
        "passFailCriteria" TEXT ,
        "enabled" BOOLEAN NOT NULL DEFAULT true,
        "createdBy" TEXT ,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "SecuritySimulationScenario_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'name', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'description', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'category', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'severity', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'targetModule', 'text', false, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'targetRoute', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'simulatedRole', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'simulatedSourceIp', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'simulatedCountry', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'simulatedCity', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'latitude', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'longitude', 'double precision', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'mitreTechnique', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'owaspCategory', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'expectedDetection', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'expectedCountermeasure', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'passFailCriteria', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'enabled', 'boolean', false, 'true');
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'createdBy', 'text', true, null);
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('SecuritySimulationScenario', 'updatedAt', 'timestamp without time zone', false, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='UploadedWorkbookFile') THEN
    CREATE TABLE "public"."UploadedWorkbookFile" (
        "id" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "originalFilename" TEXT NOT NULL,
        "fileHash" TEXT NOT NULL,
        "storagePath" TEXT NOT NULL,
        "preservedOriginalUrl" TEXT ,
        "uploadedBy" TEXT NOT NULL,
        "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "recognizedTemplate" TEXT ,
        "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "commitStatus" TEXT NOT NULL DEFAULT 'PENDING',
        "documentType" TEXT ,
        "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
        "fileSize" INTEGER NOT NULL,
        "latestPreservedVersionId" TEXT ,
        "metadataJson" TEXT ,
        "mimeType" TEXT NOT NULL,
        "onlyOfficeDocumentKey" TEXT ,
        "templateCode" TEXT ,
        "templateName" TEXT ,
        "templateVersion" TEXT ,
        CONSTRAINT "UploadedWorkbookFile_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'originalFilename', 'text', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'fileHash', 'text', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'storagePath', 'text', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'preservedOriginalUrl', 'text', true, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'uploadedBy', 'text', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'uploadedAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'recognizedTemplate', 'text', true, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'validationStatus', 'text', false, '''PENDING''');
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'updatedAt', 'timestamp without time zone', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'commitStatus', 'text', false, '''PENDING''');
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'documentType', 'text', true, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'extractionStatus', 'text', false, '''PENDING''');
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'fileSize', 'integer', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'latestPreservedVersionId', 'text', true, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'metadataJson', 'text', true, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'mimeType', 'text', false, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'onlyOfficeDocumentKey', 'text', true, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'templateCode', 'text', true, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'templateName', 'text', true, null);
    PERFORM _reconcile_check_column('UploadedWorkbookFile', 'templateVersion', 'text', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='WorkbookExtractionAudit') THEN
    CREATE TABLE "public"."WorkbookExtractionAudit" (
        "id" TEXT NOT NULL,
        "uploadedWorkbookFileId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'SUCCESS',
        "message" TEXT ,
        "detailsJson" TEXT ,
        "performedBy" TEXT ,
        "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ipAddress" TEXT ,
        "performedByRole" TEXT ,
        "userAgent" TEXT ,
        CONSTRAINT "WorkbookExtractionAudit_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'uploadedWorkbookFileId', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'action', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'status', 'text', false, '''SUCCESS''');
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'message', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'detailsJson', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'performedBy', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'performedAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'ipAddress', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'performedByRole', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookExtractionAudit', 'userAgent', 'text', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='WorkbookFormulaValidation') THEN
    CREATE TABLE "public"."WorkbookFormulaValidation" (
        "id" TEXT NOT NULL,
        "uploadedWorkbookFileId" TEXT NOT NULL,
        "sheetName" TEXT ,
        "cellAddress" TEXT NOT NULL,
        "sourceRowNumber" INTEGER ,
        "expectedFormula" TEXT ,
        "actualFormula" TEXT ,
        "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
        "message" TEXT ,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "projectId" TEXT NOT NULL,
        "severity" TEXT NOT NULL DEFAULT 'INFO',
        "actualValue" DOUBLE PRECISION ,
        "expectedValue" DOUBLE PRECISION ,
        CONSTRAINT "WorkbookFormulaValidation_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'uploadedWorkbookFileId', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'sheetName', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'cellAddress', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'sourceRowNumber', 'integer', true, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'expectedFormula', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'actualFormula', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'validationStatus', 'text', false, '''PENDING''');
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'message', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'severity', 'text', false, '''INFO''');
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'actualValue', 'double precision', true, null);
    PERFORM _reconcile_check_column('WorkbookFormulaValidation', 'expectedValue', 'double precision', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='WorkbookTemplateValidation') THEN
    CREATE TABLE "public"."WorkbookTemplateValidation" (
        "id" TEXT NOT NULL,
        "uploadedWorkbookFileId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "validationType" TEXT NOT NULL,
        "validationKey" TEXT NOT NULL,
        "expectedValue" TEXT ,
        "actualValue" TEXT ,
        "severity" TEXT NOT NULL DEFAULT 'INFO',
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "message" TEXT ,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WorkbookTemplateValidation_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'uploadedWorkbookFileId', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'validationType', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'validationKey', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'expectedValue', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'actualValue', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'severity', 'text', false, '''INFO''');
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'status', 'text', false, '''PENDING''');
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'message', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookTemplateValidation', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='WorkbookVersion') THEN
    CREATE TABLE "public"."WorkbookVersion" (
        "id" TEXT NOT NULL,
        "uploadedWorkbookFileId" TEXT NOT NULL,
        "projectId" TEXT NOT NULL,
        "versionNumber" INTEGER NOT NULL,
        "versionLabel" TEXT ,
        "sourceType" TEXT NOT NULL,
        "filePath" TEXT NOT NULL,
        "fileHash" TEXT NOT NULL,
        "createdBy" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "remarks" TEXT ,
        CONSTRAINT "WorkbookVersion_pkey" PRIMARY KEY ("id")
    );
    END IF;
    PERFORM _reconcile_check_column('WorkbookVersion', 'id', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'uploadedWorkbookFileId', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'projectId', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'versionNumber', 'integer', false, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'versionLabel', 'text', true, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'sourceType', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'filePath', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'fileHash', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'createdBy', 'text', false, null);
    PERFORM _reconcile_check_column('WorkbookVersion', 'createdAt', 'timestamp without time zone', false, 'CURRENT_TIMESTAMP');
    PERFORM _reconcile_check_column('WorkbookVersion', 'remarks', 'text', true, null);
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='BOQExtractedItem_projectId_fkey' AND table_name='BOQExtractedItem') THEN
        ALTER TABLE "public"."BOQExtractedItem" ADD CONSTRAINT "BOQExtractedItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('BOQExtractedItem', 'BOQExtractedItem_projectId_fkey', 'projectId', 'Project', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='BOQExtractedItem_sectionId_fkey' AND table_name='BOQExtractedItem') THEN
        ALTER TABLE "public"."BOQExtractedItem" ADD CONSTRAINT "BOQExtractedItem_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "public"."BOQExtractedSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('BOQExtractedItem', 'BOQExtractedItem_sectionId_fkey', 'sectionId', 'BOQExtractedSection', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='BOQExtractedItem_uploadedWorkbookFileId_fkey' AND table_name='BOQExtractedItem') THEN
        ALTER TABLE "public"."BOQExtractedItem" ADD CONSTRAINT "BOQExtractedItem_uploadedWorkbookFileId_fkey" FOREIGN KEY ("uploadedWorkbookFileId") REFERENCES "public"."UploadedWorkbookFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('BOQExtractedItem', 'BOQExtractedItem_uploadedWorkbookFileId_fkey', 'uploadedWorkbookFileId', 'UploadedWorkbookFile', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='BOQExtractedSection_projectId_fkey' AND table_name='BOQExtractedSection') THEN
        ALTER TABLE "public"."BOQExtractedSection" ADD CONSTRAINT "BOQExtractedSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('BOQExtractedSection', 'BOQExtractedSection_projectId_fkey', 'projectId', 'Project', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='BOQExtractedSection_uploadedWorkbookFileId_fkey' AND table_name='BOQExtractedSection') THEN
        ALTER TABLE "public"."BOQExtractedSection" ADD CONSTRAINT "BOQExtractedSection_uploadedWorkbookFileId_fkey" FOREIGN KEY ("uploadedWorkbookFileId") REFERENCES "public"."UploadedWorkbookFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('BOQExtractedSection', 'BOQExtractedSection_uploadedWorkbookFileId_fkey', 'uploadedWorkbookFileId', 'UploadedWorkbookFile', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='BOQMapping_procurementBenchmarkItemId_fkey' AND table_name='BOQMapping') THEN
        ALTER TABLE "public"."BOQMapping" ADD CONSTRAINT "BOQMapping_procurementBenchmarkItemId_fkey" FOREIGN KEY ("procurementBenchmarkItemId") REFERENCES "public"."ProcurementBenchmarkItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('BOQMapping', 'BOQMapping_procurementBenchmarkItemId_fkey', 'procurementBenchmarkItemId', 'ProcurementBenchmarkItem', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='OnlyOfficeSession_uploadedWorkbookFileId_fkey' AND table_name='OnlyOfficeSession') THEN
        ALTER TABLE "public"."OnlyOfficeSession" ADD CONSTRAINT "OnlyOfficeSession_uploadedWorkbookFileId_fkey" FOREIGN KEY ("uploadedWorkbookFileId") REFERENCES "public"."UploadedWorkbookFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('OnlyOfficeSession', 'OnlyOfficeSession_uploadedWorkbookFileId_fkey', 'uploadedWorkbookFileId', 'UploadedWorkbookFile', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='OnlyOfficeSession_workbookVersionId_fkey' AND table_name='OnlyOfficeSession') THEN
        ALTER TABLE "public"."OnlyOfficeSession" ADD CONSTRAINT "OnlyOfficeSession_workbookVersionId_fkey" FOREIGN KEY ("workbookVersionId") REFERENCES "public"."WorkbookVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('OnlyOfficeSession', 'OnlyOfficeSession_workbookVersionId_fkey', 'workbookVersionId', 'WorkbookVersion', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='SecurityEvent_simulationRunId_fkey' AND table_name='SecurityEvent') THEN
        ALTER TABLE "public"."SecurityEvent" ADD CONSTRAINT "SecurityEvent_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "public"."SecuritySimulationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('SecurityEvent', 'SecurityEvent_simulationRunId_fkey', 'simulationRunId', 'SecuritySimulationRun', 'id', 'SET NULL', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='SecurityIncident_linkedSimulationRunId_fkey' AND table_name='SecurityIncident') THEN
        ALTER TABLE "public"."SecurityIncident" ADD CONSTRAINT "SecurityIncident_linkedSimulationRunId_fkey" FOREIGN KEY ("linkedSimulationRunId") REFERENCES "public"."SecuritySimulationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('SecurityIncident', 'SecurityIncident_linkedSimulationRunId_fkey', 'linkedSimulationRunId', 'SecuritySimulationRun', 'id', 'SET NULL', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='SecuritySimulationRun_campaignId_fkey' AND table_name='SecuritySimulationRun') THEN
        ALTER TABLE "public"."SecuritySimulationRun" ADD CONSTRAINT "SecuritySimulationRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."SecuritySimulationCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('SecuritySimulationRun', 'SecuritySimulationRun_campaignId_fkey', 'campaignId', 'SecuritySimulationCampaign', 'id', 'SET NULL', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='SecuritySimulationRun_scenarioId_fkey' AND table_name='SecuritySimulationRun') THEN
        ALTER TABLE "public"."SecuritySimulationRun" ADD CONSTRAINT "SecuritySimulationRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "public"."SecuritySimulationScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('SecuritySimulationRun', 'SecuritySimulationRun_scenarioId_fkey', 'scenarioId', 'SecuritySimulationScenario', 'id', 'SET NULL', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='UploadedWorkbookFile_projectId_fkey' AND table_name='UploadedWorkbookFile') THEN
        ALTER TABLE "public"."UploadedWorkbookFile" ADD CONSTRAINT "UploadedWorkbookFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('UploadedWorkbookFile', 'UploadedWorkbookFile_projectId_fkey', 'projectId', 'Project', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='WorkbookExtractionAudit_projectId_fkey' AND table_name='WorkbookExtractionAudit') THEN
        ALTER TABLE "public"."WorkbookExtractionAudit" ADD CONSTRAINT "WorkbookExtractionAudit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('WorkbookExtractionAudit', 'WorkbookExtractionAudit_projectId_fkey', 'projectId', 'Project', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='WorkbookExtractionAudit_uploadedWorkbookFileId_fkey' AND table_name='WorkbookExtractionAudit') THEN
        ALTER TABLE "public"."WorkbookExtractionAudit" ADD CONSTRAINT "WorkbookExtractionAudit_uploadedWorkbookFileId_fkey" FOREIGN KEY ("uploadedWorkbookFileId") REFERENCES "public"."UploadedWorkbookFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('WorkbookExtractionAudit', 'WorkbookExtractionAudit_uploadedWorkbookFileId_fkey', 'uploadedWorkbookFileId', 'UploadedWorkbookFile', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='WorkbookFormulaValidation_uploadedWorkbookFileId_fkey' AND table_name='WorkbookFormulaValidation') THEN
        ALTER TABLE "public"."WorkbookFormulaValidation" ADD CONSTRAINT "WorkbookFormulaValidation_uploadedWorkbookFileId_fkey" FOREIGN KEY ("uploadedWorkbookFileId") REFERENCES "public"."UploadedWorkbookFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('WorkbookFormulaValidation', 'WorkbookFormulaValidation_uploadedWorkbookFileId_fkey', 'uploadedWorkbookFileId', 'UploadedWorkbookFile', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='WorkbookTemplateValidation_uploadedWorkbookFileId_fkey' AND table_name='WorkbookTemplateValidation') THEN
        ALTER TABLE "public"."WorkbookTemplateValidation" ADD CONSTRAINT "WorkbookTemplateValidation_uploadedWorkbookFileId_fkey" FOREIGN KEY ("uploadedWorkbookFileId") REFERENCES "public"."UploadedWorkbookFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('WorkbookTemplateValidation', 'WorkbookTemplateValidation_uploadedWorkbookFileId_fkey', 'uploadedWorkbookFileId', 'UploadedWorkbookFile', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='WorkbookVersion_uploadedWorkbookFileId_fkey' AND table_name='WorkbookVersion') THEN
        ALTER TABLE "public"."WorkbookVersion" ADD CONSTRAINT "WorkbookVersion_uploadedWorkbookFileId_fkey" FOREIGN KEY ("uploadedWorkbookFileId") REFERENCES "public"."UploadedWorkbookFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    PERFORM _reconcile_check_fk('WorkbookVersion', 'WorkbookVersion_uploadedWorkbookFileId_fkey', 'uploadedWorkbookFileId', 'UploadedWorkbookFile', 'id', 'CASCADE', 'CASCADE');
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'OnlyOfficeSession_documentKey_key') THEN
        CREATE UNIQUE INDEX "OnlyOfficeSession_documentKey_key" ON "public"."OnlyOfficeSession"("documentKey" ASC);
    END IF;
    PERFORM _reconcile_check_idx('OnlyOfficeSession_documentKey_key', 'OnlyOfficeSession', 'documentKey');
END;
$$;

DROP FUNCTION _reconcile_check_column;
DROP FUNCTION _reconcile_check_fk;
DROP FUNCTION _reconcile_check_idx;