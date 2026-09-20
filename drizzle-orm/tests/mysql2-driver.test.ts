import { expect, test } from 'vitest';
import { drizzle } from '~/mysql2';

// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/5972
// `mysql2` pools don't expose a top-level `config` at runtime (the typings lie),
// so `drizzle({ client: pool })` used to crash with
// "TypeError: Cannot set properties of undefined (setting 'supportBigNumbers')".

test('drizzle() does not crash when the client has no top-level `config` (mysql2 pool)', () => {
	// Minimal pool shape mirroring a `mysql2` pool at runtime: notably, no `config`.
	const pool = {
		promise() {
			return this;
		},
	} as any;

	expect(() => drizzle({ client: pool })).not.toThrow();
});

test('drizzle() still enables `supportBigNumbers` when the client exposes `config`', () => {
	const client = { config: {} } as any;

	drizzle({ client });

	expect(client.config.supportBigNumbers).toBe(true);
});
