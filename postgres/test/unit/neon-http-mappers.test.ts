// /neon-http row mapper lookups against canned responses (no server): the `fields` JSON key for plain
// queries, a static shape by identity, 'unknown' shape columns per response, and the batch path.
import { describe, expect, test } from 'bun:test';
import { createPool } from '../../src/neon-http.ts';

type Field = { name: string; dataTypeID: number };
const result = (fields: Field[], rows: (string | null)[][]) => ({
	fields,
	rows,
	command: 'SELECT',
	rowCount: rows.length,
});

function client(respond: (body: { query?: string; queries?: unknown[] }) => unknown) {
	const fetch =
		(async (_url: unknown, init?: RequestInit) =>
			new Response(JSON.stringify(respond(JSON.parse(init!.body as string))), {
				status: 200,
			})) as typeof globalThis.fetch;
	return createPool({ url: 'postgres://u:p@ep-x.region.aws.neon.tech/db', fetch });
}

const idName = [{ name: 'id', dataTypeID: 23 }, { name: 'name', dataTypeID: 25 }];
const other = [{ name: 'n', dataTypeID: 23 }, { name: 'label', dataTypeID: 25 }];

describe('neon-http row mappers', () => {
	test('plain queries: repeated results, both modes, other column names on the same types', async () => {
		const db = client((b) => result(b.query === 'q1' ? idName : other, [['1', 'a'], ['2', null]]));
		for (let i = 0; i < 3; i++) {
			expect((await db.query('q1', [], { mode: 'object' })).rows).toEqual([{ id: 1, name: 'a' }, {
				id: 2,
				name: null,
			}]);
		}
		expect((await db.query('q1', [])).rows).toEqual([[1, 'a'], [2, null]]);
		const r = await db.query('q2', [], { mode: 'object' });
		expect(r.rows).toEqual([{ n: 1, label: 'a' }, { n: 2, label: null }]);
		expect(r.columns).toEqual(['n', 'label']);
	});

	test('static shape: decoded by the shape on every call', async () => {
		const db = client(() => result(idName, [['7', 'x']]));
		const shape = { id: 'int8', name: 'text' } as const;
		for (let i = 0; i < 3; i++) {
			const r = await db.query('q', [], { shape });
			expect(r.rows).toEqual([{ id: 7n, name: 'x' }]);
			expect(r.columns).toEqual(['id', 'name']);
		}
	});

	test("a shape's 'unknown' columns take each response's type", async () => {
		let oid = 23;
		const db = client(() => result([{ name: 'v', dataTypeID: oid }], [['1']]));
		const shape = { v: 'unknown' } as const;
		expect((await db.query('q', [], { shape })).rows).toEqual([{ v: 1 }]);
		oid = 25;
		expect((await db.query('q', [], { shape })).rows).toEqual([{ v: '1' }]);
	});

	test('batch transaction results decode per query', async () => {
		const db = client(() => ({ results: [result(idName, [['1', 'a']]), result(other, [['2', 'b']])] }));
		const [a, b] = await db.transaction([{ sql: 'q1', mode: 'object' }, {
			sql: 'q2',
			shape: { n: 'int4', label: 'text' },
		}]);
		expect(a!.rows as unknown[]).toEqual([{ id: 1, name: 'a' }]);
		expect(b!.rows as unknown[]).toEqual([{ n: 2, label: 'b' }]);
	});
});
