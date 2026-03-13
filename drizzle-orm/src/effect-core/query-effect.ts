import type * as Effect from 'effect/Effect';

export interface QueryEffectHKTBase {
	readonly $brand: 'QueryEffectHKT';
	readonly error: unknown;
	readonly context: unknown;
}

export type QueryEffectKind<
	TKind extends QueryEffectHKTBase,
	TSuccess,
	TError = never,
	TContext = never,
> = Effect.Effect<TSuccess, TKind['error'] | TError, TKind['context'] | TContext>;

export function applyEffectWrapper(baseClass: any) {
	baseClass.prototype.asEffect = function(this: { execute(): Effect.Effect<any, any, any> }) {
		return this.execute();
	};
	baseClass.prototype[Symbol.iterator] = function(this: { asEffect(): Effect.Effect<any, any, any> }) {
		return (this.asEffect() as any)[Symbol.iterator]();
	};
}
