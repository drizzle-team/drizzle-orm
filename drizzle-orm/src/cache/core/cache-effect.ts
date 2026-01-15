import { Effect } from 'effect';
import { entityKind } from '~/entity.ts';
import { type Cache as Wrapped, type MutationOption, NoopCache } from './cache.ts';
import type { CacheConfig } from './types.ts';

export class EffectCache {
	static readonly [entityKind]: string = 'EffectCache';

	constructor(readonly wrapped: Wrapped) {}

	strategy = () => this.wrapped.strategy();

	get(
		key: string,
		tables: string[],
		isTag: boolean,
		isAutoInvalidate?: boolean,
	): Effect.Effect<any[] | undefined, unknown, never> {
		return Effect.tryPromise(() => this.wrapped.get(key, tables, isTag, isAutoInvalidate));
	}

	put(
		hashedQuery: string,
		response: any,
		tables: string[],
		isTag: boolean,
		config?: CacheConfig,
	): Effect.Effect<void, unknown, never> {
		return Effect.tryPromise(() => this.wrapped.put(hashedQuery, response, tables, isTag, config));
	}

	onMutate(params: MutationOption): Effect.Effect<void, unknown, never> {
		return Effect.tryPromise(() => this.wrapped.onMutate(params));
	}
}

export const EffectNoopCache = new EffectCache(new NoopCache());
