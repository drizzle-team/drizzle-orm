import type { Results } from '@electric-sql/pglite';
import type * as Effect from 'effect/Effect';
import type { QueryResult } from 'pg';
import type { RowList } from 'postgres';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { BunSQLDatabase } from '~/bun-sql/postgres/index.ts';
import type { EffectDrizzleQueryError } from '~/effect-core/errors.ts';
import type { EffectPgDatabase as EffectPgliteDatabase } from '~/effect-pglite/index.ts';
import type { EffectPgQueryResult } from '~/effect-postgres/index.ts';
import type { NodePgRawExecuteResult } from '~/node-postgres/index.ts';
import type { PgRemoteDatabase } from '~/pg-proxy/index.ts';
import type { PostgresJsDatabase } from '~/postgres-js/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

// Row types declared as interfaces have no implicit index signature
interface UserInterface {
	id: number;
	name: string;
}

type UserAlias = {
	id: number;
	name: string;
};

{
	const objects = await db.execute(sql`select 1 as id, 'a' as name`, 'objects');
	Expect<Equal<typeof objects, Record<string, unknown>[]>>;

	const fromInterface = await db.execute<UserInterface>(sql`select 1 as id, 'a' as name`, 'objects');
	Expect<Equal<typeof fromInterface, UserInterface[]>>;

	const fromAlias = await db.execute<UserAlias>(sql`select 1 as id, 'a' as name`, 'objects');
	Expect<Equal<typeof fromAlias, UserAlias[]>>;

	const arrays = await db.execute<[number, string]>(sql`select 1 as id, 'a' as name`, 'arrays');
	Expect<Equal<typeof arrays, [number, string][]>>;
}

{
	// `never` - statement returns no rows
	const none = await db.execute<never>(sql`insert into t values (1)`);
	Expect<Equal<typeof none, QueryResult<never>>>;

	// `'unknown'` - any response (default)
	const unknownRows = await db.execute<'unknown'>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof unknownRows, NodePgRawExecuteResult>>;

	const defaultRows = await db.execute(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof defaultRows, NodePgRawExecuteResult>>;
	Expect<Equal<NodePgRawExecuteResult, QueryResult<Record<string, unknown>> | QueryResult<Record<string, unknown>>[]>>;

	// @ts-expect-error - rows must be objects
	await db.execute<number>(sql`select 1 as id, 'a' as name`);

	// concrete shape - rows of given shape
	const typed = await db.execute<UserInterface>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof typed, QueryResult<UserInterface>>>;
}

{
	type Raw<T> = Effect.Effect<T, EffectDrizzleQueryError, never>;
	type AsEffect<T> = T extends Effect.Effect<infer A, infer E, infer R> ? Effect.Effect<A, E, R> : T;
	const pglite = {} as EffectPgliteDatabase;

	const none = pglite.execute<never>(`insert into t values (1)`);
	Expect<Equal<AsEffect<typeof none>, Raw<Results<never>>>>;

	const unknownRows = pglite.execute(`select 1 as id, 'a' as name`);
	Expect<Equal<AsEffect<typeof unknownRows>, Raw<Results<Record<string, unknown>>>>>;

	// @ts-expect-error - rows must be objects
	pglite.execute<number>(`select 1 as id, 'a' as name`);

	const typed = pglite.execute<UserInterface>(`select 1 as id, 'a' as name`);
	Expect<Equal<AsEffect<typeof typed>, Raw<Results<UserInterface>>>>;
}

{
	// Drivers responding with an array of rows
	const postgresJs = {} as PostgresJsDatabase;

	const none = await postgresJs.execute<never>(sql`insert into t values (1)`);
	Expect<Equal<typeof none, RowList<never[]>>>;
	Expect<Equal<typeof none['count'], number>>;

	const unknownRows = await postgresJs.execute(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof unknownRows, RowList<Record<string, unknown>[]> | RowList<Record<string, unknown>[]>[]>>;

	const typed = await postgresJs.execute<UserInterface>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof typed, RowList<UserInterface[]>>>;
}

{
	// Drivers responding with an array of rows
	const bun = {} as BunSQLDatabase;

	const none = await bun.execute<never>(sql`insert into t values (1)`);
	Expect<Equal<typeof none, []>>;

	const unknownRows = await bun.execute(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof unknownRows, Record<string, unknown>[] | Record<string, unknown>[][]>>;

	const typed = await bun.execute<UserInterface>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof typed, UserInterface[]>>;
}

{
	// Drivers responding with an array of rows
	const proxy = {} as PgRemoteDatabase;

	const none = await proxy.execute<never>(sql`insert into t values (1)`);
	Expect<Equal<typeof none, []>>;

	const unknownRows = await proxy.execute(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof unknownRows, Record<string, unknown>[]>>;

	const typed = await proxy.execute<UserInterface>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof typed, UserInterface[]>>;
}

{
	Expect<Equal<EffectPgQueryResult<never>['rows'], readonly []>>;
	Expect<Equal<EffectPgQueryResult<UserInterface>['rows'], readonly UserInterface[]>>;
}
