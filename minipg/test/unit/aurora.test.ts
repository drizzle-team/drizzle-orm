// minipg/aurora — OFFLINE unit tests (no live cluster). Covers the whole flow with an injected fetch:
//   - SigV4 signer vs AWS's documented signing vector (src/sigv4.ts)
//   - bind() -> Data API SqlParameters
//   - Field -> JS decode with full wire parity (via the shared compiled mapper)
//   - request shaping, transactions (Begin/Commit/Rollback + transactionId), error -> PgError
// Live end-to-end against a real Aurora Data API cluster is deferred.
import { describe, expect, test } from 'bun:test';
import { type AuroraConfig, bind, connect, PgError, toParameters } from '../../src/aurora.ts';
import { Shape } from '../../src/shape.ts';
import { signV4 } from '../../src/sigv4.ts';

describe('SigV4 signer (src/sigv4.ts)', () => {
	test('matches AWS documented vector: GET iam ListUsers 20150830', async () => {
		const r = await signV4({
			method: 'GET',
			path: '/',
			query: 'Action=ListUsers&Version=2010-05-08',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
				Host: 'iam.amazonaws.com',
				'X-Amz-Date': '20150830T123600Z',
			},
			body: '',
			service: 'iam',
			region: 'us-east-1',
			amzDate: '20150830T123600Z',
			credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' },
		});
		// canonical hash is AWS-documented; signature cross-verified against Node's reference crypto
		expect(r.canonicalHash).toBe('f536975d06c0309214f805bb90ccff089219ecd68b2577efef23edd43b7e1a59');
		expect(r.signature).toBe('33f5dad2191de0cb4b7ab912f876876c2c4f72e2991a458f9499233c7b992438');
		expect(r.signedHeaders).toBe('content-type;host;x-amz-date');
	});
});

describe('bind() -> Data API parameters', () => {
	test('positional, named, precision-safe, and raw inference', () => {
		const p = toParameters([
			bind.bigint(10),
			bind(100, 'text'),
			bind.uuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'uid'),
			bind.json({ k: 1 }),
			bind.bigint(9223372036854775807n),
			42,
			true,
			Buffer.from('deadbeef', 'hex'),
			null,
		]);
		expect(p[0]).toEqual({ name: 'p1', value: { longValue: 10 } });
		expect(p[1]).toEqual({ name: 'p2', value: { stringValue: '100' } });
		expect(p[2]).toEqual({
			name: 'uid',
			typeHint: 'UUID',
			value: { stringValue: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' },
		});
		expect(p[3]).toEqual({ name: 'p4', typeHint: 'JSON', value: { stringValue: '{"k":1}' } });
		expect(p[4]).toEqual({ name: 'p5', value: { stringValue: '9223372036854775807' } }); // > 2^53 -> string
		expect(p[5]).toEqual({ name: 'p6', value: { longValue: 42 } });
		expect(p[6]).toEqual({ name: 'p7', value: { booleanValue: true } });
		expect(p[7]!.value).toEqual({ blobValue: Buffer.from('deadbeef', 'hex').toString('base64') });
		expect(p[8]).toEqual({ name: 'p9', value: { isNull: true } });
	});
});

// A mock fetch that records the last request and returns a scripted Data API response.
// `raw` sends the body verbatim — JSON.stringify can't produce a number past 2^53 exactly, the Data API can.
function mockFetch(
	script: (
		op: string,
		body: any,
	) => { status?: number; headers?: Record<string, string>; json?: unknown; raw?: string },
) {
	const calls: Array<{ op: string; body: any; headers: Record<string, string> }> = [];
	const fetchImpl = (async (url: string, init: RequestInit) => {
		const op = url.split('/').pop()!;
		const body = JSON.parse(init.body as string);
		calls.push({ op, body, headers: init.headers as Record<string, string> });
		const s = script(op, body);
		return new Response(s.raw ?? JSON.stringify(s.json), { status: s.status ?? 200, headers: s.headers });
	}) as unknown as typeof fetch;
	return { fetchImpl, calls };
}

const CFG = (fetchImpl: typeof fetch): AuroraConfig => ({
	resourceArn: 'arn:aws:rds:eu-central-1:123456789012:cluster:my-cluster',
	secretArn: 'arn:aws:secretsmanager:eu-central-1:123456789012:secret:sec-abc',
	database: 'db0',
	credentials: { accessKeyId: 'AKID', secretAccessKey: 'SECRET' },
	fetch: fetchImpl,
});

