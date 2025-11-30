import { Effect } from 'effect';
import { entityKind } from '~/entity.ts';
import { type Cache as Wrapped, type MutationOption, NoopCache } from './cache.ts';
import type { CacheConfig } from './types.ts';

export class EffectCache {
	static readonly [entityKind]: string = 'EffectCache';

	constructor(private readonly wrapped: Wrapped) {}

	get(
		key: string,
		tables: string[],
		isTag: boolean,
		isAutoInvalidate?: boolean,
	): Effect.Effect<any[] | undefined, unknown, never> {
		const promise = this.wrapped.get(key, tables, isTag, isAutoInvalidate);
		return Effect.tryPromise({
			try: () => promise,
			catch: (e) => e,
		});
	}

	put(
		hashedQuery: string,
		response: any,
		tables: string[],
		isTag: boolean,
		config?: CacheConfig,
	): Effect.Effect<void, unknown, never> {
		const promise = this.wrapped.put(hashedQuery, response, tables, isTag, config);

		return Effect.tryPromise({
			try: () => promise,
			catch: (e) => e,
		});
	}

	onMutate(params: MutationOption): Effect.Effect<void, unknown, never> {
		const promise = this.wrapped.onMutate(params);

		return Effect.tryPromise({
			try: () => promise,
			catch: (e) => e,
		});
	}
}

export const EffectNoopCache = new EffectCache(new NoopCache());
