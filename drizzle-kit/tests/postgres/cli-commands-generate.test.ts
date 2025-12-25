import { existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { handle } from 'src/cli/commands/generate-postgres';
import { afterAll, beforeEach, expect, test } from 'vitest';

// @vitest-environment-options {"max-concurrency":1}

if (!existsSync('tests/postgres/tmp')) {
	mkdirSync(`tests/postgres/tmp`, { recursive: true });
}

const out = 'tests/postgres/tmp/drizzle';

beforeEach(() => {
	if (existsSync(out)) rmSync(out, { recursive: true });
});

afterAll(() => {
	if (existsSync(out)) rmSync(out, { recursive: true });
});

const validateFolderName = (
	{ prefix, name, out }: { prefix: 'index' | 'timestamp' | 'supabase' | 'unix' | 'none'; name: string; out: string },
) => {
	if (!existsSync(out)) return false;

	const pattern = prefix === 'index'
		? new RegExp(`^\\d{4}_${name}$`)
		: prefix === 'timestamp' || prefix === 'supabase'
		? new RegExp(`^\\d{14}_${name}$`)
		: prefix === 'unix'
		? new RegExp(`^\\d{10}_${name}$`)
		: new RegExp(`^${name}$`);

	const migrations = readdirSync(out);
	return migrations.some((folderName) => pattern.test(folderName));
};

// https://github.com/drizzle-team/drizzle-orm/issues/5143
test('generate - with index prefix', async () => {
	// TODO revise this test with @AlexBlokh
	const prefix = 'index';
	const name = `test-${prefix}-prefix`;
	await handle({
		dialect: 'postgresql',
		out,
		breakpoints: true,
		bundle: false, // true only for 'expo' and 'durable-sqlite' drivers
		custom: true,
		prefix,
		schema: 'tests/postgres/schemas/schema1.ts',
		name,
	});

	const bool = validateFolderName({ prefix, name, out });
	expect(bool).toBeTruthy();
});

test('generate - with timestamp prefix', async () => {
	const prefix = 'timestamp';
	const name = `test-${prefix}-prefix`;
	await handle({
		dialect: 'postgresql',
		out,
		breakpoints: true,
		bundle: false, // true only for 'expo' and 'durable-sqlite' drivers
		custom: true,
		prefix,
		schema: 'tests/postgres/schemas/schema1.ts',
		name,
	});

	const bool = validateFolderName({ prefix, name, out });
	expect(bool).toBeTruthy();
});
