import { Effect } from 'effect';
import type { Pipeable } from 'effect/Pipeable';
import { entityKind } from '~/entity.ts';
import { applyMixins } from '~/utils';

export interface EffectWrapper<A = never, B = never, C = never> extends Effect.Effect<A, B, C> {
}

export abstract class EffectWrapper<A = never, B = never, C = never> {
	static readonly [entityKind]: string = 'EffectWrapper';

	protected _effect: Effect.Effect<A, B, C> | undefined;

	protected get effect() {
		return this._effect ??= this.toEffect();
	}

	/** @internal */
	abstract toEffect(): Effect.Effect<A, B, C>;

	/** @internal */
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
	applyMixins(baseClass, [EffectWrapper]);

	Object.defineProperty(
		baseClass.prototype,
		Symbol.iterator,
		Object.getOwnPropertyDescriptor(EffectWrapper.prototype, Symbol.iterator)!,
	);

	Object.defineProperty(
		baseClass.prototype,
		Effect.EffectTypeId,
		Object.getOwnPropertyDescriptor(EffectWrapper.prototype, Effect.EffectTypeId)!,
	);
}
