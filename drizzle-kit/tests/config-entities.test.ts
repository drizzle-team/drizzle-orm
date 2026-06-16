import { expect, test } from 'vitest';
import { configCommonSchema } from '../src/cli/validations/common';

// Regression for https://github.com/drizzle-team/drizzle-orm/issues/5896.
//
// `entities` is parsed by `drizzleConfigFromFile()` via `configCommonSchema`.
// Before the fix, the field wasn't declared on `configCommonSchema` and was
// supposed to be carried by `.passthrough()`. The actual `require()`-based
// config loader, however, returns an object whose only enumerable own key is
// `default` (the rest are non-enumerable interop getters), so `.passthrough()`
// silently dropped `entities` and downstream push/pull saw `undefined`. The
// fix declares `entities` explicitly so Zod walks the field by direct
// property access (which DOES see non-enumerable keys) and surfaces it on
// `safeParse().data`.
test('configCommonSchema surfaces entities.roles (boolean form)', () => {
	const result = configCommonSchema.safeParse({
		dialect: 'postgresql',
		entities: { roles: true },
	});
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.entities).toStrictEqual({ roles: true });
});

test('configCommonSchema surfaces entities.roles (object form with provider/include/exclude)', () => {
	const result = configCommonSchema.safeParse({
		dialect: 'postgresql',
		entities: {
			roles: {
				provider: 'supabase',
				include: ['app_role', 'service_role'],
				exclude: ['legacy_role'],
			},
		},
	});
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.entities).toStrictEqual({
		roles: {
			provider: 'supabase',
			include: ['app_role', 'service_role'],
			exclude: ['legacy_role'],
		},
	});
});

test('configCommonSchema treats omitted entities as undefined', () => {
	const result = configCommonSchema.safeParse({
		dialect: 'postgresql',
	});
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.entities).toBeUndefined();
});

test('configCommonSchema defaults entities.roles to false when entities present without roles', () => {
	const result = configCommonSchema.safeParse({
		dialect: 'postgresql',
		entities: {},
	});
	expect(result.success).toBe(true);
	if (!result.success) return;
	expect(result.data.entities).toStrictEqual({ roles: false });
});