describe('query: request shaping + Field decode parity', () => {
	test('signs, targets /Execute, sends parameters + resultSetOptions, decodes every type like the wire driver', async () => {
		const { fetchImpl, calls } = mockFetch(() => ({
			json: {
				columnMetadata: [
					{ name: 'id', typeName: 'int8' },
					{ name: 'cnt', typeName: 'int4' },
					{ name: 'nm', typeName: 'text' },
					{ name: 'ok', typeName: 'bool' },
					{ name: 'score', typeName: 'numeric' },
					{ name: 'ratio', typeName: 'float8' },
					{ name: 'doc', typeName: 'jsonb' },
					{ name: 'ts', typeName: 'timestamptz' },
					{ name: 'blob', typeName: 'bytea' },
					{ name: 'nil', typeName: 'text' },
				],
				records: [[
					{ stringValue: '9223372036854775807' },
					{ longValue: 42 },
					{ stringValue: 'Jane' },
					{ booleanValue: true },
					{ stringValue: '10.50' },
					{ doubleValue: 1.5 },
					{ stringValue: '{"k": 1}' },
					{ stringValue: '2024-01-15 10:30:45.123456+00' },
					{ blobValue: Buffer.from('deadbeef', 'hex').toString('base64') },
					{ isNull: true },
				]],
			},
		}));
		const db = await connect(CFG(fetchImpl));
		const r = await db.query('select * from t where id = :p1', [bind.bigint(1)], { mode: 'object' });

		// request shape
		const req = calls[0]!;
		expect(req.op).toBe('Execute');
		expect(req.headers.Authorization).toContain('AWS4-HMAC-SHA256');
		expect(req.headers.Authorization).toContain('/rds-data/aws4_request');
		expect(req.body.resourceArn).toContain(':cluster:my-cluster');
		expect(req.body.parameters).toEqual([{ name: 'p1', value: { longValue: 1 } }]);
		expect(req.body.resultSetOptions).toEqual({ longReturnType: 'STRING', decimalReturnType: 'STRING' });

		// decode parity (identical to minipg/node)
		const row = r.rows[0] as Record<string, unknown>;
		expect(row.id).toBe(9223372036854775807n);
		expect(row.cnt).toBe(42);
		expect(row.nm).toBe('Jane');
		expect(row.ok).toBe(true);
		expect(row.score).toBe('10.50');
		expect(row.ratio).toBe(1.5);
		expect(row.doc).toEqual({ k: 1 });
		expect(row.ts).toBeInstanceOf(Date);
		expect(Buffer.isBuffer(row.blob) && (row.blob as Buffer).toString('hex')).toBe('deadbeef');
		expect(row.nil).toBeNull();
		expect(r.columns).toEqual(['id', 'cnt', 'nm', 'ok', 'score', 'ratio', 'doc', 'ts', 'blob', 'nil']);
		expect(r.command).toBe('SELECT');
	});

	test('DML with no result set -> rows:[], rowCount from numberOfRecordsUpdated, command inferred', async () => {
		const { fetchImpl } = mockFetch(() => ({ json: { numberOfRecordsUpdated: 3, generatedFields: [] } }));
		const db = await connect(CFG(fetchImpl));
		const r = await db.query('update t set x = 1 where y > :p1', [bind.int(0)]);
		expect(r.rows).toEqual([]);
		expect(r.rowCount).toBe(3);
		expect(r.command).toBe('UPDATE');
	});
});

