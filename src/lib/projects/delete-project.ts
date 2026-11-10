// Only raw SQL is used, so any Prisma client (plain or extended) fits.
type RawSql = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
};
type ProjectDeleteClient = RawSql & {
  $transaction<R>(fn: (tx: RawSql) => Promise<R>, options?: { timeout?: number; maxWait?: number }): Promise<R>;
};

// Deletes one project and every row that belongs to it, in one transaction:
// - rows in any table with a projectId column (many have no database foreign key to Project),
// - rows that point at a deleted row through a cascading or restricting foreign key, followed until nothing new is found,
// - audit and history rows recorded against a deleted row (transactionId).
// Foreign keys marked SET NULL are cleared instead, so shared records (suppliers, users, ...) stay.
// Files in storage are not removed.

const quote = (name: string) => '`' + name.replace(/`/g, '') + '`';
const CHUNK = 500;

type ForeignKey = { t: string; c: string; rt: string; rc: string; dr: string };

export async function deleteProjectCompletely(prisma: ProjectDeleteClient, projectId: string) {
  const db = (await prisma.$queryRawUnsafe<{ d: string }[]>('SELECT DATABASE() d'))[0].d;
  const tables = (await prisma.$queryRawUnsafe<{ t: string }[]>(
    `SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_TYPE='BASE TABLE'`, db)).map(r => r.t);
  const realName = new Map(tables.map(t => [t.toLowerCase(), t]));
  const columns = await prisma.$queryRawUnsafe<{ t: string; c: string }[]>(
    `SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND COLUMN_NAME IN ('projectId','transactionId')`, db);
  const hasColumn = (t: string, c: string) => columns.some(r => r.t.toLowerCase() === t.toLowerCase() && r.c === c);
  const primaryKeys = await prisma.$queryRawUnsafe<{ t: string; c: string }[]>(
    `SELECT TABLE_NAME t, COLUMN_NAME c FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND CONSTRAINT_NAME='PRIMARY'`, db);
  const primaryKeyOf = (t: string) => {
    const keys = primaryKeys.filter(r => r.t.toLowerCase() === t.toLowerCase());
    return keys.length === 1 ? keys[0].c : null;
  };
  const foreignKeys: ForeignKey[] = (await prisma.$queryRawUnsafe<ForeignKey[]>(
    `SELECT k.TABLE_NAME t, k.COLUMN_NAME c, k.REFERENCED_TABLE_NAME rt, k.REFERENCED_COLUMN_NAME rc, r.DELETE_RULE dr
     FROM information_schema.KEY_COLUMN_USAGE k
     JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.CONSTRAINT_SCHEMA=k.TABLE_SCHEMA
     WHERE k.TABLE_SCHEMA=? AND k.REFERENCED_TABLE_NAME IS NOT NULL`, db))
    .map(f => ({ ...f, t: realName.get(f.t.toLowerCase()) ?? f.t, rt: realName.get(f.rt.toLowerCase()) ?? f.rt }));

  const projectTable = realName.get('project');
  if (!projectTable) throw new Error('Project table not found.');
  const exists = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM ${quote(projectTable)} WHERE id=?`, projectId);
  if (!exists.length) throw new Error('Project not found.');

  const toDelete = new Map<string, Set<unknown>>();
  const add = (table: string, ids: unknown[]) => {
    if (!toDelete.has(table)) toDelete.set(table, new Set());
    const set = toDelete.get(table)!;
    let added = 0;
    for (const id of ids) if (!set.has(id)) { set.add(id); added++; }
    return added;
  };
  const selectIds = async (table: string, column: string, values: unknown[]) => {
    const pk = primaryKeyOf(table);
    if (!pk || !values.length) return [];
    const out: unknown[] = [];
    for (let i = 0; i < values.length; i += CHUNK) {
      const chunk = values.slice(i, i + CHUNK);
      const rows = await prisma.$queryRawUnsafe<{ id: unknown }[]>(
        `SELECT ${quote(pk)} id FROM ${quote(table)} WHERE ${quote(column)} IN (${chunk.map(() => '?').join(',')})`, ...chunk);
      out.push(...rows.map(r => r.id));
    }
    return out;
  };

  add(projectTable, [projectId]);
  for (const t of tables) if (t !== projectTable && hasColumn(t, 'projectId')) add(t, await selectIds(t, 'projectId', [projectId]));
  for (let round = 0, grew = true; grew && round < 30; round++) {
    grew = false;
    for (const fk of foreignKeys) {
      const parent = toDelete.get(fk.rt);
      if (!parent?.size || fk.dr === 'SET NULL' || fk.rc !== primaryKeyOf(fk.rt)) continue;
      if (add(fk.t, await selectIds(fk.t, fk.c, [...parent])) > 0) grew = true;
    }
  }
  const deletedIds = [...toDelete.values()].flatMap(set => [...set]).filter(v => typeof v === 'string');
  for (const t of tables) if (hasColumn(t, 'transactionId')) add(t, await selectIds(t, 'transactionId', deletedIds));
  const nullify = foreignKeys
    .filter(fk => fk.dr === 'SET NULL' && toDelete.get(fk.rt)?.size && fk.rc === primaryKeyOf(fk.rt))
    .map(fk => ({ table: fk.t, column: fk.c, ids: [...toDelete.get(fk.rt)!] }));

  await prisma.$transaction(async tx => {
    // Same connection for the whole transaction, so the order of the deletes below does not matter.
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
    try {
      for (const n of nullify) for (let i = 0; i < n.ids.length; i += CHUNK) {
        const chunk = n.ids.slice(i, i + CHUNK);
        await tx.$executeRawUnsafe(`UPDATE ${quote(n.table)} SET ${quote(n.column)}=NULL WHERE ${quote(n.column)} IN (${chunk.map(() => '?').join(',')})`, ...chunk);
      }
      for (const [table, set] of toDelete) {
        const pk = primaryKeyOf(table)!;
        const ids = [...set];
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          await tx.$executeRawUnsafe(`DELETE FROM ${quote(table)} WHERE ${quote(pk)} IN (${chunk.map(() => '?').join(',')})`, ...chunk);
        }
      }
    } finally {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    }
  }, { timeout: 300000, maxWait: 30000 });

  return { rows: [...toDelete.values()].reduce((sum, set) => sum + set.size, 0) };
}
