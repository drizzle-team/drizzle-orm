import { Effect } from 'effect';
import { entityKind } from '~/entity.ts';
import { type Cache as Wrapped, type MutationOption, NoopCache } from './cache.ts';
import type { CacheConfig } from './types.ts';

export class EffectCache {
	static readonly [entityKind]: string = 'EffectCache';

	constructor(private readonly wrapped: Wrapped) {}

	strategy = () => this.wrapped.strategy();

	get(
		key: string,
		tables: string[],
		isTag: boolean,
		isAutoInvalidate?: boolean,
	): Effect.Effect<any[] | undefined, unknown, never> {
		const promise = this.wrapped.get(key, tables, isTag, isAutoInvalidate);
		return Effect.tryPromise(() => promise);
	}

	put(
		hashedQuery: string,
		response: any,
		tables: string[],
		isTag: boolean,
		config?: CacheConfig,
	): Effect.Effect<void, unknown, never> {
		const promise = this.wrapped.put(hashedQuery, response, tables, isTag, config);

		return Effect.tryPromise(() => promise);
	}

	onMutate(params: MutationOption): Effect.Effect<void, unknown, never> {
		const promise = this.wrapped.onMutate(params);

		return Effect.tryPromise(() => promise);
	}
}

export const EffectNoopCache = new EffectCache(new NoopCache());
