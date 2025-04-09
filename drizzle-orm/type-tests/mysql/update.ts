import { type Equal, Expect } from 'type-tests/utils.ts';
import type { MySqlUpdate } from '~/mysql-core/index.ts';
import type { MySqlRawQueryResult } from '~/mysql2/session.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

{
	function dynamic<T extends MySqlUpdate>(qb: T) {
		return qb.where(sql``);
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<MySqlRawQueryResult, typeof result>>;
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
