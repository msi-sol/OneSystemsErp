import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const schema = readFileSync(join(root, 'prisma', 'schema.prisma'), 'utf8');
const migrationsRoot = join(root, 'prisma', 'migrations');
const migrations = readdirSync(migrationsRoot)
  .filter((name) => name !== 'migration_lock.toml' && name !== '20261103000000_mysql_baseline')
  .map((name) => readFileSync(join(migrationsRoot, name, 'migration.sql'), 'utf8'))
  .join('\n');

// A plain Prisma String is VARCHAR(191) on MySQL. These columns hold serialized
// JSON or document text that is routinely longer, and overflowing them rolls
// back the business transaction or silently drops indexed content.
const LONG_TEXT_COLUMNS: Array<[string, string, 'NULL' | 'NOT NULL']> = [
  ['NotebookReferenceVersion', 'extractedText', 'NULL'],
  ['NotebookReferenceVersion', 'aiKeywords', 'NULL'],
  ['AuditLog', 'oldValue', 'NULL'],
  ['AuditLog', 'newValue', 'NULL'],
  ['AiKnowledgeSource', 'allowedRoles', 'NULL'],
  ['AiKnowledgeSource', 'allowedProjects', 'NULL'],
  ['AiKnowledgeChunk', 'chunkText', 'NOT NULL'],
  ['AiKnowledgeChunk', 'allowedRoles', 'NULL'],
  ['AiKnowledgeChunk', 'vectorEmbedding', 'NOT NULL'],
  ['AiRagEmbedding', 'embeddingVector', 'NOT NULL'],
  ['ProjectSchedule', 'holidays', 'NULL'],
  ['ScheduleActivity', 'predecessorData', 'NULL'],
  ['AiChatMessage', 'citedSources', 'NULL'],
  ['AiRagKeywordRegistry', 'businessMeaning', 'NULL'],
  ['AiRagKeywordRegistry', 'synonyms', 'NULL'],
  ['AiRagKeywordRegistry', 'aliases', 'NULL'],
  ['AiRagKeywordRegistry', 'abbreviations', 'NULL'],
  ['AiRagKeywordRegistry', 'relatedTerms', 'NULL'],
  ['AiRagKeywordRegistry', 'exampleUserQuestions', 'NULL'],
  ['AiRagKeywordRegistry', 'requiredRoleAccess', 'NULL'],
  ['AiRagSchemaMap', 'requiredAccessRole', 'NULL'],
  ['AiKnowledgeMap', 'businessMeaning', 'NULL'],
  ['AiKnowledgeMap', 'detectedKeywords', 'NULL'],
  ['AiKnowledgeMap', 'generatedAliases', 'NULL'],
  ['AiKnowledgeMap', 'generatedSynonyms', 'NULL'],
  ['AiKnowledgeMap', 'abbreviations', 'NULL'],
  ['AiKnowledgeMap', 'relatedTerms', 'NULL'],
  ['AiKnowledgeMap', 'relatedModules', 'NULL'],
  ['AiKnowledgeMap', 'relatedTables', 'NULL'],
  ['AiKnowledgeMap', 'relatedFields', 'NULL'],
  ['AiKnowledgeMap', 'sampleQuestions', 'NULL'],
  ['AiKnowledgeMap', 'requiredRole', 'NULL'],
  ['AiComparisonMap', 'userQuestionPattern', 'NULL'],
  ['AiComparisonMap', 'relatedModules', 'NULL'],
  ['AiComparisonMap', 'relatedTables', 'NULL'],
  ['AiComparisonMap', 'relatedFields', 'NULL'],
  ['AiUiActionRegistry', 'aliases', 'NULL'],
  ['AiSystemEnumRegistry', 'aliases', 'NULL'],
  ['SecurityIncident', 'relatedEventIds', 'NULL'],
  ['ScheduleGenerationAudit', 'tokenUsage', 'NULL'],
];

function fieldLine(model: string, field: string): string {
  const start = schema.indexOf(`model ${model} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  const block = schema.slice(start, schema.indexOf('\n}', start));
  const line = block.split(/\r?\n/).find((candidate) => candidate.trim().split(/\s+/)[0] === field);
  if (!line) throw new Error(`${model}.${field} is missing`);
  return line;
}

describe('MySQL long text columns', () => {
  it.each(LONG_TEXT_COLUMNS)('%s.%s keeps its nullability as LONGTEXT in the schema', (model, field, nullability) => {
    const line = fieldLine(model, field);
    expect(line).toContain('@db.LongText');
    expect(line).toContain(nullability === 'NULL' ? 'String?' : 'String ');
  });

  it.each(LONG_TEXT_COLUMNS)('%s.%s has a forward migration matching the schema', (model, field, nullability) => {
    const statement = migrations.split(';').find((sql) => sql.includes(`ALTER TABLE \`${model}\``) && sql.includes(`\`${field}\``));
    expect(statement).toContain(`MODIFY \`${field}\` LONGTEXT ${nullability}`);
  });

  it('leaves audit tables whose value columns have no long writers unchanged', () => {
    expect(fieldLine('PayrollAuditLog', 'newValue')).not.toContain('@db.LongText');
    expect(fieldLine('KnowledgeAuditTrail', 'newValue')).not.toContain('@db.LongText');
  });
});
