// The opt-in `metrics` layer option: Drizzle Postgres timings on the statement spans that Effect creates.
import { describe, expect, test } from 'bun:test';
import { Effect, Exit, Tracer } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { DrizzlePostgresClient } from '../../src/effect/index.ts';
import { runTest } from '../helpers/effect.ts';

const TIMINGS = [
	'postgres.queue_wait_ms',
	'postgres.ttfb_ms',
	'postgres.download_ms',
	'postgres.decode_ms',
	'postgres.total_ms',
	'postgres.bytes_sent',
	'db.client.response.body.size',
	'db.response.returned_rows',
];

const recordSpans = async (statement: string, metrics: boolean) => {
	const spans: Tracer.NativeSpan[] = [];
	const tracer = Tracer.make({
		span(options) {
			const s = new Tracer.NativeSpan(options);
			spans.push(s);
			return s;
		},
	});
	await runTest(
		Effect.gen(function*() {
			const sql = yield* SqlClient;
			yield* Effect.exit(sql.unsafe(statement));
		}).pipe(Effect.withTracer(tracer)),
		{ metrics },
	);
	return spans.filter((s) => s.attributes.get('db.query.text') === statement);
};

describe('statement span metrics', () => {
	test('with the option on, the statement span carries the timing attributes', async () => {
		const [span] = await recordSpans('select generate_series(1, 3)', true);
		for (const key of TIMINGS) expect(typeof span!.attributes.get(key)).toBe('number');
		expect(span!.attributes.get('db.response.returned_rows')).toBe(3);
		expect(typeof span!.attributes.get('postgres.prepared')).toBe('boolean');
	});

	test('with the option off, the span has only the base attributes', async () => {
		const [span] = await recordSpans('select 1', false);
		for (const key of TIMINGS) expect(span!.attributes.has(key)).toBe(false);
		expect(span!.attributes.get('driver')).toBe('drizzle-postgres');
	});

	test('a failed statement still ends its span with the error status', async () => {
		const [span] = await recordSpans('select 1 / 0', true);
		expect(span!.status._tag).toBe('Ended');
		const exit = (span!.status as { exit: Exit.Exit<unknown, unknown> }).exit;
		expect(Exit.isFailure(exit)).toBe(true);
	});
});

describe('Drizzle Postgres operation span metrics', () => {
	test('with the option on, the client.query span carries the timing attributes', async () => {
		const spans: Tracer.NativeSpan[] = [];
		const tracer = Tracer.make({
			span(options) {
				const s = new Tracer.NativeSpan(options);
				spans.push(s);
				return s;
			},
		});
		await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				yield* client.query('select generate_series(1, 2)');
			}).pipe(Effect.withTracer(tracer)),
			{ metrics: true },
		);
		const span = spans.find((s) => s.attributes.get('db.operation.name') === 'query');
		for (const key of TIMINGS) expect(typeof span!.attributes.get(key)).toBe('number');
		expect(span!.attributes.get('db.response.returned_rows')).toBe(2);
	});
});
