import { afterEach, expect, test, vi } from 'vitest';

const mockClient = {
	options: {
		parsers: {} as Record<string, unknown>,
		serializers: {} as Record<string, unknown>,
	},
	unsafe: vi.fn(),
	begin: vi.fn(),
};
const mockPostgres = vi.fn(() => mockClient);

vi.mock('src/cli/utils', async (importOriginal) => {
	const original = await importOriginal<typeof import('src/cli/utils')>();
	return {
		...original,
		// Simulate an environment where only postgres (not pg) is installed,
		// so preparePostgresDB takes the postgres.js branch.
		checkPackage: vi.fn(async (pkg: string) => pkg === 'postgres'),
	};
});
vi.mock('postgres', () => ({ default: mockPostgres }));
vi.mock('drizzle-orm/postgres-js', () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock('drizzle-orm/postgres-js/migrator', () => ({ migrate: vi.fn() }));

afterEach(() => {
	mockPostgres.mockClear();
	mockClient.options.parsers = {};
	mockClient.options.serializers = {};
	vi.restoreAllMocks();
});

test('preparePostgresDB passes onnotice to postgres.js (url path)', async () => {
	vi.spyOn(console, 'log').mockImplementation(() => {});
	const { preparePostgresDB } = await import('src/cli/connections');

	await preparePostgresDB({ url: 'postgres://localhost/test' });

	expect(mockPostgres).toHaveBeenCalledOnce();
	const [, options] = mockPostgres.mock.calls[0] as [string, Record<string, unknown>];
	expect(options).toMatchObject({ onnotice: expect.any(Function) });
	// Must be a no-op — IF NOT EXISTS notices should be silently discarded
	expect((options.onnotice as () => void)()).toBeUndefined();
});

test('preparePostgresDB passes onnotice to postgres.js (credentials-object path)', async () => {
	vi.spyOn(console, 'log').mockImplementation(() => {});
	const { preparePostgresDB } = await import('src/cli/connections');

	await preparePostgresDB({
		host: 'localhost',
		port: 5432,
		database: 'test',
		user: 'postgres',
		password: 'postgres',
		ssl: false,
	});

	expect(mockPostgres).toHaveBeenCalledOnce();
	const [options] = mockPostgres.mock.calls[0] as [Record<string, unknown>];
	expect(options).toMatchObject({ onnotice: expect.any(Function) });
	expect((options.onnotice as () => void)()).toBeUndefined();
});
