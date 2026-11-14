// Core programs under both runners: each case is one generator, run by the async runner and by Effect.gen, and
// both must end the same way.
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import { describe, expect, test } from 'vitest';
import { run } from '~/runtime/async.ts';
import { asEffect, fromProgram } from '~/runtime/effect.ts';
import { attempt, type ErrorDomain, fail, io, type Program, user, using } from '~/runtime/index.ts';

type Ended = { ok: true; value: unknown } | { ok: false; error: unknown };

const underAsync = (body: () => Program<unknown>): Promise<Ended> =>
	run(body()).then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error }));

const underEffect = async (body: () => Program<unknown>): Promise<Ended> => {
	const exit = await Effect.runPromiseExit(fromProgram(body));
	if (Exit.isSuccess(exit)) return { ok: true, value: exit.value };
	const failure = exit.cause.reasons.find((r) => r._tag === 'Fail');
	if (!failure) throw new Error(`not a failure: ${String(exit.cause)}`);
	return { ok: false, error: (failure as { error: unknown }).error };
};

/** Runs `body` under both runners and checks that they end the same way. `body` is built per runner. */
const both = async (body: (log: string[]) => () => Program<unknown>) => {
	const asyncLog: string[] = [];
	const effectLog: string[] = [];
	const asyncEnd = await underAsync(body(asyncLog));
	const effectEnd = await underEffect(body(effectLog));
	expect(effectEnd).toEqual(asyncEnd);
	expect(effectLog).toEqual(asyncLog);
	return { end: asyncEnd, log: asyncLog };
};

const later = <A>(value: A) => new Promise<A>((resolve) => setTimeout(() => resolve(value), 1));

describe('sequencing', () => {
	test('yield* gives each op its result, in order', async () => {
		const { end } = await both(() =>
			function*() {
				const a = yield* io(() => later(1));
				const b = yield* io(() => Promise.resolve(a + 1));
				return [a, b];
			}
		);
		expect(end).toEqual({ ok: true, value: [1, 2] });
	});

	test('a core function that is one op can be yielded like a program', async () => {
		const double = (n: number) => io(() => later(n * 2));
		const { end } = await both(() =>
			function*() {
				return (yield* double(2)) + (yield* double(3));
			}
		);
		expect(end).toEqual({ ok: true, value: 10 });
	});
});

describe('failures', () => {
	test('a rejected io fails the program with what it rejected with', async () => {
		const boom = new Error('boom');
		const { end, log } = await both((log) =>
			function*() {
				yield* io(() => Promise.reject(boom));
				log.push('not reached');
			}
		);
		expect(end).toEqual({ ok: false, error: boom });
		expect(log).toEqual([]);
	});

	test('fail fails the program; attempt gives the failure, or the value, as an outcome', async () => {
		const { end } = await both(() =>
			function*() {
				const failed = yield* attempt(function*() {
					yield* io(() => later(1));
					return yield* fail('inner');
				});
				const fine = yield* attempt(function*() {
					return yield* io(() => later('value'));
				});
				return [failed, fine];
			}
		);
		expect(end).toEqual({ ok: true, value: [{ ok: false, error: 'inner' }, { ok: true, value: 'value' }] });
	});
});

