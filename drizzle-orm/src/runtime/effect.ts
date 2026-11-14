// The Effect side. Importing this module makes every op an Effect, so Effect.gen runs core programs natively: in the
// caller's fiber, with its context, interruption and typed errors. Nothing else in this package imports `effect`.
import * as Effect from 'effect/Effect';
import * as Effectable from 'effect/Effectable';
import * as Result from 'effect/Result';
import { Attempt, Fail, Io, opClasses, type Outcome, type Program, User, Using } from './index.ts';

/** Runs a core program as an Effect. `body` runs again on every run, so the Effect can run any number of times.
 *  The error and requirement types are the caller's to declare: the core doesn't know them. */
export const fromProgram = <A, E = unknown, R = never>(body: () => Program<A>): Effect.Effect<A, E, R> =>
	Effect.gen(body as never) as Effect.Effect<A, E, R>;

const TO_EFFECT = Symbol.for('drizzle.runtime.toEffect');

// Effect's prototype becomes the parent of each op class's prototype, so ops are Effects, and no keys are added to a
// prototype already in use. Each op keeps its own one-shot iterator, which yields the op to Effect.gen as the Effect
// to run. Evaluating an op calls its class's own TO_EFFECT method, one call instead of a chain of instanceof checks.
const effectProto = Effectable.Prototype({
	label: 'DrizzleRuntimeOp',
	evaluate(this: Record<symbol, () => Effect.Effect<unknown, unknown, unknown>>) {
		return this[TO_EFFECT]!();
	},
} as never);
for (const op of opClasses) Object.setPrototypeOf(op.prototype, effectProto);

const define = <T>(
	op: abstract new(...args: any[]) => T,
	toEffect: (this: T) => Effect.Effect<unknown, unknown, unknown>,
) => {
	(op.prototype as Record<symbol, unknown>)[TO_EFFECT] = toEffect;
};

const identity = (error: unknown) => error;

// `try` is the op's own function: tryPromise allocates an AbortController only for a function that takes the signal,
// so an Io that can't be canceled doesn't pay for one. `catch` is the domain's mapper, created once by its owner:
// a new closure per op costs ~110 ns on V8.
define(Io, function() {
	return Effect.tryPromise({ try: this.run as never, catch: this.domain?.toEffectError ?? identity });
});
define(User, function() {
	return this.value as Effect.Effect<unknown, unknown, unknown>;
});
define(Fail, function() {
	return Effect.fail(this.error);
});
define(Attempt, function() {
	return Effect.map(
		Effect.result(fromProgram(this.body)),
		(r): Outcome<unknown> => Result.isSuccess(r) ? { ok: true, value: r.success } : { ok: false, error: r.failure },
	);
});
define(Using, function() {
	const { acquire, use, release } = this;
	return Effect.acquireUseRelease(
		fromProgram(acquire),
		(resource) => fromProgram(() => use(resource)),
		(resource) => Effect.orDie(fromProgram(() => release(resource))),
	);
});

/** An op as the Effect it is once this module is loaded. For entries that return a single op to their caller. */
export const asEffect = <A, E = unknown, R = never>(op: { [Symbol.iterator](): Iterator<unknown, A, any> }) =>
	op as unknown as Effect.Effect<A, E, R>;
