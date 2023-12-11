import { type Equal, Expect } from 'type-tests/utils.ts';
import type { MsSqlUpdate } from '~/mssql-core/index.ts';
import type { MsSqlQueryResult } from '~/node-mssql/session.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

{
	function dynamic<T extends MsSqlUpdate>(qb: T) {
		return qb.where(sql``);
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<MsSqlQueryResult, typeof result>>;
}

{
	db
		.update(users)
		.set({})
		.where(sql``)
		// @ts-expect-error method was already called
		.where(sql``);

	// @ts-expect-error Can't update and identity column
	db.update(users).set({ id: 2 });
}
