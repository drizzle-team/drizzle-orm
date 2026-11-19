// The client's own spans (client.query, bulk calls, COPY): what they cost per query. Requires `bun run test:setup`.
//
// Effect.withSpan captures a stack trace for the span unless told not to: it sets Error.stackTraceLimit and builds
// an Error on every call, about 6 µs per query, and the frame it records is inside this client, not the caller's
// code. Effect's own SqlClient statements don't capture one either. Without a tracer installed nothing reads the
// span, so the client doesn't create one at all.
import { describe, expect, test } from 'bun:test';
import { Effect, Tracer } from 'effect';
import { DrizzlePostgresClient } from '../../src/effect/index.ts';
import { runTest } from '../helpers/effect.ts';

// How many times `run` captured a stack for a span: each capture sets Error.stackTraceLimit
const stackCaptures = async (run: () => Promise<unknown>): Promise<number> => {
	const descriptor = Object.getOwnPropertyDescriptor(Error, 'stackTraceLimit')!;
	let value = Error.stackTraceLimit;
	let sets = 0;
	Object.defineProperty(Error, 'stackTraceLimit', {
		configurable: true,
		get: () => value,
		set: (v: number) => {
			sets++;
			value = v;
		},
	});
	try {
		await run();
	} finally {
		Object.defineProperty(Error, 'stackTraceLimit', descriptor);
		Error.stackTraceLimit = value;
	}
	return sets;
};

const recordingTracer = () => {
	const spans: Tracer.NativeSpan[] = [];
	const tracer = Tracer.make({
		span(options) {
			const span = new Tracer.NativeSpan(options);
			spans.push(span);
			return span;
		},
	});
	return { spans, tracer };
};

const queries = (n: number) =>
	Effect.gen(function*() {
		const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
		yield* client.query('select 1'); // connect before counting
		return Effect.gen(function*() {
			for (let i = 0; i < n; i++) yield* client.query('select $1::int4', [i]);
		});
	});

describe('DrizzlePostgresClient spans', () => {
	test('client.query captures no stack trace, with or without a tracer', async () => {
		const { tracer } = recordingTracer();
		for (const withTracer of [false, true]) {
			const sets = await runTest(
				Effect.gen(function*() {
					const run = yield* queries(20);
					const services = yield* Effect.context<never>();
					return yield* Effect.promise(() =>
						stackCaptures(() => Effect.runPromiseWith(services)(withTracer ? run.pipe(Effect.withTracer(tracer)) : run))
					);
				}),
			);
			expect({ withTracer, sets }).toEqual({ withTracer, sets: 0 });
		}
	});

	test('with a tracer installed, client.query still gets its span and attributes', async () => {
		const { spans, tracer } = recordingTracer();
		await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				yield* client.query('select $1::int4 as n', [7]);
			}).pipe(Effect.withTracer(tracer)),
		);
		const query = spans.filter((s) => s.attributes.get('db.operation.name') === 'query');
		expect(query).toHaveLength(1);
		expect(query[0]!.kind).toBe('client');
		expect(query[0]!.attributes.get('db.query.text')).toBe('select $1::int4 as n');
		expect(query[0]!.attributes.get('db.system.name')).toBe('postgresql');
	});

	test('with metrics, the span carries the query timings', async () => {
		const { spans, tracer } = recordingTracer();
		await runTest(
			Effect.gen(function*() {
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				yield* client.query('select 1');
			}).pipe(Effect.withTracer(tracer)),
			{ metrics: true },
		);
		const query = spans.find((s) => s.attributes.get('db.operation.name') === 'query')!;
		expect([...query.attributes.keys()].some((key) => key.startsWith('postgres.'))).toBe(true);
	});
});
