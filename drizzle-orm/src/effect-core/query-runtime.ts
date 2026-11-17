import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import type { QueryRuntime } from '~/query-runtime.ts';
import { hasTelemetry } from '~/tracing.ts';
import { EffectDrizzleQueryError } from './errors.ts';

type AnyEffect = Effect.Effect<unknown, unknown, unknown>;

/** @internal Effects: a failed query fails with a typed `EffectDrizzleQueryError` */
export const effectQueryRuntime: QueryRuntime = {
	suspend: (body) => Effect.suspend(body as () => AnyEffect),
	andThen: (first, next) => Effect.flatMap(first as AnyEffect, next as (value: unknown) => AnyEffect),
	transform: (run, onRows, onError) => {
		let query: AnyEffect;
		try {
			query = run() as AnyEffect;
		} catch (e) {
			return Effect.fail(onError(e));
		}
		const caught = Effect.catch(query, (e) => Effect.fail(onError(e)));
		return onRows ? Effect.map(caught, onRows) : caught;
	},
	sync: (body) => Effect.sync(body),
	span: (name, attributes, body) => hasTelemetry ? Effect.withSpan(body() as AnyEffect, name, { attributes }) : body(),
	queryError: (query, params, cause) =>
		new EffectDrizzleQueryError({ query, params: params as any[] | undefined, cause: Cause.fail(cause) }),
};
