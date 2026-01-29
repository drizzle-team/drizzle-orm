import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { entityKind } from '~/entity.ts';
import { type Cache as DrizzleCache, type MutationOption, NoopCache } from './cache.ts';

export class EffectCache extends Effect.Service<EffectCache>()('drizzle-orm/EffectCache', {
	sync: () => make(new NoopCache()),
	accessors: true,
}) {
	static readonly [entityKind]: string = 'EffectCache';

	static fromDrizzle(cache: DrizzleCache) {
		return new EffectCache(make(cache));
	}

	static layerFromDrizzle(cache: DrizzleCache) {
		return Layer.succeed(EffectCache, EffectCache.fromDrizzle(cache));
	}
}

function make(cache: DrizzleCache) {
	const strategy = () => cache.strategy();

	const get = (...args: Parameters<DrizzleCache['get']>) =>
		Effect.tryPromise({
			try: () => cache.get(...args),
			catch: (error) => new EffectCacheError({ cause: error }),
		});

	const put = (...args: Parameters<DrizzleCache['put']>) =>
		Effect.tryPromise({
			try: () => cache.put(...args),
			catch: (error) => new EffectCacheError({ cause: error }),
		});

	const onMutate = (params: MutationOption) =>
		Effect.tryPromise({
			try: () => cache.onMutate(params),
			catch: (error) => new EffectCacheError({ cause: error }),
		});

	return {
		strategy,
		get,
		put,
		onMutate,
		cache,
	};
}

export class EffectCacheError extends Schema.TaggedError<EffectCacheError>()('EffectCacheError', {
	cause: Schema.Unknown,
}) {
	static readonly [entityKind]: string = this._tag;
}
