import type { SqlClient } from '@effect/sql/SqlClient';
import type { SqlError } from '@effect/sql/SqlError';
import type { Effect } from 'effect';

interface EffectWrappable {
	effect: (placeholderValues?: Record<string, unknown>) => Effect.Effect<any, SqlError, SqlClient>;
}

export function effectWrap<T extends EffectWrappable>(target: T): T {
	const tryPromise = target.effect();

	return new Proxy(target, {
		get(target, p) {
			if (typeof p === 'string' && ['then', 'catch', 'finally'].includes(p)) {
				throw new Error(
					'Cannot use Effect query as promise. Use `yield* query` or `Effect.runPromise(query)` instead.',
				);
			}
			if (p in target) return target[p as keyof EffectWrappable];

			return tryPromise[p as keyof typeof tryPromise];
		},
		set(target, p, newValue) {
			if (p in target) return (<any> target[p as keyof typeof target]) = newValue as any;

			return (<any> tryPromise[p as keyof typeof tryPromise]) = newValue;
		},
	});
}
