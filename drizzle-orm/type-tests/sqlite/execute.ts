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
	const all = db.all(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof all, Record<string, unknown>[]>>;

	const allInterface = db.all<UserInterface>(sql`select 1 as id, 'a' as name`, 'objects');
	Expect<Equal<typeof allInterface, UserInterface[]>>;

	const allAlias = db.all<UserAlias>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof allAlias, UserAlias[]>>;

	const allArrays = db.all<[number, string]>(sql`select 1 as id, 'a' as name`, 'arrays');
	Expect<Equal<typeof allArrays, [number, string][]>>;

	// @ts-expect-error - objects mode rows must be objects
	db.all<number>(sql`select 1`);
}

{
	const get = db.get(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof get, Record<string, unknown>>>;

	const getInterface = db.get<UserInterface>(sql`select 1 as id, 'a' as name`, 'objects');
	Expect<Equal<typeof getInterface, UserInterface>>;

	const getAlias = db.get<UserAlias>(sql`select 1 as id, 'a' as name`);
	Expect<Equal<typeof getAlias, UserAlias>>;

	const getArrays = db.get<[number, string]>(sql`select 1 as id, 'a' as name`, 'arrays');
	Expect<Equal<typeof getArrays, [number, string]>>;

	// @ts-expect-error - objects mode rows must be objects
	db.get<number>(sql`select 1`);
}
