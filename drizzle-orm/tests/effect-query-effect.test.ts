import * as Effect from 'effect/Effect';
import { describe, test } from 'vitest';
import { applyEffectWrapper } from '~/effect-core/query-effect.ts';

interface TestQuery extends Effect.Effect<number, never, never> {
	asEffect(): Effect.Effect<number, never, never>;
}

class TestQuery {
	execute() {
		return Effect.succeed(1);
	}
}

applyEffectWrapper(TestQuery);

describe.concurrent('applyEffectWrapper', () => {
	test('makes wrapped queries usable as real Effect values', async ({ expect }) => {
		const query = new TestQuery();

		await expect(Effect.runPromise(query.pipe(Effect.map((value) => value + 1)))).resolves.toBe(2);
		await expect(Effect.runPromise(Effect.map(query, (value) => value + 2))).resolves.toBe(3);
		await expect(Effect.runPromise(query.asEffect().pipe(Effect.map((value) => value + 3)))).resolves.toBe(4);
		await expect(Effect.runPromise(Effect.gen(function*() {
			return yield* query;
		}))).resolves.toBe(1);
	});
});
