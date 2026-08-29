import { defineRelations } from 'drizzle-orm';
import type { NodeCockroachDatabase } from 'drizzle-orm/cockroach';
import { drizzle } from 'drizzle-orm/cockroach';
import type {
	AnyRelationsBuilderConfig,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	RelationsBuilder,
} from 'drizzle-orm/relations';
import { Pool } from 'pg';
import { test as base } from 'vitest';

export function requireCockroachConnectionString(): string {
	const url = process.env['COCKROACH_CONNECTION_STRING'];
	if (!url) {
		throw new Error(
			'COCKROACH_CONNECTION_STRING is not set. Bring DBs up with `bash compose/dockers.sh up cockroach` and export the connection string before running tests.',
		);
	}
	return url;
}

type CockroachSchema = Record<string, unknown>;

export const _push = async (
	query: (sql: string, params: any[]) => Promise<any[]>,
	schema: any,
	log?: 'statements',
) => {
	const { diff } = await import('../../../drizzle-kit/tests/cockroach/mocks' as string);

	const res = await diff({}, schema, []);

	for (const s of res.sqlStatements) {
		if (log === 'statements') console.log(s);
		await query(s, []).catch((e) => {
			console.error(s);
			console.error(e);
			throw e;
		});
	}
};

export const test = base.extend<{
	kit: {
		client: Pool;
		query: (sql: string, params?: any[]) => Promise<any[]>;
	};
	push: (schema: any, params?: { log: 'statements' }) => Promise<void>;
	db: NodeCockroachDatabase<Record<string, never>>;
	createDB: {
		<S extends CockroachSchema>(schema: S): NodeCockroachDatabase<ReturnType<typeof defineRelations<S>>>;
		<S extends CockroachSchema, TConfig extends AnyRelationsBuilderConfig>(
			schema: S,
			cb: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => TConfig,
			useJitMappers?: boolean,
		): NodeCockroachDatabase<ExtractTablesWithRelations<TConfig, ExtractTablesFromSchema<S>>>;
	};
}>({
	kit: [
		// oxlint-disable-next-line no-empty-pattern
		async ({}, use) => {
			const client = new Pool({ connectionString: requireCockroachConnectionString() });

			const { rows: tables } = await client.query<{ table_name: string }>(
				`select table_name from information_schema.tables where table_schema = 'public'`,
			);
			for (const { table_name } of tables) {
				await client.query(`drop table if exists "${table_name}" cascade`);
			}
			const { rows: enums } = await client.query<{ typname: string }>(
				`select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
				 where n.nspname = 'public' and t.typtype = 'e'`,
			);
			for (const { typname } of enums) {
				await client.query(`drop type if exists "${typname}"`);
			}

			try {
				await use({
					client,
					query: async (sql, params) => (await client.query(sql, params)).rows,
				});
			} finally {
				await client.end();
			}
		},
		{ scope: 'file' },
	],
	push: [
		async ({ kit }, use) => {
			await use((schema, params) => _push(kit.query, schema, params?.log));
		},
		{ scope: 'test' },
	],
	db: [
		async ({ kit }, use) => {
			await use(drizzle({ client: kit.client as any }) as any);
		},
		{ scope: 'test' },
	],
	createDB: [
		async ({ kit }, use) => {
			const createDB = <S extends CockroachSchema>(
				schema: S,
				cb?: (helpers: RelationsBuilder<ExtractTablesFromSchema<S>>) => AnyRelationsBuilderConfig,
				useJitMappers?: boolean,
			) => {
				const relations = cb ? defineRelations(schema, cb as any) : defineRelations(schema);

				return drizzle({ client: kit.client as any, relations, jit: useJitMappers });
			};

			await use(createDB as any);
		},
		{ scope: 'test' },
	],
});

export type Test = typeof test;
