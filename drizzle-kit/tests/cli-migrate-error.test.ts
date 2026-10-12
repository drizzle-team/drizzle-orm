import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { migrate } from '../src/cli/schema';

// The migrate handler only reaches the DB connection layer after asserting that
// the correct version of drizzle-orm is installed. Those guards are not the
// subject under test, so we stub them out.
vi.mock('../src/cli/utils', async (importOriginal) => {
	const mod = await importOriginal<typeof import('../src/cli/utils')>();
	return {
		...mod,
		assertOrmCoreVersion: vi.fn(async () => {}),
		assertPackages: vi.fn(async () => {}),
	};
});

// Simulate the migrator throwing (e.g. a failed migration such as the 42P07
// "relation already exists" error from the issue) without needing a live
// database.
vi.mock('../src/cli/connections', () => ({
	preparePostgresDB: vi.fn(async () => ({
		migrate: vi.fn(async () => {
			throw new Error('relation "account" already exists', {
				cause: new Error('42P07'),
			});
		}),
	})),
}));

const stderrWrites: string[] = [];

beforeEach(() => {
	stderrWrites.length = 0;
	vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
		stderrWrites.push(String(chunk));
		return true;
	});
	// hanji's renderWithTask terminates the process with process.exit(1) when a
	// task rejects. Capture that instead of letting it kill the test runner.
	vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
});

afterEach(() => {
	vi.restoreAllMocks();
});

test('migrate writes the migrator failure to stderr when it throws', async () => {
	await migrate.handler?.({
		dialect: 'postgresql',
		out: 'drizzle',
		credentials: {
			url: 'postgresql://postgres:postgres@127.0.0.1:5432/db',
		},
		schema: undefined,
		table: undefined,
	});

	const output = stderrWrites.join('');
	expect(output).toContain('[migrate] FAILED');
	expect(output).toContain('relation "account" already exists');
	expect(output).toContain('[migrate] CAUSE: 42P07');
});
