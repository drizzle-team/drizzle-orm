import { type Equal, Expect } from 'type-tests/utils.ts';
import type { SingleStoreUpdate } from '~/singlestore-core/index.ts';
import type { SingleStoreRawQueryResult } from '~/singlestore/session.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

{
	function dynamic<T extends SingleStoreUpdate>(qb: T) {
		return qb.where(sql``);
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<SingleStoreRawQueryResult, typeof result>>;
}

{
	db
		.update(users)
		.set({})
		.where(sql``)
		// @ts-expect-error method was already called
		.where(sql``);
}

{
	db.update(users).set({}).where(sql``).limit(1).orderBy(sql``);
}
