import type * as Effect from 'effect/Effect';
import { pipeArguments } from 'effect/Pipeable';

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

const EffectTypeId = '~effect/Effect';
const EffectIdentifier = `${EffectTypeId}/identifier`;
const EffectEvaluate = `${EffectTypeId}/evaluate`;

const effectVariance = {
	_A: (a: unknown) => a,
	_E: (e: unknown) => e,
	_R: (r: unknown) => r,
};

const QueryEffectProto = {
	[EffectTypeId]: effectVariance,
	pipe() {
		return pipeArguments(this, arguments);
	},
	[Symbol.iterator]() {
		let done = false;
		const self = this;

		return {
			next(value: unknown) {
				if (done) {
					return { done: true, value };
				}

				done = true;
				return { done: false, value: self };
			},
			[Symbol.iterator]() {
				return this;
			},
		};
	},
	[EffectIdentifier]: 'DrizzleQuery',
	[EffectEvaluate](this: { execute(): Effect.Effect<any, any, any> }) {
		return this.execute();
	},
};

export function applyEffectWrapper(baseClass: any) {
	// Make query builders real Effect values so direct combinators such as
	// `query.pipe(...)` and `Effect.map(query, ...)` behave the same way as `yield* query`.
	Object.assign(baseClass.prototype, QueryEffectProto);
	baseClass.prototype.asEffect = function(this: { execute(): Effect.Effect<any, any, any> }) {
		return this.execute();
	};
	baseClass.prototype.commit = function(this: { execute(): Effect.Effect<any, any, any> }) {
		return this.execute();
	};
}
