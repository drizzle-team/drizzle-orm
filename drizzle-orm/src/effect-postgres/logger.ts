import * as Effect from 'effect/Effect';
import { entityKind } from '~/entity.ts';

export class EffectLogger extends Effect.Service<EffectLogger>()('EffectLogger', {
	sync: () => {
		const logQuery = Effect.fn('logQuery')(function*(query: string, params: unknown[]) {
			const stringifiedParams = params.map((p) => {
				try {
					return JSON.stringify(p);
				} catch {
					return String(p);
				}
			});
			yield* Effect.log().pipe(
				Effect.annotateLogs({
					query,
					params: stringifiedParams,
				}),
			);
		});

		return { logQuery };
	},
	accessors: true,
}) {
	static readonly [entityKind]: string = this.Service._tag;
}
