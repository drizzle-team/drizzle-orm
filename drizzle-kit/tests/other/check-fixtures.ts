import { integer as pgInteger, pgTable, varchar } from 'drizzle-orm/pg-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ddlDiffDry } from '../../src/dialects/postgres/diff';
import type { PostgresSnapshot } from '../../src/dialects/postgres/snapshot';
import { drizzleToDDL, type PostgresSchema } from '../postgres/mocks';

export const ORIGIN = '00000000-0000-0000-0000-000000000000';

// `from` is the schema of the state that the deltas of the snapshot start from. Without it, the snapshot is a base.
export const makePgSnapshot = async (
	id: string,
	prevIds: string[],
	schema: PostgresSchema,
	from?: PostgresSchema,
): Promise<PostgresSnapshot> => {
	const header = { version: '9', dialect: 'postgres', id, prevIds } as const;
	const { ddl } = drizzleToDDL(schema);
	if (!from) return { type: 'base', ...header, ddl: ddl.entities.list() };
	const { deltas } = await ddlDiffDry(drizzleToDDL(from).ddl, ddl, 'default');
	return { type: 'diff', ...header, deltas };
};

export const stageOut = (): string => {
	// staged under tests/tmp/ (in-tree) so drizzle-kit's config-relative path resolution finds the snapshots; do not move to os.tmpdir()
	mkdirSync('tests/tmp', { recursive: true });
	return mkdtempSync('tests/tmp/dk-check-json-');
};

export const writeSnapshot = (out: string, tag: string, snapshot: unknown): void => {
	const folder = join(out, tag);
	mkdirSync(folder, { recursive: true });
	writeFileSync(join(folder, 'snapshot.json'), JSON.stringify(snapshot, null, 2));
};

export const stageValid = async (): Promise<string> => {
	const out = stageOut();
	writeSnapshot(
		out,
		'0000_init',
		await makePgSnapshot('p1', [ORIGIN], { users: pgTable('users', { id: pgInteger('id') }) }),
	);
	return out;
};

export const stageConflict = async (): Promise<string> => {
	const out = stageOut();
	const base = { users: pgTable('users', { email: varchar('email') }) };
	const parent = await makePgSnapshot('p1', [ORIGIN], base);
	const left = await makePgSnapshot(
		'a1',
		['p1'],
		{ users: pgTable('users', { email: varchar('email').notNull() }) },
		base,
	);
	const right = await makePgSnapshot('b1', ['p1'], { users: pgTable('users', { email: pgInteger('email') }) }, base);
	writeSnapshot(out, '0000_parent', parent);
	writeSnapshot(out, '0001_left', left);
	writeSnapshot(out, '0002_right', right);
	return out;
};

// Two branches each create a differently-shaped `orders` table from a shared parent
// that lacks it — a create_table/create_table conflict whose target is the table itself
// (kind 'table'), exercising the table path that stageConflict's column conflict does not.
export const stageTableConflict = async (): Promise<string> => {
	const out = stageOut();
	const base = { users: pgTable('users', { id: pgInteger('id') }) };
	const parent = await makePgSnapshot('p1', [ORIGIN], base);
	const left = await makePgSnapshot(
		'a1',
		['p1'],
		{ ...base, orders: pgTable('orders', { id: pgInteger('id') }) },
		base,
	);
	const right = await makePgSnapshot(
		'b1',
		['p1'],
		{ ...base, orders: pgTable('orders', { total: pgInteger('total') }) },
		base,
	);
	writeSnapshot(out, '0000_parent', parent);
	writeSnapshot(out, '0001_left', left);
	writeSnapshot(out, '0002_right', right);
	return out;
};