describe('transactions: transactionId flow', () => {
	test('begin -> Execute(with transactionId) -> Commit', async () => {
		const { fetchImpl, calls } = mockFetch((op) => {
			if (op === 'BeginTransaction') return { json: { transactionId: 'TX-123' } };
			if (op === 'CommitTransaction') return { json: { transactionStatus: 'Transaction Committed' } };
			return { json: { columnMetadata: [{ name: 'v', typeName: 'int4' }], records: [[{ longValue: 7 }]] } };
		});
		const db = await connect(CFG(fetchImpl));
		const out = await db.transaction(async (tx) => (await tx.query('select 7 as v', [], { mode: 'object' })).rows[0]);
		expect(out).toEqual({ v: 7 });
		expect(calls.map((c) => c.op)).toEqual(['BeginTransaction', 'Execute', 'CommitTransaction']);
		expect(calls[1]!.body.transactionId).toBe('TX-123');
		expect(calls[2]!.body.transactionId).toBe('TX-123');
	});

	test('error inside the callback triggers Rollback and rethrows', async () => {
		const { fetchImpl, calls } = mockFetch((op) => {
			if (op === 'BeginTransaction') return { json: { transactionId: 'TX-9' } };
			return { json: { transactionStatus: 'Rollback Complete' } };
		});
		const db = await connect(CFG(fetchImpl));
		await expect(db.transaction(async () => {
			throw new Error('boom');
		})).rejects.toThrow('boom');
		expect(calls.map((c) => c.op)).toEqual(['BeginTransaction', 'RollbackTransaction']);
	});
});

