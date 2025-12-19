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

	protected _effect: Effect.Effect<Succes, Failure, Context> | undefined;
	protected get effect() {
		this._effect = Effect.suspend(() => this.execute());

		Object.defineProperty(this, 'effect', {
			value: this._effect,
			writable: false,
			configurable: false,
		});

		return this._effect;
	}

	private _pipe!: Pipeable['pipe'];
	get pipe() {
		this._pipe = (...args: any[]) => {
			return (this.effect.pipe as (...args: any[]) => any)(...args);
		};

		Object.defineProperty(this, 'pipe', {
			value: this._pipe,
			writable: false,
			configurable: false,
		});

		return this._pipe;
	}

	abstract execute(...args: any[]): Effect.Effect<Succes, Failure, Context>;

	get [Effect.EffectTypeId]() {
		return this.effect[Effect.EffectTypeId];
	}

	[Symbol.iterator]() {
		return this.effect[Symbol.iterator]();
	}
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
