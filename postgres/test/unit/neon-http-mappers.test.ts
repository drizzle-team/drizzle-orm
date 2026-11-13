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

	test('remembered `fields` bytes: a list that starts like another one, and more lists than are kept', async () => {
		// `longer` begins with the bytes of `idName` minus its closing bracket; neither may match the other
		const longer = [...idName, { name: 'age', dataTypeID: 23 }];
		const db = client((b) => (b.query === 'two' ? result(idName, [['1', 'a']]) : result(longer, [['1', 'a', '9']])));
		for (let i = 0; i < 3; i++) {
			expect((await db.query('two', [], { mode: 'object' })).rows).toEqual([{ id: 1, name: 'a' }]);
			const r = await db.query('three', [], { mode: 'object' });
			expect(r.rows).toEqual([{ id: 1, name: 'a', age: 9 }]);
			expect(r.columns).toEqual(['id', 'name', 'age']);
			expect((await db.query('three', [])).rows).toEqual([[1, 'a', 9]]);
		}
		// 40 distinct layouts, each asked for twice: the ones past the cap still decode
		const many = client((b) => result([{ name: 'c' + b.query, dataTypeID: 23 }], [[b.query!]]));
		for (let pass = 0; pass < 2; pass++) {
			for (let n = 0; n < 40; n++) {
				const r = await many.query(String(n), [], { mode: 'object' });
				expect(r.rows).toEqual([{ ['c' + n]: n }]);
				expect(r.columns).toEqual(['c' + n]);
			}
		}
	});

	test('a decoder may keep the bytes it was given: later rows and later queries do not overwrite them', async () => {
		const kept: Buffer[] = [];
		const fetch = (async (_url: unknown, init?: RequestInit) => {
			const q = JSON.parse(init!.body as string).query as string;
			const rows = Array.from({ length: 1500 }, (_, i) => [`${q}-${i}`, i % 3 ? 'plain' : 'esc\\"aped\n']);
			return new Response(JSON.stringify(result([{ name: 'v', dataTypeID: 25 }, { name: 'w', dataTypeID: 25 }], rows)));
		}) as typeof globalThis.fetch;
		const db = createPool({
			url: 'postgres://u:p@ep-x.region.aws.neon.tech/db',
			fetch,
			types: { 25: (b: Buffer) => (kept.push(b), b) },
		});
		const a = await db.query('a', [], { mode: 'object' });
		await db.query('b', [], { mode: 'object' });
		expect(String((a.rows[0] as { v: Buffer }).v)).toBe('a-0');
		expect(String((a.rows[1499] as { v: Buffer }).v)).toBe('a-1499');
		for (let i = 0; i < 1500; i++) {
			if (String(kept[i * 2]) !== `a-${i}`) throw new Error(`kept bytes of row ${i} now read ${String(kept[i * 2])}`);
		}
		expect(String(kept[1])).toBe('esc\\"aped\n'); // the cell with JSON escapes takes the string path
		expect(String(kept[3000])).toBe('b-0');
	});

	test('a wide row, then narrow ones, then concurrent queries', async () => {
		const wide = 'x'.repeat(20_000);
		const db = client((b) =>
			result(idName, b.query === 'wide' ? [['1', wide], ['2', wide + 'y']] : [[b.query!, 'n' + b.query]])
		);
		expect((await db.query('wide', [], { mode: 'object' })).rows).toEqual([{ id: 1, name: wide }, {
			id: 2,
			name: wide + 'y',
		}]);
		expect((await db.query('5', [], { mode: 'object' })).rows).toEqual([{ id: 5, name: 'n5' }]);
		const all = await Promise.all([1, 2, 3, 4].map((n) => db.query(String(n), [], { mode: 'object' })));
		expect(all.map((r) => r.rows)).toEqual([1, 2, 3, 4].map((n) => [{ id: n, name: 'n' + n }]));
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