describe('errors', () => {
	test('Aurora DatabaseErrorException maps to PgError', async () => {
		const { fetchImpl } = mockFetch(() => ({
			status: 400,
			headers: { 'x-amzn-errortype': 'DatabaseErrorException' },
			json: { message: 'ERROR: relation "nope" does not exist' },
		}));
		const db = await connect(CFG(fetchImpl));
		let err: unknown;
		try {
			await db.query('select * from nope');
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(PgError);
		expect((err as PgError).message).toBe('relation "nope" does not exist');
	});

	test('retries a DatabaseResumingException then succeeds', async () => {
		let n = 0;
		const { fetchImpl, calls } = mockFetch(() => {
			if (n++ === 0) {
				return {
					status: 400,
					headers: { 'x-amzn-errortype': 'DatabaseResumingException' },
					json: { message: 'resuming' },
				};
			}
			return { json: { columnMetadata: [{ name: 'v', typeName: 'int4' }], records: [[{ longValue: 1 }]] } };
		});
		const db = await connect({ ...CFG(fetchImpl), maxRetries: 3 });
		const r = await db.query('select 1 as v', [], { mode: 'object' });
		expect(r.rows[0]).toEqual({ v: 1 });
		expect(calls.length).toBe(2); // one resume + one success
	});
});

describe('missing config', () => {
	test('throws without resourceArn/secretArn', () => {
		expect(() => createSync({ resourceArn: '', secretArn: '' } as AuroraConfig)).toThrow(/resourceArn and secretArn/);
	});
});
function createSync(c: AuroraConfig) {
	return new (require('../../src/aurora.ts').AuroraClient)(c);
}

describe('transaction-control SQL guard', () => {
	const stub = (async () => {
		throw new Error('reached-fetch');
	}) as unknown as typeof fetch;

	test('query()/batch() reject textual tx-control; savepoint & rollback-to pass (threaded-tx legit)', async () => {
		const db = await connect(CFG(stub));
		for (const sql of ['begin', 'COMMIT', 'rollback', 'end', 'abort', 'start transaction']) {
			const err = await db.query(sql).then(() => null, (e: unknown) => e as Error);
			expect(err?.message).toMatch(/bypasses the Data API's transaction threading/);
		}
		for (const sql of ['savepoint sp1', 'rollback to savepoint sp1', 'select 1', 'select commitfee from t']) {
			const err = await db.query(sql).then(() => null, (e: unknown) => e as Error);
			expect(err?.message).toBe('reached-fetch'); // passed the guard
		}
		const berr = await db.batch('commit', [[]]).then(() => null, (e: unknown) => e as Error);
		expect(berr?.message).toMatch(/bypasses the Data API's transaction threading/);
	});
});

// A one-shot result-set response with the given columns/records.
const rs = (columnMetadata: { name: string; typeName: string }[], records: unknown[][]) =>
	mockFetch(() => ({ json: { columnMetadata, records } }));

describe('aurora: output shapes', () => {
	test('a shape picks the decode targets, overriding the Data API typeName', async () => {
		// Reported as text/int8; the shape asks for int4 and a JS number/string instead.
		const { fetchImpl } = rs(
			[{ name: 'n', typeName: 'text' }, { name: 'big', typeName: 'int8' }, { name: 'when', typeName: 'timestamptz' }],
			[[{ stringValue: '42' }, { stringValue: '9007199254740993' }, { stringValue: '2024-01-15 10:30:45+00' }]],
		);
		const db = await connect(CFG(fetchImpl));
		const r = await db.query('select …', [], { shape: { n: 'int4', big: 'int8:string', when: 'timestamptz:string' } });
		expect(r.rows[0]).toEqual({ n: 42, big: '9007199254740993', when: '2024-01-15 10:30:45+00' });
		expect(r.columns).toEqual(['n', 'big', 'when']); // shape keys are the OUTPUT keys
	});

	test("a shape implies mode:'object', and mode:'array' still wins when asked", async () => {
		const cols = [{ name: 'a', typeName: 'int4' }, { name: 'b', typeName: 'text' }];
		const recs = [[{ longValue: 1 }, { stringValue: 'x' }]];
		const obj = await (await connect(CFG(rs(cols, recs).fetchImpl))).query('select …', [], {
			shape: { a: 'int4', b: 'text' },
		});
		expect(obj.rows[0]).toEqual({ a: 1, b: 'x' });
		const arr = await (await connect(CFG(rs(cols, recs).fetchImpl))).query('select …', [], {
			shape: { a: 'int4', b: 'text' },
			mode: 'array',
		});
		expect(arr.rows[0]).toEqual([1, 'x']);
	});

	test("'unknown' defers a column to the reported typeName, like the other transports", async () => {
		const { fetchImpl } = rs(
			[{ name: 'count', typeName: 'int8' }, { name: 'doc', typeName: 'jsonb' }],
			[[{ stringValue: '2' }, { stringValue: '{"k":1}' }]],
		);
		const db = await connect(CFG(fetchImpl));
		const r = await db.query('select …', [], { shape: { count: 'unknown', doc: 'unknown' } });
		expect(r.rows[0]).toEqual({ count: 2n, doc: { k: 1 } });
	});

	test('a shape can name a type the Data API metadata cannot (enum reported as its own typname)', async () => {
		const { fetchImpl } = rs([{ name: 'mood', typeName: 'mood_enum' }], [[{ stringValue: 'happy' }]]);
		const db = await connect(CFG(fetchImpl));
		const r = await db.query('select …', [], { shape: { mood: 'text' } });
		expect(r.rows[0]).toEqual({ mood: 'happy' });
	});

	test('a Shape() mapper object is accepted, and its binary format request is downgraded to text', async () => {
		const { fetchImpl } = rs([{ name: 'id', typeName: 'int4' }, { name: 'nm', typeName: 'text' }], [[{ longValue: 7 }, {
			stringValue: 'a',
		}]]);
		const db = await connect(CFG(fetchImpl));
		const s = Shape({ id: 'int4', nm: 'text' }); // int4 is in BINARY_FAST -> $cols asks for binary
		expect(s.$cols.some((c) => c.format === 'binary')).toBe(true); // …and the Data API only ever sends text
		const r = await db.query('select …', [], { shape: s });
		expect(r.rows[0]).toEqual({ id: 7, nm: 'a' });
	});

	test('a shape with the wrong column count throws instead of decoding the wrong column', async () => {
		const { fetchImpl } = rs([{ name: 'a', typeName: 'int4' }, { name: 'b', typeName: 'text' }], [[{ longValue: 1 }, {
			stringValue: 'x',
		}]]);
		const db = await connect(CFG(fetchImpl));
		const err = await db.query('select …', [], { shape: { a: 'int4' } }).catch((e) => e) as Error;
		expect(err.message).toContain('shape declares 1 column(s)');
		expect(err.message).toContain('returned 2');
	});
});

describe('aurora: array columns decode like every other entry', () => {
	test("pg_type's '_elem' array typenames are recognised and decoded to JS arrays", async () => {
		const { fetchImpl } = rs(
			[{ name: 'ints', typeName: '_int4' }, { name: 'bigs', typeName: '_int8' }, { name: 'tags', typeName: '_text' }, {
				name: 'stamps',
				typeName: '_timestamptz',
			}],
			[[{ stringValue: '{1,2,3}' }, { stringValue: '{1,9007199254740993}' }, { stringValue: '{a,b}' }, {
				stringValue: '{"2024-01-15 10:30:45+00"}',
			}]],
		);
		const db = await connect(CFG(fetchImpl));
		const r = await db.query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] };
		expect(r.rows[0]!.ints).toEqual([1, 2, 3]);
		expect(r.rows[0]!.bigs).toEqual([1n, 9007199254740993n]); // int8[] elements follow the scalar rule
		expect(r.rows[0]!.tags).toEqual(['a', 'b']);
		expect((r.rows[0]!.stamps as Date[])[0]).toBeInstanceOf(Date);
	});

	test('an array type with no known element still arrives as its raw literal (never a wrong guess)', async () => {
		const { fetchImpl } = rs([{ name: 'moods', typeName: '_mood_enum' }], [[{ stringValue: '{happy,sad}' }]]);
		const db = await connect(CFG(fetchImpl));
		const r = await db.query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] };
		expect(r.rows[0]!.moods).toBe('{happy,sad}');
		// …and a shape is the way out
		const typed = await (await connect(
			CFG(rs([{ name: 'moods', typeName: '_mood_enum' }], [[{ stringValue: '{happy,sad}' }]]).fetchImpl),
		))
			.query('select …', [], { shape: { moods: 'text[]' } });
		expect(typed.rows[0]).toEqual({ moods: ['happy', 'sad'] });
	});

	test("temporal:'string' reaches temporal[] elements too", async () => {
		const { fetchImpl } = rs([{ name: 'stamps', typeName: '_timestamptz' }], [[{
			stringValue: '{"2024-01-15 10:30:45+00"}',
		}]]);
		const db = await connect({ ...CFG(fetchImpl), temporal: 'string' });
		const r = await db.query('select …', [], { mode: 'object' }) as { rows: Record<string, unknown>[] };
		expect(r.rows[0]!.stamps).toEqual(['2024-01-15 10:30:45+00']);
	});
});

