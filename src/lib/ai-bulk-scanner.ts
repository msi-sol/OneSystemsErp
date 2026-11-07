import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { generateObject } from 'ai';
import { openAIModel } from '@/lib/ai/openai-model';
import { z } from 'zod';

// Core models that are most critical to scan to save API quota.
const CORE_MODELS = [
  'Project',
  'PurchaseOrder',
  'Supplier',
  'Expense',
  'SubcontractPackage',
  'PayrollPeriod',
  'DailyTimeRecord',
  'User',
  'MaterialIssuance'
];

export async function runBulkSchemaScanner() {
  const models = Prisma.dmmf.datamodel.models;
  const targetModels = models.filter(m => CORE_MODELS.includes(m.name));

  let totalScanned = 0;
  let totalKeywordsGenerated = 0;

  for (const model of targetModels) {
    // 1. Ask AI for synonyms and ontology mapping
    try {
      const result = await generateObject({
        model: openAIModel(), // app-wide OpenAI model (gpt-6-luna by default)
        schema: z.object({
          businessMeaning: z.string().describe('Short explanation of what this model represents in an ERP.'),
          moduleCategory: z.string().describe('e.g., Procurement, HR, Finance, Project Management'),
          aliases: z.array(z.string()).describe('Common alternate names for this table'),
          synonyms: z.array(z.string()).describe('Similar words used in questions'),
          sampleQuestions: z.array(z.string()).describe('Common user questions regarding this data'),
        }),
        prompt: `Analyze the database table "${model.name}" in an ERP context. What does it represent? Give aliases and synonyms.`
      });

      const aiData = result.object;

      // 2. Save to AiKnowledgeMap
      const knowledgeMap = await prisma.aiKnowledgeMap.create({
        data: {
          sourceType: 'database_schema',
          sourceName: model.name,
          tableName: model.name,
          normalizedName: model.name.toLowerCase(),
          businessMeaning: aiData.businessMeaning,
          generatedAliases: JSON.stringify(aiData.aliases),
          generatedSynonyms: JSON.stringify(aiData.synonyms),
          sampleQuestions: JSON.stringify(aiData.sampleQuestions),
          relatedModules: JSON.stringify([aiData.moduleCategory]),
          lastScannedAt: new Date()
        }
      });
      totalScanned++;

      // 3. Register Keywords in Registry for active RAG
      const allKeywords = [model.name.toLowerCase(), ...aiData.aliases.map(a => a.toLowerCase()), ...aiData.synonyms.map(s => s.toLowerCase())];
      
      for (const kw of allKeywords) {
        // Upsert keyword
        await prisma.aiRagKeywordRegistry.create({
          data: {
            keyword: kw,
            normalizedKeyword: kw,
            keywordType: 'auto_generated_alias',
            databaseTable: model.name,
            moduleName: aiData.moduleCategory,
            businessMeaning: aiData.businessMeaning,
            sourceType: 'AUTO_GENERATED',
            isActive: true
          }
        });
        totalKeywordsGenerated++;
      }

    } catch (e) {
      console.error(`Error scanning model ${model.name}:`, e);
    }
  }

  return { totalScanned, totalKeywordsGenerated };
}
