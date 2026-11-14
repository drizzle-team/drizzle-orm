// @drizzle-team/postgres/effect/http and /effect/neon-http: DrizzlePostgresHttpClient on each HTTP backend. The fake
// gateway runs every request on the local cluster and answers with the statements' own wire frames, which is what
// the gateway forwards, so it needs no gateway. The live gateway runs with PG_HTTP_GATEWAY_URL and
// PG_CONNECTION_STRING, as integration-tests' postgres-http.test.ts does (`bash compose/dockers.sh up postgres
// postgres-http-gateway`), and Neon with NEON_HTTP_URL, as neon-http.test.ts does.
import { describe, expect, test } from 'bun:test';
import { Effect, Exit, type Layer, Redacted, Result } from 'effect';
import { DrizzlePostgresHttpClient as Gateway } from '../../src/effect/http.ts';
import { DrizzlePostgresHttpClient as Neon } from '../../src/effect/neon-http.ts';
import { PgError, testConnect } from '../helpers/db.ts';
import { neonHttpConfig } from '../helpers/neon.ts';
import { frame } from '../helpers/wire.ts';

type Service = Gateway.DrizzlePostgresHttpClient;

const errorFrame = (code: string, message: string) =>
	frame('E', Buffer.from(`SERROR\0VERROR\0C${code}\0M${message}\0\0`));

// The gateway protocol over the local cluster: POST a statement, a batch or a pipeline; the body is the wire stream
const fakeGateway = (): typeof fetch =>
	(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const request = JSON.parse(init?.body as string) as {
			sql?: string;
			params?: unknown[];
			mode?: 'batch' | 'pipeline';
			queries?: { sql: string; params?: unknown[] }[];
		};
		const statements = request.queries ?? [{ sql: request.sql!, params: request.params }];
		const conn = await testConnect();
		const parts: Buffer[] = [];
		try {
			if (request.mode === 'batch') await conn.query('begin');
			let aborted = false;
			for (const s of statements) {
				if (aborted) {
					parts.push(errorFrame('25P02', 'current transaction is aborted'));
					continue;
				}
				try {
					for (const f of await conn.query(s.sql, s.params ?? [], { mode: 'wire' })) parts.push(Buffer.from(f));
				} catch (e) {
					if (!(e instanceof PgError)) throw e;
					parts.push(errorFrame(e.code ?? 'XX000', e.message));
					if (request.mode === 'batch') aborted = true;
				}
			}
			if (request.mode === 'batch') await conn.query(aborted ? 'rollback' : 'commit');
		} finally {
			await conn.end();
		}
		return new Response(new Uint8Array(Buffer.concat(parts)), {
			headers: { 'Content-Type': 'application/vnd.minipg.pgwire' },
		});
	}) as typeof fetch;

const backends: [string, () => Layer.Layer<Service, unknown>][] = [
	['the gateway protocol', () => Gateway.layer({ url: 'https://gateway.test/query', fetch: fakeGateway() })],
];
if (process.env.PG_HTTP_GATEWAY_URL && process.env.PG_CONNECTION_STRING) {
	// The gateway picks its upstream database from this header
	const upstream = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const headers = new Headers(init?.headers);
		headers.set('Neon-Connection-String', process.env.PG_CONNECTION_STRING!);
		return fetch(input, { ...init, headers });
	}) as typeof fetch;
	backends.push(['a live gateway', () => Gateway.layer({ url: process.env.PG_HTTP_GATEWAY_URL!, fetch: upstream })]);
}
if (process.env.NEON_HTTP_URL) {
	backends.push(['Neon HTTP', () => {
		const { url, ...rest } = neonHttpConfig(process.env.NEON_HTTP_URL!);
		return Neon.layer({ url: Redacted.make(url), ...rest });
	}]);
}

describe.each(backends)('DrizzlePostgresHttpClient over %s', (_name, layer) => {
	const T = `effect_http_${process.pid}`;
	const run = <A, E>(f: (client: Service) => Effect.Effect<A, E>) =>
		Effect.runPromise(Effect.provide(Effect.flatMap(Effect.service(Gateway.DrizzlePostgresHttpClient), f), layer()));
	const reset = () =>
		run((c) =>
			Effect.andThen(
				c.query(`drop table if exists ${T}`),
				c.query(`create table ${T} (id int primary key, name text)`),
			)
		);
	const ids = () =>
		run((c) => Effect.map(c.query(`select id from ${T} order by id`), (r) => r.rows.map((row) => row[0])));

	test('query returns rows in the mode asked for', async () => {
		const [arrays, objects] = await run((c) =>
			Effect.all([c.query('select $1::int as n', [1]), c.query('select $1::text as t', ['a'], { mode: 'object' })])
		);
		expect(arrays.rows).toEqual([[1]]);
		expect(objects.rows).toEqual([{ t: 'a' }]);
	}, 20000);

	test('batch commits every statement, or none of them', async () => {
		await reset();
		const results = await run((c) =>
			c.batch([{ sql: `insert into ${T} values (1, 'a')` }, { sql: `select count(*)::int from ${T}` }])
		);
		expect(results[1]!.rows).toEqual([[1]]);
		const failed = await run((c) =>
			Effect.exit(c.batch([{ sql: `insert into ${T} values (2, 'b')` }, { sql: `insert into ${T} values (1, 'dup')` }]))
		);
		expect(Exit.isFailure(failed)).toBe(true);
		expect(await ids()).toEqual([1]);
	}, 20000);

	test('pipeline gives each statement its own outcome, and each commits on its own', async () => {
		await reset();
		const outcomes = await run((c) =>
			c.pipeline([
				{ sql: `insert into ${T} values (1, 'a')` },
				{ sql: 'select 1/0' },
				{ sql: `insert into ${T} values (2, 'b')` },
			])
		);
		expect(outcomes.map(Result.isSuccess)).toEqual([true, false, true]);
		const failure = outcomes[1]!;
		expect(Result.isFailure(failure) && failure.failure._tag).toBe('SqlError');
		expect(await ids()).toEqual([1, 2]);
	}, 20000);
});
