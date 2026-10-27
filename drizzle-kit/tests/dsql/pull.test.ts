import { sql } from 'drizzle-orm';
import {
	bigint,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgRole,
	pgSchema,
	text,
	uniqueIndex,
	uuid,
} from 'drizzle-orm/pg-core';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runWithCliContext } from 'src/cli/context';
import { DsqlInvalidObjectsError } from 'src/cli/errors';
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import {
	assertNothingLeft,
	connect,
	credentials,
	dropRun,
	type DsqlDB,
	isValidIndex,
	migrations,
	pushAndSettle,
	pushTo,
	roleFilter,
	runId,
	runSchemas,
} from './mocks';

const s = runId;
const schema = pgSchema(s);
const reader = `${runId}_reader`;
const roles = [reader];
const tmp = join(__dirname, 'tmp', runId);

// Every DSQL index build and constraint validation is an async job that takes several seconds.
vi.setConfig({ testTimeout: 600_000, hookTimeout: 600_000 });

let db: DsqlDB;

beforeAll(async () => {
	db = await connect();
	await dropRun(db, roles);
});

beforeEach(async () => {
	await dropRun(db, roles);
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });
});

afterAll(async () => {
	await dropRun(db, roles);
	await assertNothingLeft(db);
	rmSync(tmp, { recursive: true, force: true });
});

const pull = async (out: string) => {
	const { handle } = await import('src/cli/commands/pull-postgres');
	return runWithCliContext({ output: 'json', interactive: false }, () =>
		handle(
			'camel',
			out,
			true,
			credentials(),
			{
				tables: undefined,
				schemas: runSchemas,
				entities: roleFilter(['admin', ...roles]),
				extensions: undefined,
			} as never,
			migrations,
			false,
			db,
		));
};

const parent = schema.table('parent', {
	id: bigint({ mode: 'number' }).primaryKey().generatedByDefaultAsIdentity({ cache: 65536 }),
	name: text().notNull(),
	data: jsonb(),
	price: numeric({ precision: 12, scale: 2 }),
}, (t) => [
	uniqueIndex('parent_lower_name_idx').on(sql`lower(${t.name})`),
	index('parent_price_idx').on(t.price).where(sql`${t.price} > 0`),
]);
const child = schema.table('child', {
	id: uuid().primaryKey(),
	parentId: bigint('parent_id', { mode: 'number' }),
	position: integer(),
}, (t) => [foreignKey({ name: 'child_parent_fk', columns: [t.parentId], foreignColumns: [parent.id] })]);
const pulled = {
	schema,
	parent,
	child,
	counter: schema.sequence('counter', { cache: 65536, increment: 2 }),
	reader: pgRole(reader, { canLogin: true }),
};

test('pull writes a schema that pushes back unchanged, and the DSQL form of it as a migration', async () => {
	await pushAndSettle(db, pulled, { roles });

	await pull(tmp);

	const schemaTs = readFileSync(join(tmp, 'schema.ts'), 'utf8');
	expect(schemaTs).toContain('.using("btree", sql`lower(name)`)');
	expect(schemaTs).toContain(`pgRole("${reader}", { canLogin: true })`);
	expect(schemaTs).not.toContain('pgRole("admin"');
	expect(schemaTs).not.toContain('btree_index');
	expect(schemaTs).toContain('cache: 65536');

	const folder = readdirSync(tmp).find((it) => existsSync(join(tmp, it, 'migration.sql')))!;
	const migration = readFileSync(join(tmp, folder, 'migration.sql'), 'utf8');
	expect(migration).toContain(`CREATE UNIQUE INDEX ASYNC "parent_lower_name_idx" ON "${s}"."parent" (lower(name));`);
	expect(migration).toContain(
		`ALTER TABLE "${s}"."child" ADD CONSTRAINT "child_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "${s}"."parent"("id") NOT VALID;`,
	);
	expect(migration).toContain(`ALTER TABLE ASYNC "${s}"."child" VALIDATE CONSTRAINT "child_parent_fk";`);

	const generated = await import(join(tmp, 'schema.ts'));
	expect(await pushTo(db, generated, { roles })).toStrictEqual([]);
});

test('pull refuses to write anything while an index is invalid', async () => {
	await pushAndSettle(db, { schema, tags: schema.table('tags', { id: uuid().primaryKey(), name: text() }) });
	await db.query(`INSERT INTO "${s}"."tags" VALUES (gen_random_uuid(), 'a'), (gen_random_uuid(), 'a');`);
	const [{ job_id }] = await db.query<{ job_id: string }>(
		`CREATE UNIQUE INDEX ASYNC "tags_name_key" ON "${s}"."tags" ("name");`,
	);
	await db.query('CALL sys.wait_for_job($1)', [job_id]);
	expect(await isValidIndex(db, s, 'tags_name_key')).toBe(false);

	const error = await pull(tmp).catch((e) => e);

	expect(error).toBeInstanceOf(DsqlInvalidObjectsError);
	expect(error.meta.indexes).toStrictEqual([`${s}.tags.tags_name_key`]);
	expect(readdirSync(tmp)).toStrictEqual([]);
});
