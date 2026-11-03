import { prisma } from '@/lib/prisma';
const NOISE_TERMS = [
  'none detected', 'no items', 'no matching items', 'all types', 'all logs', 
  'basic info', 'back to upload', 'analysis failed', 'no active project selected',
  'basic information', 'please select', 'all uploaded files'
];

const UI_ACTION_TERMS = [
  'add new user', 'add role', 'submit for approval', 'active purchase orders', 'approved payslips',
  'save changes', 'cancel', 'delete', 'edit', 'view details', 'download', 'upload', 'create new',
  'add dependency', 'add payroll bank account', 'approve', 'activate', 'action', 'actions',
  'account details', 'account summary'
];

const ENUM_STATUS_TERMS = [
  'active', 'inactive', 'pending', 'approved', 'rejected', 'not started', 'completed', 
  'normal', 'critical', 'high risk', 'low risk', 'draft', 'in progress',
  'blocked', 'awaiting execution', 'awaiting settlement', 'awaiting warehouse', 'blacklisted', 'default'
];

export class AiRagCleanupService {
  /**
   * Scans the registry, finds duplicates based on normalizedKeyword + keywordType,
   * and merges aliases while preserving the canonical row.
   */
  static async scanAndMergeDuplicates(runBy: string, executeMerge: boolean = false) {
    let duplicateGroupsFound = 0;
    let rowsMerged = 0;
    let aliasesMerged = 0;

    // Group by normalizedKeyword + keywordType
    const duplicateGroups = await prisma.aiRagKeywordRegistry.groupBy({
      by: ['normalizedKeyword', 'keywordType'],
      _count: { id: true },
      where: { isActive: true },
      having: { id: { _count: { gt: 1 } } }
    });

    duplicateGroupsFound = duplicateGroups.length;

    for (const group of duplicateGroups) {
      const records = await prisma.aiRagKeywordRegistry.findMany({
        where: { 
          normalizedKeyword: group.normalizedKeyword, 
          keywordType: group.keywordType,
          isActive: true
        }
      });

      if (records.length <= 1) continue;

      const hasVal = (val: any) => val && val.length > 0 && val !== '[]' && val !== '-';

      // Sort to find the BEST canonical row
      records.sort((a, b) => {
        // 1. Row with aliases wins
        const aHasAliases = hasVal(a.aliases);
        const bHasAliases = hasVal(b.aliases);
        if (aHasAliases && !bHasAliases) return -1;
        if (!aHasAliases && bHasAliases) return 1;

        // 2. Row with synonyms wins
        const aHasSynonyms = hasVal(a.synonyms);
        const bHasSynonyms = hasVal(b.synonyms);
        if (aHasSynonyms && !bHasSynonyms) return -1;
        if (!aHasSynonyms && bHasSynonyms) return 1;

        // 3. Table mapped wins
        if (a.databaseTable && !b.databaseTable) return -1;
        if (!a.databaseTable && b.databaseTable) return 1;

        // 4. Strictest Access Level
        const scores: any = { 'SUPER_ADMIN_ONLY': 6, 'EXECUTIVE_ONLY': 5, 'CONFIDENTIAL': 4, 'RESTRICTED': 3, 'INTERNAL': 2, 'PUBLIC': 1 };
        const scoreA = scores[a.confidentialityLevel] || 0;
        const scoreB = scores[b.confidentialityLevel] || 0;
        if (scoreA !== scoreB) return scoreB - scoreA;

        // 5. Oldest wins
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

      let canonical = records[0];
      const duplicatesToMerge = records.filter(r => r.id !== canonical.id);
      
      let mergedAliases = new Set<string>();
      if (hasVal(canonical.aliases)) {
        try { JSON.parse(canonical.aliases!).forEach((a: string) => mergedAliases.add(a)); } catch(e){ mergedAliases.add(canonical.aliases!); }
      }

      // Collect aliases from duplicates
      for (const dup of duplicatesToMerge) {
        if (hasVal(dup.aliases)) {
          try {
            const arr = JSON.parse(dup.aliases!);
            if (Array.isArray(arr)) {
              arr.forEach((a: string) => {
                mergedAliases.add(a);
                aliasesMerged++;
              });
            }
          } catch(e){}
        }
      }

      if (executeMerge) {
        // Update canonical
        await prisma.aiRagKeywordRegistry.update({
          where: { id: canonical.id },
          data: {
            aliases: JSON.stringify(Array.from(mergedAliases)),
            cleanupNotes: `Merged ${duplicatesToMerge.length} duplicate rows on ${new Date().toISOString()}`
          }
        });

        // Mark duplicates as inactive
        for (const dup of duplicatesToMerge) {
          await prisma.aiRagKeywordRegistry.update({
            where: { id: dup.id },
            data: {
              isActive: false,
              mergedIntoId: canonical.id,
              mergedAt: new Date()
            }
          });
          rowsMerged++;
        }
      } else {
        rowsMerged += duplicatesToMerge.length;
      }
    }

    return { duplicateGroupsFound, rowsMerged, aliasesMerged };
  }

  /**
   * Identifies keywords that are actually table fields (e.g. AccountsPayable.amount) 
   * and migrates them to the new SchemaMap/UI tables.
   */
  static async migrateNoisyTerms(runBy: string, executeMerge: boolean = false) {
    let schemaFieldsMoved = 0;
    let uiLabelsMoved = 0;
    let noiseTermsExcluded = 0;
    let acronymsFixed = 0;

    const allActive = await prisma.aiRagKeywordRegistry.findMany({ where: { isActive: true } });

    for (const record of allActive) {
      const keyword = record.keyword.toLowerCase();
      
      // 1. Check for UI Action Terms
      const isUiTerm = UI_ACTION_TERMS.some(t => keyword.includes(t));
      if (isUiTerm) {
        if (executeMerge) {
          await prisma.aiUiActionRegistry.upsert({
            where: { normalizedLabel_actionType: { normalizedLabel: record.normalizedKeyword, actionType: 'button' } },
            create: { uiLabel: record.keyword, normalizedLabel: record.normalizedKeyword, actionType: 'button' },
            update: {}
          });
          await prisma.aiRagKeywordRegistry.update({ where: { id: record.id }, data: { isActive: false, cleanupNotes: 'Moved to UI Action Registry' } });
        }
        uiLabelsMoved++;
        continue;
      }

      // 2. Check for Enum/Status Terms
      const isEnumTerm = ENUM_STATUS_TERMS.includes(keyword);
      if (isEnumTerm) {
        if (executeMerge) {
          await prisma.aiSystemEnumRegistry.upsert({
            where: { normalizedValue_enumCategory: { normalizedValue: record.normalizedKeyword, enumCategory: 'STATUS' } },
            create: { enumValue: record.keyword, normalizedValue: record.normalizedKeyword, enumCategory: 'STATUS' },
            update: {}
          });
          await prisma.aiRagKeywordRegistry.update({ where: { id: record.id }, data: { isActive: false, cleanupNotes: 'Moved to Enum Registry' } });
        }
        uiLabelsMoved++; // Grouping enums under UI moves for the report
        continue;
      }

      // 3. Check for Noise Terms
      const isNoise = NOISE_TERMS.some(t => keyword.includes(t));
      if (isNoise) {
        if (executeMerge) {
          await prisma.aiRagNoiseExclusion.upsert({
            where: { normalizedTerm: record.normalizedKeyword },
            create: { noiseTerm: record.keyword, normalizedTerm: record.normalizedKeyword, reason: 'Excluded by cleanup script' },
            update: {}
          });
          await prisma.aiRagKeywordRegistry.update({ where: { id: record.id }, data: { isActive: false, cleanupNotes: 'Moved to Noise Exclusion' } });
        }
        noiseTermsExcluded++;
        continue;
      }

      // 4. Migrate Schema Fields
      if (record.keywordType === 'database_field' && record.databaseTable && record.databaseField) {
        if (executeMerge) {
          // Push to Schema Map
          await prisma.aiRagSchemaMap.upsert({
            where: { tableName_fieldName: { tableName: record.databaseTable, fieldName: record.databaseField } },
            create: {
              moduleName: 'auto_migrated',
              tableName: record.databaseTable,
              fieldName: record.databaseField,
              fieldAlias: record.keyword,
              dataType: 'String', // Defaulting as we don't have the Prisma type here
              searchable: true,
              confidential: record.confidentialityLevel === 'CONFIDENTIAL' || record.confidentialityLevel === 'RESTRICTED'
            },
            update: {}
          });

          // Deactivate in main registry
          await prisma.aiRagKeywordRegistry.update({
            where: { id: record.id },
            data: { isActive: false, cleanupNotes: 'Migrated to Schema Map' }
          });
        }
        schemaFieldsMoved++;
        continue;
      }

      // 5. Fix Acronyms
      const acronyms = [
        'AI', 'BOQ', 'BIR', 'DTR', 'PO', 'PR', 'MRF', 'RFQ', 'MIS', 'DR', 'JO', 'VO', 
        'EOT', 'AP', 'AR', 'GL', 'COA', 'JE', 'CV', 'OR', 'SSS', 'HDMF', 'VAT', 'EWT'
      ];
      
      let fixedKeyword = record.keyword;
      let acronymFixed = false;
      
      for (const acronym of acronyms) {
        const spaced = acronym.split('').join(' ').toLowerCase(); // e.g. "a i", "b o q"
        const underscore = acronym.split('').join('_').toLowerCase(); // e.g. "a_i", "b_o_q"
        
        if (fixedKeyword.includes(spaced) || fixedKeyword.includes(underscore)) {
          // Replace using word boundaries or just replace all instances
          fixedKeyword = fixedKeyword.replace(new RegExp(spaced, 'g'), acronym);
          fixedKeyword = fixedKeyword.replace(new RegExp(underscore, 'g'), acronym);
          acronymFixed = true;
        }
      }

      if (acronymFixed) {
        if (executeMerge) {
          await prisma.aiRagKeywordRegistry.update({
            where: { id: record.id },
            data: { keyword: fixedKeyword, normalizedKeyword: fixedKeyword.toLowerCase().replace(/[^a-z0-9]/g, '_') }
          });
        }
        acronymsFixed++;
      }
    }

    return { schemaFieldsMoved, uiLabelsMoved, noiseTermsExcluded, acronymsFixed };
  }

  static async restoreAliasesFromDisabledDuplicates() {
    let aliasesRestored = 0;
    let activeRowsRepaired = 0;

    // Find all active rows where aliases is basically empty
    const emptyActiveRows = await prisma.aiRagKeywordRegistry.findMany({
      where: {
        isActive: true,
        OR: [
          { aliases: null },
          { aliases: '' },
          { aliases: '[]' },
          { aliases: '-' }
        ]
      }
    });

    for (const activeRow of emptyActiveRows) {
      // Find disabled duplicates that match the signature
      const disabledDuplicates = await prisma.aiRagKeywordRegistry.findMany({
        where: {
          normalizedKeyword: activeRow.normalizedKeyword,
          keywordType: activeRow.keywordType,
          isActive: false,
          NOT: [
            { aliases: null },
            { aliases: '' },
            { aliases: '[]' },
            { aliases: '-' }
          ]
        }
      });

      if (disabledDuplicates.length === 0) continue;

      let mergedAliases = new Set<string>();
      let mergedSynonyms = new Set<string>();
      let mergedAbbreviations = new Set<string>();
      
      const tryAdd = (set: Set<string>, val: string | null) => {
        if (!val || val === '[]' || val === '-') return;
        try { JSON.parse(val).forEach((v: string) => set.add(v)); } catch(e) { set.add(val); }
      };

      for (const dup of disabledDuplicates) {
        tryAdd(mergedAliases, dup.aliases);
        tryAdd(mergedSynonyms, dup.synonyms);
        tryAdd(mergedAbbreviations, dup.abbreviations);
        aliasesRestored += mergedAliases.size; // rough count
      }

      if (mergedAliases.size > 0 || mergedSynonyms.size > 0) {
        await prisma.aiRagKeywordRegistry.update({
          where: { id: activeRow.id },
          data: {
            aliases: JSON.stringify(Array.from(mergedAliases)),
            synonyms: JSON.stringify(Array.from(mergedSynonyms)),
            abbreviations: JSON.stringify(Array.from(mergedAbbreviations)),
            cleanupNotes: `Aliases restored from disabled duplicate on ${new Date().toISOString()}`
          }
        });

        // Ensure the disabled duplicate is linked to this canonical row
        for (const dup of disabledDuplicates) {
          await prisma.aiRagKeywordRegistry.update({
            where: { id: dup.id },
            data: { mergedIntoId: activeRow.id }
          });
        }
        
        activeRowsRepaired++;
      }
    }

    return { activeRowsRepaired, aliasesRestored };
  }

  static async runFullCleanup(runBy: string) {
    const totalRowsScanned = await prisma.aiRagKeywordRegistry.count({ where: { isActive: true } });
    
    // First, fix noise and UI terms
    const noiseResults = await this.migrateNoisyTerms(runBy, true);
    
    // Then, merge pure semantic duplicates
    const mergeResults = await this.scanAndMergeDuplicates(runBy, true);

    // Finally, restore aliases to any canonical rows that were left empty
    const repairResults = await this.restoreAliasesFromDisabledDuplicates();

    const activeRowsRemaining = await prisma.aiRagKeywordRegistry.count({ where: { isActive: true } });

    // Generate Report
    const report = await prisma.aiRegistryCleanupReport.create({
      data: {
        runBy,
        totalRowsScanned,
        duplicateGroupsFound: mergeResults.duplicateGroupsFound,
        rowsMerged: mergeResults.rowsMerged,
        aliasesMerged: mergeResults.aliasesMerged + repairResults.aliasesRestored,
        schemaFieldsMoved: noiseResults.schemaFieldsMoved,
        uiLabelsMoved: noiseResults.uiLabelsMoved,
        noiseTermsExcluded: noiseResults.noiseTermsExcluded,
        acronymsFixed: noiseResults.acronymsFixed,
        activeRowsRemaining,
      }
    });

    return report;
  }

  static async rollbackCleanup(reportId: string) {
    const report = await prisma.aiRegistryCleanupReport.findUnique({ where: { id: reportId } });
    if (!report || !report.rollbackSupported) return false;

    // Reactivate keywords that were merged around this runAt time
    const mergedKeywords = await prisma.aiRagKeywordRegistry.findMany({
      where: { 
        isActive: false, 
        mergedAt: { gte: new Date(report.runAt.getTime() - 10000) } // Window around run time
      }
    });

    for (const kw of mergedKeywords) {
      await prisma.aiRagKeywordRegistry.update({
        where: { id: kw.id },
        data: { isActive: true, mergedIntoId: null, mergedAt: null, cleanupNotes: 'Rolled back' }
      });
    }

    await prisma.aiRegistryCleanupReport.update({
      where: { id: report.id },
      data: { rolledBackAt: new Date() }
    });

    return true;
  }
}