// Regression tests for minipg-aurora-report.md. Wire payloads are the ones koxudaxi/local-data-api sends.
describe('aurora: arrayValue results decode (report #1)', () => {
	test('1-D, multi-dimensional, empty, and every element list type', async () => {
		const { fetchImpl } = rs(
			[
				{ name: 't', typeName: '_text' },
				{ name: 'i', typeName: '_int4' },
				{ name: 'm', typeName: '_int4' },
				{ name: 'z', typeName: '_int4' },
				{ name: 'b', typeName: '_bool' },
				{ name: 'f', typeName: '_float8' },
				{ name: 'n', typeName: '_numeric' },
				{ name: 'j', typeName: '_jsonb' },
				{ name: 'tm', typeName: '_text' },
			],
			[[
				{ arrayValue: { stringValues: ['a', 'b'] } },
				{ arrayValue: { longValues: [1, 2] } },
				{ arrayValue: { arrayValues: [{ longValues: [1, 2] }, { longValues: [3, 4] }] } },
				{ arrayValue: { arrayValues: [] } },
				{ arrayValue: { booleanValues: [true, false] } },
				{ arrayValue: { doubleValues: [1.5, 0.1] } },
				{ arrayValue: { stringValues: ['1.50'] } },
				{ arrayValue: { stringValues: ['{"a": 1}'] } },
				{ arrayValue: { arrayValues: [{ stringValues: ['a'] }, { stringValues: ['b'] }] } },
			]],
		);
		const r = await (await connect(CFG(fetchImpl))).query('select …', [], { mode: 'object' });
		expect(r.rows[0]).toEqual({
			t: ['a', 'b'],
			i: [1, 2],
			m: [[1, 2], [3, 4]],
			z: [],
			b: [true, false],
			f: [1.5, 0.1],
			n: ['1.50'],
			j: [{ a: 1 }],
			tm: [['a'], ['b']],
		});
	});

	test('string elements are quoted: quotes, backslashes, commas, braces, whitespace and the text NULL survive', async () => {
		const tricky = ['x"y', 'back\\slash', 'a,b', '{c}', ' sp ', 'NULL', ''];
		const { fetchImpl } = rs([{ name: 't', typeName: '_text' }], [[{ arrayValue: { stringValues: tricky } }]]);
		const r = await (await connect(CFG(fetchImpl))).query('select …', [], { mode: 'object' });
		expect(r.rows[0]).toEqual({ t: tricky });
	});

	test("mode:'buffer' gets the PG array literal, quoted only where array_out would", async () => {
		const { fetchImpl } = rs([{ name: 't', typeName: '_text' }], [[{
			arrayValue: { stringValues: ['a', 'b"', 'null', 'c d', 'caf\u00e9\u00a0'] },
		}]]);
		const r = await (await connect(CFG(fetchImpl))).query('select …', [], { mode: 'buffer' });
		expect(r.rows[0]![0]!.toString()).toBe('{a,"b\\"","null","c d",caf\u00e9\u00a0}'); // NBSP isn't array_out whitespace
	});

	test('arrays with no element decoder come back as the same raw literal the wire driver returns', async () => {
		const { fetchImpl } = rs(
			[{ name: 'ip', typeName: '_inet' }, { name: 'mood', typeName: '_mood_enum' }, { name: 'bx', typeName: '_box' }],
			[[{ arrayValue: { stringValues: ['192.168.1.1', '10.0.0.0/8'] } }, {
				arrayValue: { stringValues: ['happy', 'so so'] },
			}, { arrayValue: { stringValues: ['(1,1),(0,0)', '(3,3),(2,2)'] } }]],
		);
		const r = await (await connect(CFG(fetchImpl))).query('select …', [], { mode: 'object' });
		expect(r.rows[0]).toEqual({
			ip: '{192.168.1.1,10.0.0.0/8}',
			mood: '{happy,"so so"}',
			bx: '{(1,1),(0,0);(3,3),(2,2)}',
		}); // box[] delimits with ';'
	});

	test('jsonb[] elements honor jsonBigints (the big integer stays exact inside the stringValues)', async () => {
		const { fetchImpl } = rs([{ name: 'j', typeName: '_jsonb' }], [[{
			arrayValue: { stringValues: ['{"x": 9007199254740993}', '{"y": [1, -1000000000000000001]}'] },
		}]]);
		const r = await (await connect({ ...CFG(fetchImpl), jsonBigints: 'bigint' })).query('select …', [], {
			mode: 'object',
		});
		expect(r.rows[0]).toEqual({ j: [{ x: 9007199254740993n }, { y: [1, -1000000000000000001n] }] });
	});

	test("a box[] shape splits on ';', never inside a box (1-D and multi-dimensional)", async () => {
		const { fetchImpl } = rs(
			[{ name: 'a', typeName: '_box' }, { name: 'm', typeName: '_box' }, { name: 's', typeName: 'box' }],
			[[{ arrayValue: { stringValues: ['(3,4),(1,2)', '(7,8),(5,6)'] } }, {
				arrayValue: { arrayValues: [{ stringValues: ['(1,1),(0,0)'] }, { stringValues: ['(2,2),(0,0)'] }] },
			}, { stringValue: '(3,4),(1,2)' }]],
		);
		const r = await (await connect(CFG(fetchImpl))).query('select …', [], {
			shape: { a: 'box[]', m: 'box[]', s: 'box' },
		});
		expect(r.rows[0]).toEqual({
			a: ['(3,4),(1,2)', '(7,8),(5,6)'],
			m: [['(1,1),(0,0)'], ['(2,2),(0,0)']],
			s: '(3,4),(1,2)',
		});
	});
});

