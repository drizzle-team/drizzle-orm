import * as Effect from 'effect/Effect';
import { describe, test } from 'vitest';
import { EffectCache } from '~/cache/core/cache-effect.ts';
import { NoopCache } from '~/cache/core/cache.ts';
import type { EffectLoggerShape } from '~/effect-core/logger.ts';
import { PgEffectPreparedQuery } from '~/pg-core/effect/session.ts';
import type { PreparedQueryConfig } from '~/pg-core/session.ts';

const logger: EffectLoggerShape = {
	logQuery: () => Effect.void,
};

describe('PgEffectPreparedQuery', () => {
	test('executes with the prepared query instance bound inside Effect.gen', async ({ expect }) => {
		const prepared = new PgEffectPreparedQuery<PreparedQueryConfig & { execute: string[] }>(
			(params?: unknown[]) => Effect.succeed(params),
			{
				sql: 'select $1',
				params: ['ok'],
			},
			(rows) => rows,
			'raw',
			logger,
			EffectCache.fromDrizzle(new NoopCache()),
			undefined,
			undefined,
		);

		await expect(Effect.runPromise(prepared.execute())).resolves.toEqual(['ok']);
	});
});
