import { sql } from 'drizzle-orm';
import type { SingleStoreDriverDatabase, SingleStoreRawExecuteResult } from 'drizzle-orm/singlestore';
import type { FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { expect, expectTypeOf } from 'vitest';
import { tests } from './common';
import { tests as cacheTests } from './common-cache';
import { singleStoreTest } from './instrumentation';

cacheTests(singleStoreTest);
tests(singleStoreTest);

singleStoreTest('raw db.execute type matches returned data', async ({ db: fixtureDb }) => {
	const db = fixtureDb as unknown as SingleStoreDriverDatabase;
	const table = sql.identifier('raw_execute_types');

	await db.execute<never>(sql`drop table if exists ${table}`);

	// DDL
	const created = await db.execute<never>(sql`create table ${table} (\`id\` int primary key, \`name\` text not null)`);
	expectTypeOf(created).toEqualTypeOf<[ResultSetHeader, undefined]>();
	expect(created).toEqual([expect.objectContaining({ affectedRows: 0 }), undefined]);

	// `insert` without returning
	const inserted = await db.execute<never>(sql`insert into ${table} values (1, 'John')`);
	expectTypeOf(inserted).toEqualTypeOf<[ResultSetHeader, undefined]>();
	expect(inserted).toEqual([expect.objectContaining({ affectedRows: 1 }), undefined]);

	// Simple select
	const selected = await db.execute<{ id: number; name: string }>(sql`select \`id\`, \`name\` from ${table}`);
	expectTypeOf(selected).toEqualTypeOf<[{ id: number; name: string }[], FieldPacket[]]>();
	expect(selected).toEqual([
		[{ id: 1, name: 'John' }],
		[expect.objectContaining({ name: 'id' }), expect.objectContaining({ name: 'name' })],
	]);

	// Multi-statement
	const multi = await db.execute(
		sql`insert into ${table} values (2, 'Jane'); select \`id\`, \`name\` from ${table} order by \`id\``,
	);
	expectTypeOf(multi).toEqualTypeOf<SingleStoreRawExecuteResult>();
	expect(multi).toEqual([
		[expect.objectContaining({ affectedRows: 1 }), [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]],
		[undefined, [expect.objectContaining({ name: 'id' }), expect.objectContaining({ name: 'name' })]],
	]);

	await db.execute<never>(sql`drop table ${table}`);
});