describe('aurora: int8 past 2^53 stays exact when the Data API sends a bare JSON number (report #2)', () => {
	test('longValue and longValues keep their digits; a lookalike inside a string is untouched', async () => {
		const raw = '{"records":[[{"longValue":1000000000000000001},{"longValue": -9007199254740993},{"longValue":42},'
			+ '{"arrayValue":{"longValues":[9007199254740993,1,-1000000000000000001]}},{"stringValue":"\\"longValue\\":12345678901234567890"}]],'
			+ '"columnMetadata":[{"name":"a","typeName":"int8"},{"name":"b","typeName":"int8"},{"name":"c","typeName":"int4"},{"name":"d","typeName":"_int8"},{"name":"e","typeName":"text"}]}';
		const { fetchImpl } = mockFetch(() => ({ raw }));
		const r = await (await connect(CFG(fetchImpl))).query('select …', [], { mode: 'object' });
		expect(r.rows[0]).toEqual({
			a: 1000000000000000001n,
			b: -9007199254740993n,
			c: 42,
			d: [9007199254740993n, 1n, -1000000000000000001n],
			e: '"longValue":12345678901234567890',
		});
	});
});

describe('aurora: JS array params are sent as PG array literals (report #3)', () => {
	test('raw arrays -> untyped stringValue literal, never JSON', () => {
		const p = toParameters([['abc', 'def'], [1, 2], [['a"b', null], ['c,d', 'e']], [], { k: [1] }]);
		expect(p[0]).toEqual({ name: 'p1', value: { stringValue: '{"abc","def"}' } });
		expect(p[1]).toEqual({ name: 'p2', value: { stringValue: '{1,2}' } });
		expect(p[2]).toEqual({ name: 'p3', value: { stringValue: '{{"a\\"b",NULL},{"c,d","e"}}' } });
		expect(p[3]).toEqual({ name: 'p4', value: { stringValue: '{}' } });
		expect(p[4]).toEqual({ name: 'p5', typeHint: 'JSON', value: { stringValue: '{"k":[1]}' } }); // plain objects stay JSON
	});
});

