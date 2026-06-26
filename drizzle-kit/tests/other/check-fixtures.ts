import { integer as pgInteger, pgTable, varchar } from 'drizzle-orm/pg-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { PostgresSnapshot } from '../../src/dialects/postgres/snapshot';
import { drizzleToDDL, type PostgresSchema } from '../postgres/mocks';

export const ORIGIN = '00000000-0000-0000-0000-000000000000';

export const makePgSnapshot = (id: string, prevIds: string[], schema: PostgresSchema): PostgresSnapshot => ({
	version: '8',
	dialect: 'postgres',
	id,
	prevIds,
	ddl: drizzleToDDL(schema).ddl.entities.list(),
	renames: [],
});

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

export const stageValid = (): string => {
	const out = stageOut();
	writeSnapshot(
		out,
		'0000_init',
		makePgSnapshot('p1', [ORIGIN], { users: pgTable('users', { id: pgInteger('id') }) }),
	);
	return out;
};

export const stageConflict = (): string => {
	const out = stageOut();
	const parent = makePgSnapshot('p1', [ORIGIN], { users: pgTable('users', { email: varchar('email') }) });
	const left = makePgSnapshot('a1', ['p1'], { users: pgTable('users', { email: varchar('email').notNull() }) });
	const right = makePgSnapshot('b1', ['p1'], { users: pgTable('users', { email: pgInteger('email') }) });
	writeSnapshot(out, '0000_parent', parent);
	writeSnapshot(out, '0001_left', left);
	writeSnapshot(out, '0002_right', right);
	return out;
};

// Two branches each create a differently-shaped `orders` table from a shared parent
// that lacks it — a create_table/create_table conflict whose target is the table itself
// (kind 'table'), exercising the table path that stageConflict's column conflict does not.
export const stageTableConflict = (): string => {
	const out = stageOut();
	const base = { users: pgTable('users', { id: pgInteger('id') }) };
	const parent = makePgSnapshot('p1', [ORIGIN], base);
	const left = makePgSnapshot('a1', ['p1'], { ...base, orders: pgTable('orders', { id: pgInteger('id') }) });
	const right = makePgSnapshot('b1', ['p1'], { ...base, orders: pgTable('orders', { total: pgInteger('total') }) });
	writeSnapshot(out, '0000_parent', parent);
	writeSnapshot(out, '0001_left', left);
	writeSnapshot(out, '0002_right', right);
	return out;
};

export const stageUnsupported = (): string => {
	const out = stageOut();
	writeSnapshot(out, '0000_init', { version: '999', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [] });
	return out;
};

export const stageNonLatest = (): string => {
	const out = stageOut();
	writeSnapshot(out, '0000_init', { version: '1', dialect: 'postgres', id: 'p1', prevIds: [ORIGIN], ddl: [] });
	return out;
};

export const stageMalformed = (): string => {
	const out = stageOut();
	writeSnapshot(out, '0000_init', {
		version: '8',
		dialect: 'postgres',
		id: 'p1',
		prevIds: [ORIGIN],
		ddl: 'not-an-array',
	});
	return out;
};
