import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { sql } from '~/sql/sql.ts';
import type { SQLiteAsyncRaw } from '~/sqlite-core/async/raw.ts';
import { drizzle } from '~/sqlite-proxy/index.ts';
import { users } from './tables.ts';

interface ProxyRunResult {
	rowsAffected: number;
	lastInsertRowid: bigint;
}

const db = drizzle({
	all: async () => [],
	// oxlint-disable-next-line no-useless-undefined
	get: async () => undefined,
	run: async (): Promise<ProxyRunResult> => ({ rowsAffected: 1, lastInsertRowid: 1n }),
});

const dbRun = db.run(sql`delete from ${users}`);
Expect<Equal<SQLiteAsyncRaw<ProxyRunResult>, typeof dbRun>>;
Expect<Equal<ProxyRunResult, Awaited<typeof dbRun>>>;

const unpreparedRun = db.delete(users).run();
Expect<Equal<ProxyRunResult, Awaited<typeof unpreparedRun>>>;

const preparedRun = db.delete(users).prepare().run();
Expect<Equal<ProxyRunResult, Awaited<typeof preparedRun>>>;

const scalarRunDb = drizzle({
	all: async () => [],
	// oxlint-disable-next-line no-useless-undefined
	get: async () => undefined,
	run: async () => 42,
});

const scalarDbRun = scalarRunDb.run(sql`delete from ${users}`);
Expect<Equal<number, Awaited<typeof scalarDbRun>>>;

const scalarUnpreparedRun = scalarRunDb.delete(users).run();
Expect<Equal<number, Awaited<typeof scalarUnpreparedRun>>>;

const scalarPreparedRun = scalarRunDb.delete(users).prepare().run();
Expect<Equal<number, Awaited<typeof scalarPreparedRun>>>;