describe('aurora: serial/identity columns decode as their integer type (report #4)', () => {
	test("JDBC 'serial' / 'bigserial' / 'smallserial' typeNames", async () => {
		const { fetchImpl } = rs(
			[{ name: 'id', typeName: 'serial' }, { name: 'big', typeName: 'bigserial' }, {
				name: 'small',
				typeName: 'smallserial',
			}],
			[[{ longValue: 1 }, { longValue: 1 }, { longValue: 1 }]],
		);
		const r = await (await connect(CFG(fetchImpl))).query('select …', [], { mode: 'object' });
		expect(r.rows[0]).toEqual({ id: 1, big: 1n, small: 1 });
	});
});

describe('aurora: timestamptz/timetz get their UTC offset back (report #5)', () => {
	const cols = [
		{ name: 'tstz', typeName: 'timestamptz' },
		{ name: 'ttz', typeName: 'timetz' },
		{ name: 'ts', typeName: 'timestamp' },
		{ name: 'arr', typeName: '_timestamptz' },
		{ name: 'off', typeName: 'timestamptz' },
		{ name: 'inf', typeName: 'timestamptz' },
		{ name: 'bc', typeName: 'timestamptz' },
	];
	const recs = [[
		{ stringValue: '2022-01-01 02:00:00.123456' },
		{ stringValue: '08:00:00' },
		{ stringValue: '2022-01-01 00:00:00' },
		{ arrayValue: { stringValues: ['2022-01-01 02:00:00.5'] } },
		{ stringValue: '2022-01-01 02:00:00+05:30' },
		{ stringValue: 'infinity' },
		{ stringValue: '0001-01-01 00:00:00 BC' },
	]];

	test("temporal:'string' matches the other entries' output", async () => {
		const db = await connect({ ...CFG(rs(cols, recs).fetchImpl), temporal: 'string' });
		expect((await db.query('select …', [], { mode: 'object' })).rows[0]).toEqual({
			tstz: '2022-01-01 02:00:00.123456+00',
			ttz: '08:00:00+00',
			ts: '2022-01-01 00:00:00', // plain timestamp untouched
			arr: ['2022-01-01 02:00:00.5+00'],
			off: '2022-01-01 02:00:00+05:30',
			inf: 'infinity',
			bc: '0001-01-01 00:00:00+00 BC',
		});
	});

	test("temporal:'date' still reads the instant as UTC", async () => {
		const r = await (await connect(CFG(rs(cols.slice(0, 1), [recs[0]!.slice(0, 1)]).fetchImpl))).query('select …', [], {
			mode: 'object',
		});
		expect((r.rows[0] as { tstz: Date }).tstz.toISOString()).toBe('2022-01-01T02:00:00.123Z');
	});
});

describe('aurora: error body edge cases', () => {
	test('a JSON null error body still surfaces as a minipg error, not a TypeError', async () => {
		const { fetchImpl } = mockFetch(() => ({ status: 500, raw: 'null' }));
		const err = await (await connect(CFG(fetchImpl))).query('select 1').catch((e) => e) as Error;
		expect(err).not.toBeInstanceOf(TypeError);
		expect(err.message).toContain('HTTP 500');
	});
});
