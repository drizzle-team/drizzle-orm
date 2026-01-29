import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger';

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

	static fromDrizzle(logger: Logger) {
		return Layer.succeed(
			EffectLogger,
			new EffectLogger({
				logQuery: (query: string, params: unknown[]) => {
					return Effect.sync(() => logger.logQuery(query, params));
				},
			}),
		);
	}

	static noop = Layer.succeed(
		EffectLogger,
		new EffectLogger({
			logQuery: () => Effect.void,
		}),
	);
}
