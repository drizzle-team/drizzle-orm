import { afterAll, beforeAll, expect, test } from 'bun:test';
import { Transform } from '../../../src/index.ts';
import type { Connection } from '../../../src/index.ts';
import type * as json from '../../../src/json.ts';
import { testConnect } from '../../helpers/db.ts';

// A second module instance stands in for a second copy of the package in one process, for example the
// copy bundled in drizzle-orm next to the standalone package.
const secondCopyPath = '../../../src/json.ts?second-copy';
const secondCopy = (await import(secondCopyPath)) as typeof json;

let conn: Connection;
beforeAll(async () => {
	conn = await testConnect();
});
afterAll(async () => {
	await conn?.end();
});

test('Transform markers from two copies of the package keep their own fn on one connection', async () => {
	expect(secondCopy.Transform).not.toBe(Transform);
	const sql = `SELECT 'hi'::text AS note`;
	const upper = await conn.query(sql, [], {
		shape: { note: Transform('text', (s: string) => s.toUpperCase()) } as never,
	});
	const doubled = await conn.query(sql, [], {
		shape: { note: secondCopy.Transform('text', (s: string) => s + s) } as never,
	});
	expect(upper.rows).toEqual([{ note: 'HI' }]);
	expect(doubled.rows).toEqual([{ note: 'hihi' }]);
});
