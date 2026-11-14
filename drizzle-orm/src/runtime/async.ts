// The async runner. One loop per run: nested programs (a `using`'s acquire, use and release, an `attempt`'s body) are
// frames on an explicit stack, not recursive runs, so a run is a single async function that awaits only where an op
// returns a Promise.
import {
	ATTEMPT,
	type Attempt,
	FAIL,
	type Fail,
	IO,
	type Io,
	KIND,
	type Op,
	type Program,
	USER,
	type User,
	USING,
	type Using,
} from './index.ts';

// What a frame is running, which decides what its end means for the frame below it
const ROOT = 0, ATTEMPTING = 1, ACQUIRING = 2, USING_ = 3, RELEASING_OK = 4, RELEASING_FAILED = 5;

interface Frame {
	program: Program<unknown>;
	role: number;
	using?: Using<unknown, unknown>;
	resource?: unknown;
	/** RELEASING_OK: the use's value; RELEASING_FAILED: the use's error */
	carried?: unknown;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
	value !== null && typeof value === 'object' && typeof (value as PromiseLike<unknown>).then === 'function';

/** Runs a core program to its result. `signal` goes to every Io that takes one. */
export async function run<A>(program: Program<A>, signal?: AbortSignal): Promise<A> {
	const stack: Frame[] = [];
	let frame: Frame = { program, role: ROOT };
	let input: unknown;
	let failed = false;
	let error: unknown;

	for (;;) {
		if (failed) {
			// The frame failed: its role decides whether the failure stops here or moves down the stack
			failed = false;
			switch (frame.role) {
				case ROOT:
					throw error;
				case ATTEMPTING:
					frame = stack.pop()!;
					input = { ok: false, error };
					continue;
				case USING_:
					frame = { program: frame.using!.release(frame.resource), role: RELEASING_FAILED, carried: error };
					input = undefined;
					continue;
				default: // ACQUIRING, RELEASING_OK, RELEASING_FAILED: nothing to clean up here
					frame = stack.pop()!;
					failed = true;
					continue;
			}
		}

		let step: IteratorResult<Op<unknown>, unknown>;
		try {
			step = frame.program.next(input);
		} catch (e) {
			failed = true;
			error = e;
			continue;
		}

		if (step.done) {
			const value = step.value;
			switch (frame.role) {
				case ROOT:
					return value as A;
				case ATTEMPTING:
					frame = stack.pop()!;
					input = { ok: true, value };
					continue;
				case ACQUIRING:
					frame = { program: frame.using!.use(value), role: USING_, using: frame.using, resource: value };
					input = undefined;
					continue;
				case USING_:
					frame = { program: frame.using!.release(frame.resource), role: RELEASING_OK, carried: value };
					input = undefined;
					continue;
				case RELEASING_OK:
					input = frame.carried;
					frame = stack.pop()!;
					continue;
				default: // RELEASING_FAILED: the use's failure goes on down
					error = frame.carried;
					frame = stack.pop()!;
					failed = true;
					continue;
			}
		}

		const op = step.value as unknown as Record<symbol, number>;
		switch (op[KIND]) {
			case IO:
			case USER: {
				try {
					const result = op[KIND] === IO
						? (op as unknown as Io<unknown>).run(signal)
						: (op as unknown as User<unknown>).value;
					input = isThenable(result) ? await result : result;
				} catch (e) {
					failed = true;
					error = e;
				}
				continue;
			}
			case FAIL:
				failed = true;
				error = (op as unknown as Fail).error;
				continue;
			case ATTEMPT:
				stack.push(frame);
				frame = { program: (op as unknown as Attempt<unknown>).body(), role: ATTEMPTING };
				input = undefined;
				continue;
			case USING: {
				const using = op as unknown as Using<unknown, unknown>;
				stack.push(frame);
				frame = { program: using.acquire(), role: ACQUIRING, using };
				input = undefined;
				continue;
			}
			default:
				failed = true;
				error = new TypeError(`drizzle-orm: a core program yielded something that is not an op: ${String(op)}`);
		}
	}
}
