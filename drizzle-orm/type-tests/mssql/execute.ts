import type { IResult } from 'mssql';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
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
	Expect<Equal<typeof none, IResult<never>>>;

	// `'unknown'` - any response (default)
	const unknownRows = await db.execute<'unknown'>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof unknownRows, IResult<Record<string, unknown>>>>;

	const defaultRows = await db.execute(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof defaultRows, IResult<Record<string, unknown>>>>;

	// @ts-expect-error - rows must be objects
	await db.execute<number>(sql`select 1 as id, 'a' as name`);

	// concrete shape - rows of given shape
	const typed = await db.execute<UserInterface>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof typed, IResult<UserInterface>>>;
}
