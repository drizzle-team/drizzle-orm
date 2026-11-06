// Security domain: proves Drizzle Postgres is a sound trust boundary — untrusted values can
// never become executable SQL (extended-protocol Bind), server metadata can never
// mutate the JS runtime (null-proto rows), secrets are redacted, and TLS fails closed.
// Grounded in src/encode.ts, src/auth.ts, src/connection.ts, src/protocol.ts, src/errors.ts.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fc from 'fast-check';
import { createHash, createHmac, pbkdf2Sync } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import util from 'node:util';
import { md5Password, scram } from '../../src/auth.ts';
import { Connection } from '../../src/connection.ts';
import { encodeParam } from '../../src/encode.ts';
import * as index from '../../src/index.ts';
import { caught, PgError, SERVER_CA_PATH, testConnect, testPool, withConn } from '../helpers/db.ts';

// ---------------------------------------------------------------------------
// Param-boundary injection: a value is DATA, never executable SQL.
// startTask always ships params via Bind (W.bind); values never splice into text.
// ---------------------------------------------------------------------------
describe('param-boundary injection (value is data, never SQL)', () => {
	test('a malicious $1 is stored as a literal string; a sibling temp table is never dropped', async () => {
		await withConn(async (c) => {
			await c.query('create temp table seed_users(id int)');
			await c.query('insert into seed_users values (1)');
			const evil = '1; DROP TABLE seed_users; --';
			const r = await c.query('select $1::text as v', [evil]);
			expect((r.rows[0] as unknown[])[0]).toBe(evil); // rode in Bind, not SQL text
			// table still exists with its single row — no DDL fired
			const still = await c.query('select count(*)::int as n from seed_users');
			expect((still.rows[0] as unknown[])[0]).toBe(1);
		});
	});

	test('stacked statements are rejected by the extended protocol (SQLSTATE 42601)', async () => {
		await withConn(async (c) => {
			const err = await caught(() => c.query('SELECT 1; SELECT 2', []));
			expect(err).toBeInstanceOf(PgError);
			expect((err as PgError).code).toBe('42601'); // cannot insert multiple commands into a prepared statement
			// connection remains usable afterwards
			expect((await c.query('select 7')).rows[0] as unknown[]).toEqual([7]);
		});
	});

	test('SQL metacharacters round-trip byte-identical through $1::text', async () => {
		await withConn(async (c) => {
			const payload = "o'brien -- ; \\ $$ %";
			const r = await c.query('select $1::text as v', [payload]);
			expect((r.rows[0] as unknown[])[0]).toBe(payload);
		});
	});

	test('backslash handling is server-side on the bound value with standard_conforming_strings on AND off', async () => {
		await withConn(async (c) => {
			const payload = "a\\b\\\\c '%' \\n";
			for (const scs of ['on', 'off']) {
				await c.query(`set standard_conforming_strings = ${scs}`);
				const r = await c.query('select $1::text as v', [payload]);
				expect((r.rows[0] as unknown[])[0]).toBe(payload); // bound params unaffected by the GUC — the point
			}
		});
	});

	test("type-coerced injection '1 OR 1=1'::int is invalid input syntax (22P02), not evaluated", async () => {
		await withConn(async (c) => {
			const err = await caught(() => c.query('select $1::int', ['1 OR 1=1']));
			expect(err).toBeInstanceOf(PgError);
			expect((err as PgError).code).toBe('22P02'); // invalid_text_representation
		});
	});

	test('an object param cannot escape its jsonb column; payload stays data', async () => {
		await withConn(async (c) => {
			const r = await c.query('select $1::jsonb as data', [{ x: '"); DROP TABLE t; --' }], { mode: 'object' });
			const data = (r.rows[0] as Record<string, unknown>).data as { x: string };
			expect(data.x).toBe('"); DROP TABLE t; --'); // verbatim inside jsonb, never re-parsed
		});
	});

	test('empty-string and NULL params are not conflated', async () => {
		await withConn(async (c) => {
			const empty = await c.query('select $1::text as v', ['']);
			expect((empty.rows[0] as unknown[])[0]).toBe(''); // zero-length string
			const nul = await c.query('select $1::text as v', [null]);
			expect((nul.rows[0] as unknown[])[0]).toBeNull(); // SQL NULL (encodeParam bytes:null)
		});
	});

	test('property: arbitrary nasty strings round-trip unchanged through $1::text', async () => {
		await withConn(async (c) => {
			const nasty = fc.stringMatching(/^[a-zA-Z0-9'";%$\\éÿ☃-]*$/);
			await fc.assert(
				fc.asyncProperty(nasty, async (s) => {
					const r = await c.query('select $1::text as v', [s]);
					return (r.rows[0] as unknown[])[0] === s;
				}),
				{ seed: 42, numRuns: 60 },
			);
		});
	});
});

// ---------------------------------------------------------------------------
// NUL byte & control-character handling (encode.ts:52 text-param guard).
// ---------------------------------------------------------------------------
describe('NUL byte & control-character handling', () => {
	test("encodeParam('a\\0b') throws a NUL error client-side, before any bytes hit the wire", () => {
		expect(() => encodeParam('a\0b')).toThrow(/NUL/);
	});

	test('a NUL text param rejects and the connection stays usable (queue not wedged)', async () => {
		await withConn(async (c) => {
			const err = await caught(() => c.query('select $1::text', ['a\0b']));
			expect((err as Error).message).toMatch(/NUL/);
			// startTask serializes params before committing this.current, so the throw cannot wedge the queue
			const ok = await c.query('select 42 as v');
			expect((ok.rows[0] as unknown[])[0]).toBe(42);
		});
	});

	test('the binary path bypasses the text NUL guard: bytea round-trips 0x00 bytes', async () => {
		await withConn(async (c) => {
			const r = await c.query('select $1::bytea as v', [Buffer.from([0, 1, 2, 0])], { mode: 'object' });
			const v = (r.rows[0] as Record<string, unknown>).v as Buffer;
			expect(Buffer.isBuffer(v)).toBe(true);
			expect([...v]).toEqual([0, 1, 2, 0]); // Buffer -> binary format:1, no NUL check
		});
	});

	test('FOOTGUN: a NUL inside the SQL string itself is rejected client-side (W.parse guard), connection survives', async () => {
		await withConn(async (c) => {
			// encodeParam only guards params; W.parse separately guards the query text C-string.
			const err = await caught(() => c.query('select 1 -- \0', []));
			expect((err as Error).message).toMatch(/NUL/); // "query text contains NUL byte (0x00)"
			const ok = await c.query('select 9 as v');
			expect((ok.rows[0] as unknown[])[0]).toBe(9);
		});
	});

	test('non-NUL control chars and multibyte UTF-8 round-trip unchanged through $1::text', async () => {
		await withConn(async (c) => {
			const payload = 'a\nb\tc\rd☃\u{1F600}e'; // newline/tab/cr + snowman + 4-byte emoji
			const r = await c.query('select $1::text as v', [payload]);
			expect((r.rows[0] as unknown[])[0]).toBe(payload);
		});
	});
});

// ---------------------------------------------------------------------------
// Prototype-pollution-safe key handling (connection.ts:55 — Object.create(null)).
// ---------------------------------------------------------------------------
describe('prototype-pollution-safe key handling', () => {
	test('object mode: a scalar "__proto__" column is an OWN property and pollutes nothing', async () => {
		await withConn(async (c) => {
			const r = await c.query('select 1 as "__proto__"', [], { mode: 'object' });
			const row = r.rows[0] as Record<string, unknown>;
			// null-proto row: the assignment creates a real own data property, not a setter trap
			expect(Object.getOwnPropertyNames(row)).toContain('__proto__');
			expect((row as { __proto__?: unknown }).__proto__).toBe(1);
			expect(({} as Record<string, unknown>).polluted).toBeUndefined();
			expect(Object.prototype.hasOwnProperty.call(Object.prototype, '__proto__')).toBe(true); // unchanged builtin accessor
		});
	});

	test('object mode: "constructor"/"prototype" columns are own properties, builtins intact', async () => {
		await withConn(async (c) => {
			const r = await c.query(`select 'x' as "constructor", 'y' as "prototype"`, [], { mode: 'object' });
			const row = r.rows[0] as Record<string, unknown>;
			expect(row.constructor as unknown).toBe('x'); // own value, not the Object constructor
			expect(row.prototype).toBe('y');
			expect(({}).constructor).toBe(Object); // global untouched
		});
	});

	test('worst case: a jsonb "__proto__" column returning an object does not relink prototypes', async () => {
		await withConn(async (c) => {
			const r = await c.query(`select '{"polluted":true}'::jsonb as "__proto__"`, [], { mode: 'object' });
			const row = r.rows[0] as Record<string, unknown>;
			expect((row as { __proto__?: unknown }).__proto__).toEqual({ polluted: true });
			expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // no global pollution
		});
	});

	test('object mode: "toString"/"hasOwnProperty" columns do not break JSON.stringify / Object.keys', async () => {
		await withConn(async (c) => {
			const r = await c.query(`select 'a' as "toString", 'b' as "hasOwnProperty"`, [], { mode: 'object' });
			const row = r.rows[0] as Record<string, unknown>;
			// oxlint-disable-next-line typescript/unbound-method -- reads the column value that shadows the method
			expect(row.toString as unknown).toBe('a');
			// oxlint-disable-next-line typescript/unbound-method -- reads the column value that shadows the method
			expect(row.hasOwnProperty as unknown).toBe('b');
			expect(new Set(Object.keys(row))).toEqual(new Set(['toString', 'hasOwnProperty']));
			expect(JSON.parse(JSON.stringify(row))).toEqual({ toString: 'a', hasOwnProperty: 'b' });
		});
	});

	test('internal prepared map is pollution-safe: statements named "__proto__"/"constructor" reuse cleanly', async () => {
		await withConn(async (c) => {
			for (const name of ['__proto__', 'constructor']) {
				const a = await c.query('select $1::int as n', [11], { name });
				const b = await c.query('select $1::int as n', [22], { name }); // reuse path
				expect((a.rows[0] as unknown[])[0]).toBe(11);
				expect((b.rows[0] as unknown[])[0]).toBe(22);
			}
		});
	});

	test('object mode: duplicate aliases are last-write-wins; array mode keeps both cells', async () => {
		await withConn(async (c) => {
			const obj = await c.query('select 1 as a, 2 as a', [], { mode: 'object' });
			expect((obj.rows[0] as Record<string, unknown>).a).toBe(2); // documented footgun baseline
			const arr = await c.query('select 1 as a, 2 as a', [], { mode: 'array' });
			expect(arr.rows[0] as unknown[]).toEqual([1, 2]);
		});
	});
});

// ---------------------------------------------------------------------------
// Secret redaction (connection.ts:104 — cfg.password is non-enumerable).
// ---------------------------------------------------------------------------
describe('secret redaction (password never leaks)', () => {
	test('password is absent from cfg enumeration, JSON, and util.inspect of a Connection', async () => {
		await withConn(async (c) => {
			expect(Object.keys(c.cfg)).not.toContain('password');
			expect(JSON.stringify(c.cfg)).not.toContain('"password"');
			expect(JSON.stringify(c)).not.toContain('"password"');
			expect(util.inspect(c)).not.toContain('password'); // non-enumerable -> hidden by default
			expect(Object.getOwnPropertyDescriptor(c.cfg, 'password')?.enumerable).toBe(false);
			expect(c.cfg.password).toBe('postgres'); // still readable directly
		});
	});

	test('a server auth-failure (28P01) PgError never embeds the configured password', async () => {
		const secret = 'p@ss_SECRET_LEAK_CHECK_42';
		const err = await caught(() => testConnect({ password: secret }));
		expect(err).toBeInstanceOf(PgError);
		expect((err as PgError).code).toBe('28P01'); // invalid_password
		expect((err as Error).message).not.toContain(secret); // server fields never carry the password
		expect(String((err as Error).stack ?? '')).not.toContain(secret);
		expect(JSON.stringify(err)).not.toContain(secret);
	});

	test('a client-thrown connect-timeout error contains no credentials', async () => {
		const secret = 'TIMEOUT_SECRET_PW_99';
		// 10.255.255.1 is non-routable -> connect stalls -> our timeout fires
		const err = await caught(() =>
			testConnect({ host: '10.255.255.1', port: 65000, password: secret, connectTimeout: 300 })
		);
		expect((err as Error).message).toMatch(/timeout|connect/i);
		expect((err as Error).message).not.toContain(secret);
		expect(JSON.stringify(err)).not.toContain(secret);
	});

	test('FINDING: Pool stores the raw config, so JSON.stringify(pool) DOES expose the password', async () => {
		const secret = 'SECRET_POOL_PW_xyz';
		const p = testPool({ password: secret });
		try {
			// Documents a real gap: unlike Connection, Pool.cfg keeps the password enumerable.
			// (A future fix should redact pool config too.) Asserting ACTUAL behavior, not aspirational.
			expect(JSON.stringify(p)).toContain(secret);
		} finally {
			await p.end();
		}
	});

	test.todo('Pool should redact its stored password from JSON / util.inspect (roadmap)', () => {});
});

// ---------------------------------------------------------------------------
// SASLprep correctness & SCRAM hardening — unit tests on auth.ts scram()/md5Password().
// ---------------------------------------------------------------------------
describe('SCRAM-SHA-256 hardening (unit on scram())', () => {
	const nonceOf = (clientFirst: string) => {
		// clientFirst = 'n,,n=*,r=<nonce>'
		const m = clientFirst.match(/r=([^,]+)$/);
		return m![1]!;
	};
	// Reference proof/serverSignature, replicating auth.ts with explicit NFKC normalization.
	const xor = (a: Buffer, b: Buffer) => {
		const o = Buffer.alloc(a.length);
		for (let i = 0; i < a.length; i++) o[i] = a[i]! ^ b[i]!;
		return o;
	};
	const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest();
	const sha256 = (b: Buffer) => createHash('sha256').update(b).digest();
	function reference(password: string, clientNonce: string, serverFirst: string) {
		const attrs: Record<string, string> = {};
		for (const p of serverFirst.split(',')) attrs[p[0]!] = p.slice(2);
		const nonce = attrs.r!, salt = Buffer.from(attrs.s!, 'base64'), iter = parseInt(attrs.i!, 10);
		const clientFirstBare = `n=*,r=${clientNonce}`;
		const saltedPassword = pbkdf2Sync(password.normalize('NFKC'), salt, iter, 32, 'sha256');
		const clientKey = hmac(saltedPassword, 'Client Key');
		const storedKey = sha256(clientKey);
		const clientFinalNoProof = `c=biws,r=${nonce}`;
		const authMessage = `${clientFirstBare},${serverFirst},${clientFinalNoProof}`;
		const clientProof = xor(clientKey, hmac(storedKey, authMessage));
		const serverSignature = hmac(hmac(saltedPassword, 'Server Key'), authMessage);
		return { clientFinal: `${clientFinalNoProof},p=${clientProof.toString('base64')}`, serverSignature };
	}
	const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
	const serverFirstFor = (nonce: string, iter: number) => `r=${nonce}srvnonce,s=${salt.toString('base64')},i=${iter}`;

	test('iteration-count DoS cap: i=1000000 throws bad iteration count', () => {
		const s = scram('pw');
		const sf = serverFirstFor(nonceOf(s.clientFirst), 1000000);
		expect(() => s.continue(sf)).toThrow(/bad iteration count/);
	});

	test('non-positive iteration counts (0 and -1) throw', () => {
		for (const i of [0, -1]) {
			const s = scram('pw');
			expect(() => s.continue(serverFirstFor(nonceOf(s.clientFirst), i))).toThrow(/bad iteration count/);
		}
	});

	test('server-nonce binding: a server nonce not prefixed by the client nonce throws', () => {
		const s = scram('pw');
		const sf = `r=NOTtheClientNonce,s=${salt.toString('base64')},i=4096`;
		expect(() => s.continue(sf)).toThrow(/nonce mismatch/);
	});

	test('clientFirst format is exactly "n,,n=*,r=<nonce>" and continue emits c=biws,r=,p=', () => {
		const s = scram('pw');
		expect(s.clientFirst).toMatch(/^n,,n=\*,r=[^,]+$/);
		const nonce = nonceOf(s.clientFirst);
		const sf = serverFirstFor(nonce, 4096);
		const cf = s.continue(sf);
		expect(cf).toMatch(/^c=biws,r=.+,p=.+$/);
		expect(cf).toBe(reference('pw', nonce, sf).clientFinal); // locks the proof computation
	});

	test('final() verifies a correct server signature and the full happy-path vector', () => {
		const s = scram('pw');
		const nonce = nonceOf(s.clientFirst);
		const sf = serverFirstFor(nonce, 4096);
		s.continue(sf);
		const { serverSignature } = reference('pw', nonce, sf);
		expect(() => s.final(`v=${serverSignature.toString('base64')}`)).not.toThrow();
	});

	test('final() with a tampered v= throws server signature verification failed', () => {
		const s = scram('pw');
		const nonce = nonceOf(s.clientFirst);
		s.continue(serverFirstFor(nonce, 4096));
		const bogus = Buffer.alloc(32).toString('base64'); // valid length, wrong bytes
		expect(() => s.final(`v=${bogus}`)).toThrow(/server signature verification failed/);
	});

	test('final() with no v= attribute throws missing server signature', () => {
		const s = scram('pw');
		const nonce = nonceOf(s.clientFirst);
		s.continue(serverFirstFor(nonce, 4096));
		expect(() => s.final('x=nope')).toThrow(/missing server signature/);
	});

	test('SASLprep/NFKC: a Roman-numeral-nine password yields the same proof as its normalized "IX"', () => {
		const s = scram('Ⅸ'); // ROMAN NUMERAL NINE -> NFKC 'IX'
		const nonce = nonceOf(s.clientFirst);
		const sf = serverFirstFor(nonce, 4096);
		const out = s.continue(sf);
		// 'IX' is ASCII (normalize is a no-op there); equality proves scram() normalized the input.
		expect(out).toBe(reference('IX', nonce, sf).clientFinal);
	});

	test('md5Password matches the documented vector md5+md5(md5(pw+user)+salt)', () => {
		const salt4 = Buffer.from([1, 2, 3, 4]);
		const inner = createHash('md5').update(Buffer.concat([Buffer.from('pw'), Buffer.from('user')])).digest('hex');
		const expected = 'md5' + createHash('md5').update(Buffer.concat([Buffer.from(inner), salt4])).digest('hex');
		expect(md5Password('user', 'pw', salt4)).toBe(expected);
	});

	test.todo('SASL: AuthenticationSASL offering only SCRAM-SHA-256-PLUS must fail cleanly (channel binding is roadmap)', () => {});
});

// ---------------------------------------------------------------------------
// TLS must fail closed; misconfig guards (connection.ts:122-136).
// ---------------------------------------------------------------------------
describe('TLS fail-closed & misconfig guards', () => {
	let stubN: net.Server, stubJ: net.Server, portN = 0, portJ = 0;
	const ca = fs.readFileSync(SERVER_CA_PATH, 'utf8');

	beforeAll(async () => {
		stubN = net.createServer((s) =>
			s.once('data', () => {
				try {
					s.write(Buffer.from('N'));
				} catch { /* */ }
			})
		);
		stubJ = net.createServer((s) =>
			s.once('data', () => {
				try {
					s.write(Buffer.from('Z'));
				} catch { /* */ }
			})
		);
		await new Promise<void>((r) => stubN.listen(0, '127.0.0.1', () => r()));
		await new Promise<void>((r) => stubJ.listen(0, '127.0.0.1', () => r()));
		portN = (stubN.address() as net.AddressInfo).port;
		portJ = (stubJ.address() as net.AddressInfo).port;
	});
	afterAll(() => {
		stubN.close();
		stubJ.close();
	});

	test("ssl:'require' against a server replying N rejects with no plaintext fallback", async () => {
		const err = await caught(() => testConnect({ port: portN, ssl: 'require', connectTimeout: 3000 }));
		expect((err as Error).message).toMatch(/server does not support TLS/);
	});

	test('ssl:true against a server replying N also refuses (no downgrade)', async () => {
		const err = await caught(() => testConnect({ port: portN, ssl: true, connectTimeout: 3000 }));
		expect((err as Error).message).toMatch(/server does not support TLS/);
	});

	test('an unexpected SSLRequest reply byte rejects with "unexpected SSL response byte"', async () => {
		const err = await caught(() => testConnect({ port: portJ, ssl: 'require', connectTimeout: 3000 }));
		expect((err as Error).message).toMatch(/unexpected SSL response byte/);
	});

	test('ssl:false against an SSL-capable server uses plaintext startup and works', async () => {
		await withConn(async (c) => {
			expect((await c.query('select 1 as v')).rows[0] as unknown[]).toEqual([1]);
		}, { ssl: false });
	});

	test('ssl:{rejectUnauthorized:true} against a self-signed server fails closed', async () => {
		const err = await caught(() => testConnect({ ssl: { rejectUnauthorized: true } }));
		expect((err as Error).message).toMatch(/self.?signed|certificate/i);
	});

	test('ssl with the correct CA + servername verifies and connects', async () => {
		await withConn(async (c) => {
			expect((await c.query('select 1 as v')).rows[0] as unknown[]).toEqual([1]);
		}, { ssl: { ca, rejectUnauthorized: true, servername: 'localhost' } });
	});

	test('FOOTGUN: ssl:true connects to a self-signed server (maps to rejectUnauthorized:false — encryption only)', async () => {
		await withConn(async (c) => {
			// Documents that ssl:true is encrypt-without-verify; verify-full requires an ssl object + CA.
			expect((await c.query('select 1 as v')).rows[0] as unknown[]).toEqual([1]);
		}, { ssl: true });
	});

	test.todo('verify-full: a correct CA but mismatched cert CN/SAN must reject (TLS verify-full mode is roadmap)', () => {});
	test.todo('verify-ca: an sslmode-style option is not yet supported and must not silently connect insecurely (roadmap)', () => {});
	test.todo('SNI: host=IP -> servername undefined; host=name -> servername===host (internal, not yet observable)', () => {});
});

// ---------------------------------------------------------------------------
// Identifier / literal escaping helpers — current API surface + roadmap.
// ---------------------------------------------------------------------------
describe('identifier / literal escaping helpers', () => {
	test('GUARD: the public API exports no escapeIdentifier/escapeLiteral today', () => {
		expect((index as Record<string, unknown>).escapeIdentifier).toBeUndefined();
		expect((index as Record<string, unknown>).escapeLiteral).toBeUndefined();
		// identifiers cannot be parameterized; dynamic-identifier SQL is the caller's responsibility.
		expect(typeof index.connect).toBe('function');
		expect(typeof index.createPool).toBe('function');
	});
	test.todo('escapeIdentifier(\'foo\') -> "foo"; escapeIdentifier(\'fo"o\') -> "fo""o" (roadmap)', () => {});
	test.todo('escapeIdentifier(injection) yields one quoted identifier and runs no DDL (roadmap)', () => {});
	test.todo("escapeLiteral doubles quotes/backslashes and emits the E'' prefix like quote_literal (roadmap)", () => {});
});

// ---------------------------------------------------------------------------
// Out-of-scope security guards (assert absent / fails cleanly).
// ---------------------------------------------------------------------------
describe('out-of-scope security guards', () => {
	test('GUARD: a DSN passed as host is rejected without parsing it, and the error leaks no password', async () => {
		const dsn = 'postgresql://u:DSN_SECRET_PW@db.invalid:5432/x';
		const err = await caught(() => testConnect({ host: dsn, connectTimeout: 2000 }));
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).not.toContain('DSN_SECRET_PW');
	});

	test('GUARD: constructing a Connection with ssl config triggers zero fs reads (caller supplies bytes)', () => {
		const calls: unknown[] = [];
		const realSync = fs.readFileSync;
		// @ts-expect-error overriding for the duration of the assertion
		fs.readFileSync = (...a: unknown[]) => {
			calls.push(a);
			return realSync.apply(fs, a as Parameters<typeof realSync>);
		};
		try {
			void new Connection({ host: '127.0.0.1', port: 54329, ssl: { ca: 'inline-pem-bytes', cert: 'x', key: 'y' } });
		} finally {
			fs.readFileSync = realSync;
		}
		expect(calls.length).toBe(0); // Drizzle Postgres never auto-reads sslcert/sslkey/sslrootcert paths
	});

	test('GUARD: a column aliased with a JS payload is an inert string name; process keeps running', async () => {
		await withConn(async (c) => {
			const evil = '); process.exit(1);//'; // a JS payload (no embedded quote) used as a quoted identifier
			const r = await c.query(`select 1 as "${evil}"`, [], { mode: 'object' });
			expect(r.columns[0]).toBe(evil); // inert metadata, no eval/Function
			expect((r.rows[0] as Record<string, unknown>)[evil]).toBe(1);
		});
	});

	test.todo('SET LOCAL session state must not leak across pooled checkouts (transaction/reset helper is roadmap)', () => {});
});
