import type * as Effect from 'effect/Effect';
import * as Effectable from 'effect/Effectable';

export interface QueryEffectHKTBase {
	readonly $brand: 'QueryEffectHKT';
	readonly error: unknown;
	readonly context: unknown;
}

export type QueryEffectKind<
	TKind extends QueryEffectHKTBase,
	TSuccess,
> = Effect.Effect<TSuccess, TKind['error'], TKind['context']>;

export function applyEffectWrapper(baseClass: any) {
	Object.assign(baseClass.prototype, Effectable.CommitPrototype);

	baseClass.prototype.commit = function(this: { execute(): Effect.Effect<any, any, any> }) {
		return this.execute();
	};
}
