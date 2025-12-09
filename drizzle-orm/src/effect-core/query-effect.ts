import { Effect } from 'effect';
import type { Pipeable } from 'effect/Pipeable';
import { entityKind } from '~/entity.ts';
import type { DrizzleQueryError } from '~/errors';
import { applyMixins } from '~/utils';

export interface QueryEffect<Succes = never, Failure = DrizzleQueryError, Context = never>
	extends Effect.Effect<Succes, Failure, Context>
{
}

export abstract class QueryEffect<Succes = never, Failure = DrizzleQueryError, Context = never> {
	static readonly [entityKind]: string = 'EffectWrapper';

	protected effect: Effect.Effect<Succes, Failure, Context> = Effect.suspend(() => this.execute());
	abstract execute(...args: any[]): Effect.Effect<Succes, Failure, Context>;

	get [Effect.EffectTypeId]() {
		return this.effect[Effect.EffectTypeId];
	}

	[Symbol.iterator]() {
		return this.effect[Symbol.iterator]();
	}

	pipe: Pipeable['pipe'] = (...args: any[]) => {
		return (this.effect.pipe as (...args: any[]) => any)(...args);
	};
}

export function applyEffectWrapper(baseClass: any) {
	applyMixins(baseClass, [QueryEffect]);

	Object.defineProperty(
		baseClass.prototype,
		Symbol.iterator,
		Object.getOwnPropertyDescriptor(QueryEffect.prototype, Symbol.iterator)!,
	);

	Object.defineProperty(
		baseClass.prototype,
		Effect.EffectTypeId,
		Object.getOwnPropertyDescriptor(QueryEffect.prototype, Effect.EffectTypeId)!,
	);
}
