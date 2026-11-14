// @drizzle-team/postgres/effect/aurora offline: the Data API calls that DrizzleAuroraClient's transactions make, with
// an injected fetch. test/integration/effect-aurora.test.ts runs the same client against a Data API.
import { describe, expect, test } from 'bun:test';
import { Effect, Redacted } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { DrizzleAuroraClient } from '../../src/effect/aurora.ts';

const dataApi = () => {
	const calls: Array<{ op: string; sql?: string; transactionId?: string }> = [];
	let next = 0;
	const fetch = (async (url: string, init: RequestInit) => {
		const op = url.split('/').pop()!;
		const body = JSON.parse(init.body as string);
		calls.push({ op, sql: body.sql, transactionId: body.transactionId });
		const json = op === 'BeginTransaction'
			? { transactionId: `TX-${++next}` }
			: op === 'Execute'
			? { columnMetadata: [{ name: 'v', typeName: 'int4' }], records: [[{ longValue: 1 }]] }
			: op === 'BatchExecute'
			? { updateResults: [{ generatedFields: [] }, { generatedFields: [] }] }
			: { transactionStatus: 'done' };
		return new Response(JSON.stringify(json), { status: 200 });
	}) as unknown as typeof globalThis.fetch;
	const layer = DrizzleAuroraClient.layer({
		resourceArn: 'arn:aws:rds:eu-central-1:123456789012:cluster:c',
		secretArn: 'arn:aws:secretsmanager:eu-central-1:123456789012:secret:s',
		credentials: { accessKeyId: 'AKID', secretAccessKey: Redacted.make('SECRET') },
		fetch,
	});
	const run = <A, E>(effect: Effect.Effect<A, E, DrizzleAuroraClient.DrizzleAuroraClient | SqlClient>) =>
		Effect.runPromise(Effect.provide(effect, layer));
	return { calls, run };
};

describe('DrizzleAuroraClient transactions', () => {
	test('withTransaction: BeginTransaction, statements with its transactionId, CommitTransaction', async () => {
		const { calls, run } = dataApi();
		await run(Effect.gen(function*() {
			const sql = yield* SqlClient;
			yield* sql.withTransaction(Effect.andThen(sql`select 1 as v`, sql`select 2 as v`));
		}));
		expect(calls).toEqual([
			{ op: 'BeginTransaction', sql: undefined, transactionId: undefined },
			{ op: 'Execute', sql: 'select 1 as v', transactionId: 'TX-1' },
			{ op: 'Execute', sql: 'select 2 as v', transactionId: 'TX-1' },
			{ op: 'CommitTransaction', sql: undefined, transactionId: 'TX-1' },
		]);
	});

	test('a failure rolls back, and a nested transaction is a savepoint', async () => {
		const { calls, run } = dataApi();
		await run(Effect.gen(function*() {
			const sql = yield* SqlClient;
			yield* sql.withTransaction(Effect.gen(function*() {
				yield* sql.withTransaction(sql`select 1 as v`);
				yield* Effect.fail('stop');
			})).pipe(Effect.ignore);
		}));
		expect(calls.map((c) => [c.op, c.sql ?? null, c.transactionId ?? null])).toEqual([
			['BeginTransaction', null, null],
			['Execute', 'SAVEPOINT effect_sql_1', 'TX-1'],
			['Execute', 'select 1 as v', 'TX-1'],
			['Execute', 'RELEASE SAVEPOINT effect_sql_1', 'TX-1'],
			['RollbackTransaction', null, 'TX-1'],
		]);
	});

	test('transaction settings, query, batchExecute and batch run inside the Data API transaction', async () => {
		const { calls, run } = dataApi();
		const result = await run(Effect.gen(function*() {
			const client = yield* DrizzleAuroraClient.DrizzleAuroraClient;
			const inTx = yield* client.withTransaction(
				Effect.andThen(
					client.batchExecute('insert into t values (:p1)', [[1], [2]]),
					client.query('select 1 as v', [], { mode: 'object' }),
				),
				{ isolation: 'serializable' },
			);
			const batched = yield* client.batch([client.query('select 1 as v'), client.query('select 1 as v')]);
			return [inTx.rows, batched.map((r) => r.rows)];
		}));
		expect(result).toEqual([[{ v: 1 }], [[[1]], [[1]]]]);
		expect(calls.map((c) => [c.op, c.sql ?? null, c.transactionId ?? null])).toEqual([
			['BeginTransaction', null, null],
			['Execute', 'set transaction isolation level serializable', 'TX-1'],
			['BatchExecute', 'insert into t values (:p1)', 'TX-1'],
			['Execute', 'select 1 as v', 'TX-1'],
			['CommitTransaction', null, 'TX-1'],
			['BeginTransaction', null, null],
			['Execute', 'select 1 as v', 'TX-2'],
			['Execute', 'select 1 as v', 'TX-2'],
			['CommitTransaction', null, 'TX-2'],
		]);
	});

	test('statements outside a transaction carry no transactionId', async () => {
		const { calls, run } = dataApi();
		await run(Effect.gen(function*() {
			const client = yield* DrizzleAuroraClient.DrizzleAuroraClient;
			yield* client.pipeline([client.query('select 1 as v'), client.query('select 1 as v')]);
		}));
		expect(calls.map((c) => [c.op, c.transactionId ?? null])).toEqual([['Execute', null], ['Execute', null]]);
	});
});