describe('using', () => {
	const resource = (log: string[], name: string) =>
		[
			function*() {
				log.push(`acquire ${name}`);
				return yield* io(() => later(name));
			},
			function*(r: string) {
				log.push(`release ${r}`);
				yield* io(() => later(undefined));
			},
		] as const;

	test('releases after the use, and gives the use its value', async () => {
		const { end, log } = await both((log) =>
			function*() {
				const [acquire, release] = resource(log, 'a');
				return yield* using(acquire, function*(r) {
					log.push(`use ${r}`);
					return yield* io(() => later(`${r}!`));
				}, release);
			}
		);
		expect(end).toEqual({ ok: true, value: 'a!' });
		expect(log).toEqual(['acquire a', 'use a', 'release a']);
	});

	test('releases when the use fails, and fails with the use failure', async () => {
		const { end, log } = await both((log) =>
			function*() {
				const [acquire, release] = resource(log, 'a');
				return yield* using(acquire, function*(): Program<never> {
					return yield* fail('use failed');
				}, release);
			}
		);
		expect(end).toEqual({ ok: false, error: 'use failed' });
		expect(log).toEqual(['acquire a', 'release a']);
	});

	test('nested resources release innermost first; a failed acquire releases nothing of its own', async () => {
		const { end, log } = await both((log) =>
			function*() {
				const [acquireA, releaseA] = resource(log, 'a');
				return yield* using(acquireA, function*() {
					return yield* using(
						function*(): Program<string> {
							log.push('acquire b');
							return yield* fail('no b');
						},
						// oxlint-disable-next-line require-yield -- a program with no ops
						function*() {
							log.push('not reached');
						},
						// oxlint-disable-next-line require-yield -- a program with no ops
						function*() {
							log.push('not reached');
						},
					);
				}, releaseA);
			}
		);
		expect(end).toEqual({ ok: false, error: 'no b' });
		expect(log).toEqual(['acquire a', 'acquire b', 'release a']);
	});
});

describe('what differs by runtime', () => {
	test('user code: a Promise under async, an Effect under Effect', async () => {
		const body = (value: unknown) =>
			function*() {
				return yield* user<number>(value);
			};
		expect(await underAsync(body(later(7)))).toEqual({ ok: true, value: 7 });
		expect(await underAsync(body(7))).toEqual({ ok: true, value: 7 });
		expect(await underEffect(body(Effect.succeed(7)))).toEqual({ ok: true, value: 7 });
		expect(await underEffect(body(Effect.fail('typed')))).toEqual({ ok: false, error: 'typed' });
	});

	test("an io's error domain maps the failure for Effect only", async () => {
		const domain: ErrorDomain = { toEffectError: (e) => ({ mapped: e }) };
		const body = () =>
			function*() {
				return yield* io(() => Promise.reject('raw'), domain);
			};
		expect(await underAsync(body())).toEqual({ ok: false, error: 'raw' });
		expect(await underEffect(body())).toEqual({ ok: false, error: { mapped: 'raw' } });
	});

	test('async: the signal reaches every io', async () => {
		const controller = new AbortController();
		const seen: (AbortSignal | undefined)[] = [];
		await run(
			(function*() {
				yield* io(async (signal) => void seen.push(signal));
				yield* using(
					function*() {
						return yield* io(async (signal) => void seen.push(signal));
					},
					function*() {},
					function*() {},
				);
			})(),
			controller.signal,
		);
		expect(seen).toEqual([controller.signal, controller.signal]);
	});

	test('Effect: an interrupt in the use still releases, and aborts the running io', async () => {
		const log: string[] = [];
		const program = fromProgram(function*() {
			return yield* using(
				function*() {
					return yield* io(() => later('r'));
				},
				function*() {
					yield* io((signal) =>
						new Promise<void>((_, reject) => {
							signal!.addEventListener('abort', () => {
								log.push('aborted');
								reject(new Error('aborted'));
							});
						})
					);
				},
				// oxlint-disable-next-line require-yield -- a program with no ops
				function*(r) {
					log.push(`release ${r}`);
				},
			);
		});
		await Effect.runPromise(Effect.gen(function*() {
			const fiber = yield* Effect.forkChild(program);
			yield* Effect.sleep('20 millis');
			yield* Fiber.interrupt(fiber);
		}));
		expect(log).toEqual(['aborted', 'release r']);
	});

	test('Effect: a single op is an Effect, and runs again on every run', async () => {
		let runs = 0;
		const op = asEffect<number>(io(async () => ++runs));
		expect([await Effect.runPromise(op), await Effect.runPromise(op)]).toEqual([1, 2]);
	});
});
