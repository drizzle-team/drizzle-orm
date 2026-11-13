import type { FieldPacket, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type {
	SingleStoreRawQueryResult as SingleStoreRemoteRawQueryResult,
	SingleStoreRemoteDatabase,
	SingleStoreRemoteRawExecuteResult,
} from '~/singlestore-proxy/index.ts';
import type { SingleStoreRawExecuteResult, SingleStoreRawQueryResult } from '~/singlestore/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

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
	const raw = await db.execute(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof raw, SingleStoreRawExecuteResult>>;
	Expect<
		Equal<
			typeof raw,
			| [ResultSetHeader, undefined]
			| [RowDataPacket[], FieldPacket[]]
			| [(ResultSetHeader | RowDataPacket[])[], (FieldPacket[] | undefined)[]]
		>
	>;

	const [result, fields] = raw;
	// @ts-expect-error - result may be a `ResultSetHeader` or rows of a multi-statement query
	result[0].id;

	if (fields === undefined) {
		Expect<Equal<typeof result, ResultSetHeader>>;
	}
}

{
	// `never` - statement returns no rows
	const none = await db.execute<never>(sql`insert into t values (1)`);
	Expect<Equal<typeof none, SingleStoreRawQueryResult>>;

	// `'unknown'` - any response (default)
	const unknownRows = await db.execute<'unknown'>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof unknownRows, SingleStoreRawExecuteResult>>;

	const defaultRows = await db.execute(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof defaultRows, SingleStoreRawExecuteResult>>;

	// @ts-expect-error - rows must be objects
	await db.execute<number>(sql`select 1 as id, 'a' as name`);

	// concrete shape - rows of given shape
	const typed = await db.execute<UserInterface>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof typed, [UserInterface[], FieldPacket[]]>>;
}

{
	// Statements that never return rows stay narrow
	const insert = await db.insert(users).values({ homeCity: 1, class: 'A', age1: 1, enumCol: 'a' });
	Expect<Equal<typeof insert, SingleStoreRawQueryResult>>;
	Expect<Equal<typeof insert, [ResultSetHeader, undefined]>>;

	const [{ insertId }] = insert;
	Expect<Equal<typeof insertId, number>>;

	const update = await db.update(users).set({ age1: 2 });
	Expect<Equal<typeof update, SingleStoreRawQueryResult>>;

	const del = await db.delete(users);
	Expect<Equal<typeof del, SingleStoreRawQueryResult>>;
}

{
	const proxy = {} as SingleStoreRemoteDatabase;

	const none = await proxy.execute<never>(sql`insert into t values (1)`);
	Expect<Equal<typeof none, SingleStoreRemoteRawQueryResult>>;

	const unknownRows = await proxy.execute(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof unknownRows, SingleStoreRemoteRawExecuteResult>>;

	// @ts-expect-error - rows must be objects
	await proxy.execute<number>(sql`select 1 as id, 'a' as name`);

	const typed = await proxy.execute<UserInterface>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof typed, [UserInterface[], FieldPacket[]]>>;
}
