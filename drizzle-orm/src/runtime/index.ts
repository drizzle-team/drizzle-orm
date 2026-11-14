// A runtime-agnostic core: logic written once as generators over a few ops, run by the async runner (./async.ts) or
// natively by Effect (./effect.ts). This file imports nothing from `effect`.
//
// Rules for core code:
// - Sequence with `yield*` on ops. An op is the only way to do I/O or call user code.
// - No try/catch/finally around `yield*`: Effect.gen never calls throw() or return() on the generator, so a catch or
//   finally there would run under the async runner and be skipped under Effect. Use `using` for cleanup and
//   `attempt` to inspect a failure.
// - A function that is one op returns the op, not a generator: entries run it directly, and other core code can
//   `yield*` it like a program.
import { entityKind, is } from '~/entity.ts';

export type Program<A> = Generator<Op<unknown>, A, any>;

/** A step that a runner executes. `yield* op` gives its result. */
export interface Op<A> {
	[Symbol.iterator](): Iterator<Op<unknown>, A, any>;
}

/** Where an op's kind is stored on its class. A registered symbol, so runners also recognize the ops of another copy
 *  of this module (two drizzle-orm installs in one process). */
export const KIND: unique symbol = Symbol.for('drizzle.runtime.kind') as never;
export const IO = 0, USER = 1, FAIL = 2, ATTEMPT = 3, USING = 4;

/** Who an Io belongs to. The Effect entry of that owner sets `toEffectError`, which turns what the Promise rejected
 *  with into the failure of the Effect; the async API rejects with the original. */
export interface ErrorDomain {
	toEffectError?: (error: unknown) => unknown;
}

// `yield* op` hands the op to the runner and evaluates to what the runner resumes with. A one-shot iterator does that
// without the generator object that a `*[Symbol.iterator]` method would allocate per op, and it is its own
// IteratorResult, so a `yield*` allocates one object, not three. `yield*` reads `done` and `value` before calling
// `next` again, so reusing the object is safe. Under Effect it yields the op itself, an Effect once ./effect.ts has
// grafted the op classes, and Effect.gen resumes it with the op's result.
class OpIterator {
	static readonly [entityKind]: string = 'RuntimeOpIterator';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	done = false;
	value: unknown;
	private yielded = false;
	constructor(op: Op<unknown>) {
		this.value = op;
	}
	next(value?: unknown): this {
		if (this.yielded) {
			this.done = true;
			this.value = value;
		}
		this.yielded = true;
		return this;
	}
}

// The op classes extend nothing: on V8 every level of class inheritance makes constructing an op slower, and ops are
// built per step. Each one has the same iterator.

/** I/O through a Promise. `signal` aborts it: an interrupted Effect, or the caller's AbortSignal. A `run` that takes
 *  no parameter can't be canceled, and costs no AbortController under Effect. */
export class Io<A> implements Op<A> {
	static readonly [entityKind]: string = 'RuntimeIo';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		readonly run: (signal: AbortSignal | undefined) => Promise<A>,
		readonly domain: ErrorDomain | undefined,
	) {}
	[Symbol.iterator](): Iterator<Op<unknown>, A, any> {
		return new OpIterator(this) as never;
	}
}

/** A value from user code: a Promise (or a plain value) for the async API, an Effect for the Effect API. */
export class User<A> implements Op<A> {
	static readonly [entityKind]: string = 'RuntimeUser';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(readonly value: unknown) {}
	[Symbol.iterator](): Iterator<Op<unknown>, A, any> {
		return new OpIterator(this) as never;
	}
}

/** Acquires a resource, uses it, and releases it however the use ends, also on interruption. */
export class Using<R, A> implements Op<A> {
	static readonly [entityKind]: string = 'RuntimeUsing';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		readonly acquire: () => Program<R>,
		readonly use: (resource: R) => Program<A>,
		readonly release: (resource: R) => Program<void>,
	) {}
	[Symbol.iterator](): Iterator<Op<unknown>, A, any> {
		return new OpIterator(this) as never;
	}
}

export type Outcome<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: unknown };

/** Runs a program and gives its failure as a value instead of failing. Interruption is not a failure. */
export class Attempt<A> implements Op<Outcome<A>> {
	static readonly [entityKind]: string = 'RuntimeAttempt';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(readonly body: () => Program<A>) {}
	[Symbol.iterator](): Iterator<Op<unknown>, Outcome<A>, any> {
		return new OpIterator(this) as never;
	}
}

/** Fails with `error`. */
export class Fail implements Op<never> {
	static readonly [entityKind]: string = 'RuntimeFail';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(readonly error: unknown) {}
	[Symbol.iterator](): Iterator<Op<unknown>, never, any> {
		return new OpIterator(this) as never;
	}
}

const setKind = (op: { prototype: object }, kind: number) => {
	(op.prototype as Record<symbol, number>)[KIND] = kind;
};
setKind(Io, IO);
setKind(User, USER);
setKind(Fail, FAIL);
setKind(Attempt, ATTEMPT);
setKind(Using, USING);

/** Every op class, for the entries that give each class its runtime behavior. */
export const opClasses = [Io, User, Using, Attempt, Fail] as const;

export const io = <A>(run: (signal: AbortSignal | undefined) => Promise<A>, domain?: ErrorDomain) =>
	new Io<A>(run, domain);
export const user = <A>(value: unknown) => new User<A>(value);
export const using = <R, A>(
	acquire: () => Program<R>,
	use: (resource: R) => Program<A>,
	release: (resource: R) => Program<void>,
) => new Using<R, A>(acquire, use, release);
export const attempt = <A>(body: () => Program<A>) => new Attempt<A>(body);
export const fail = (error: unknown) => new Fail(error);
