import { test as brotest } from '@drizzle-team/brocli';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { assert, expect, test, vi } from 'vitest';
import { init } from '../src/cli/schema';

vi.mock('readline', () => ({
	createInterface: vi.fn(() => ({
		question: vi.fn((question, callback) => {
			if (question === '> ') {
				callback('');
			} else if (question.includes('Select an option')) {
				callback('1');
			} else {
				callback('');
			}
		}),
		close: vi.fn(),
	})),
}));

test('config generation - postgresql with env', async () => {
	const config = {
		dialect: 'postgresql',
		out: 'drizzle',
		schema: './src/db/schema.ts',
		useDotenv: true,
	};

	const expectedConfig = `import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: 'drizzle',
  dbCredentials: {
  url: process.env.DATABASE_URL!,
  },
});
`;

	const { generateConfigContent } = await import('../src/cli/commands/init');
	const result = generateConfigContent(config);
	expect(result).toBe(expectedConfig);
});

test('config generation - sqlite without env', async () => {
	const config = {
		dialect: 'sqlite',
		out: 'migrations',
		schema: './db/schema.ts',
		useDotenv: false,
	};

	const expectedConfig = `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './db/schema.ts',
  out: 'migrations',
  dbCredentials: {
  url: './sqlite.db',
  },
});
`;

	const { generateConfigContent } = await import('../src/cli/commands/init');
	const result = generateConfigContent(config);
	expect(result).toBe(expectedConfig);
});

test('config generation - turso with env', async () => {
	const config = {
		dialect: 'turso',
		out: 'drizzle',
		schema: './src/schema.ts',
		useDotenv: true,
	};

	const expectedConfig = `import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  dialect: 'turso',
  schema: './src/schema.ts',
  out: 'drizzle',
  dbCredentials: {
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
  },
});
`;

	const { generateConfigContent } = await import('../src/cli/commands/init');
	const result = generateConfigContent(config);
	expect(result).toBe(expectedConfig);
});

test('config generation - mysql without env', async () => {
	const config = {
		dialect: 'mysql',
		out: 'drizzle',
		schema: './src/db/schema.ts',
		useDotenv: false,
	};

	const expectedConfig = `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: 'drizzle',
  dbCredentials: {
  url: 'mysql://username:password@localhost:3306/dbname',
  },
});
`;

	const { generateConfigContent } = await import('../src/cli/commands/init');
	const result = generateConfigContent(config);
	expect(result).toBe(expectedConfig);
});

test('config generation - singlestore with env', async () => {
	const config = {
		dialect: 'singlestore',
		out: 'drizzle',
		schema: './src/db/schema.ts',
		useDotenv: true,
	};

	const expectedConfig = `import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  dialect: 'singlestore',
  schema: './src/db/schema.ts',
  out: 'drizzle',
  dbCredentials: {
  url: process.env.DATABASE_URL!,
  },
});
`;

	const { generateConfigContent } = await import('../src/cli/commands/init');
	const result = generateConfigContent(config);
	expect(result).toBe(expectedConfig);
});

test('package.json management - missing dependencies', async () => {
	const testDir = join(tmpdir(), 'drizzle-init-test-' + Date.now());
	mkdirSync(testDir, { recursive: true });

	const packageJson = {
		name: 'test-project',
		version: '1.0.0',
		dependencies: {},
		devDependencies: {},
	};

	const packageJsonPath = join(testDir, 'package.json');
	writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

	const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

	const { updatePackageJson } = await import('../src/cli/commands/init');
	await updatePackageJson(packageJsonPath);

	const updatedContent = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
	expect(updatedContent.devDependencies['drizzle-orm']).toBeDefined();
	expect(updatedContent.devDependencies['drizzle-kit']).toBeDefined();

	expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Updated package.json'));

	rmSync(testDir, { recursive: true });
	consoleSpy.mockRestore();
});

test('package.json management - existing dependencies', async () => {
	const testDir = join(tmpdir(), 'drizzle-init-test-' + Date.now());
	mkdirSync(testDir, { recursive: true });

	const packageJson = {
		name: 'test-project',
		version: '1.0.0',
		dependencies: {
			'drizzle-orm': '^0.40.0',
		},
		devDependencies: {
			'drizzle-kit': '^0.30.0',
		},
	};

	const packageJsonPath = join(testDir, 'package.json');
	writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

	const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

	const { updatePackageJson } = await import('../src/cli/commands/init');
	await updatePackageJson(packageJsonPath);

	const content = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
	expect(content.dependencies['drizzle-orm']).toBe('^0.40.0');
	expect(content.devDependencies['drizzle-kit']).toBe('^0.30.0');

	expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already present'));

	rmSync(testDir, { recursive: true });
	consoleSpy.mockRestore();
});

test('package.json management - missing file', async () => {
	const testDir = join(tmpdir(), 'drizzle-init-test-' + Date.now());
	mkdirSync(testDir, { recursive: true });

	const packageJsonPath = join(testDir, 'package.json');

	const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

	const { updatePackageJson } = await import('../src/cli/commands/init');
	await updatePackageJson(packageJsonPath);

	expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No package.json found'));

	rmSync(testDir, { recursive: true });
	consoleSpy.mockRestore();
});

test('package.json management - malformed file', async () => {
	const testDir = join(tmpdir(), 'drizzle-init-test-' + Date.now());
	mkdirSync(testDir, { recursive: true });

	const packageJsonPath = join(testDir, 'package.json');
	writeFileSync(packageJsonPath, 'invalid json content');

	const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

	const { updatePackageJson } = await import('../src/cli/commands/init');
	await updatePackageJson(packageJsonPath);

	expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Could not update package.json'));

	rmSync(testDir, { recursive: true });
	consoleSpy.mockRestore();
});

test('init command - should exist', async () => {
	const res = await brotest(init, '');

	if (res.type !== 'handler') assert.fail(`Expected handler, got ${res.type}`);

	expect(res.type).toBe('handler');
});

test('config generation - invalid dialect', async () => {
	const config = {
		dialect: 'invalid-dialect',
		out: 'drizzle',
		schema: './src/db/schema.ts',
		useDotenv: false,
	};

	const { generateConfigContent } = await import('../src/cli/commands/init');
	const result = generateConfigContent(config);

	expect(result).toContain("dialect: 'invalid-dialect'");
	expect(result).toContain('dbCredentials: {\n\n  }');
});

test('config generation - empty paths', async () => {
	const config = {
		dialect: 'postgresql',
		out: '',
		schema: '',
		useDotenv: false,
	};

	const { generateConfigContent } = await import('../src/cli/commands/init');
	const result = generateConfigContent(config);

	expect(result).toContain("out: ''");
	expect(result).toContain("schema: ''");
});
