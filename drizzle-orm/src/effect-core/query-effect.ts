import { Effect } from 'effect';
import type { Pipeable } from 'effect/Pipeable';
import { entityKind } from '~/entity.ts';
import { applyMixins } from '~/utils.ts';
import type { TaggedDrizzleQueryError } from './errors.ts';

export interface QueryEffect<Success = never, Failure = TaggedDrizzleQueryError, Context = never>
	extends Effect.Effect<Success, Failure, Context>
{
}

export abstract class QueryEffect<Success = never, Failure = TaggedDrizzleQueryError, Context = never> {
	static readonly [entityKind]: string = 'EffectWrapper';

	protected _effect!: Effect.Effect<Success, Failure, Context>;
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

	abstract execute(...args: any[]): Effect.Effect<Success, Failure, Context>;

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
