import { type Equal, Expect } from 'type-tests/utils.ts';
import type { MsSqlUpdate } from '~/mssql-core/index.ts';
import type { MsSqlQueryResult } from '~/node-mssql/session.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';
import { users } from './tables.ts';

const update = await db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
});
Expect<Equal<MsSqlQueryResult, typeof update>>;

const updateStmt = db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).prepare();
const updatePrepared = await updateStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof updatePrepared>>;

const updateSql = await db.update(users).set({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
});
Expect<Equal<MsSqlQueryResult, typeof updateSql>>;

const updateSqlStmt = db.update(users).set({
	homeCity: sql`123`,
	class: 'A',
	age1: 1,
	enumCol: sql`foobar`,
}).prepare();
const updateSqlPrepared = await updateSqlStmt.execute();
Expect<Equal<MsSqlQueryResult, typeof updateSqlPrepared>>;

const updateOutput = await db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).output();
Expect<Equal<typeof users.$inferSelect[], typeof updateOutput>>;

const updateOutputWithTrue = await db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).output({ deleted: true, inserted: true });
Expect<
	Equal<{
		inserted: typeof users.$inferSelect;
		deleted: typeof users.$inferSelect;
	}[], typeof updateOutputWithTrue>
>;

const updateOutputWithTrue2 = await db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).output({ deleted: true });
Expect<
	Equal<{
		deleted: typeof users.$inferSelect;
	}[], typeof updateOutputWithTrue2>
>;

const updateOutputWithTrue3 = await db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).output({ inserted: true });
Expect<
	Equal<{
		inserted: typeof users.$inferSelect;
	}[], typeof updateOutputWithTrue3>
>;

const updateOutputStmt = db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).output().prepare();
const updateOutputPrepared = await updateOutputStmt.execute();
Expect<Equal<typeof users.$inferSelect[], typeof updateOutputPrepared>>;

const updateOutputPartial = await db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).output({ inserted: { cityHome: users.homeCity } });
Expect<Equal<{ inserted: { cityHome: number } }[], typeof updateOutputPartial>>;

const updateOutputPartialStmt = db.update(users).set({
	homeCity: 1,
	class: 'A',
	age1: 1,
	enumCol: 'a',
}).output({ deleted: { cityHome: users.homeCity } }).prepare();
const updateOutputPartialPrepared = await updateOutputPartialStmt.execute();
Expect<Equal<{ deleted: { cityHome: number } }[], typeof updateOutputPartialPrepared>>;

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
	function dynamic<T extends MsSqlUpdate>(qb: T) {
		return qb.output().where(sql``);
	}

	const qbBase = db.update(users).set({}).$dynamic();
	const qb = dynamic(qbBase);
	const result = await qb;
	Expect<Equal<typeof users.$inferSelect[], typeof result>>;
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
