import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { prepareFilenames } from '../src/serializer';

const tempDirs: string[] = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop()!;
		rmSync(dir, { recursive: true, force: true });
	}
});

test('prepareFilenames ignores TSX files when schema path is a directory', () => {
	const schemaDir = mkdtempSync(join(tmpdir(), 'drizzle-kit-schema-'));
	tempDirs.push(schemaDir);

	writeFileSync(join(schemaDir, 'schema.ts'), 'export const users = {};\n');
	writeFileSync(
		join(schemaDir, 'Apple.tsx'),
		'export const Apple = () => <svg />;\n',
	);

	const testConfigPathPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
	delete process.env.TEST_CONFIG_PATH_PREFIX;
	try {
		expect(prepareFilenames(schemaDir).sort()).toEqual([
			resolve(schemaDir, 'schema.ts'),
		]);
	} finally {
		if (testConfigPathPrefix === undefined) {
			delete process.env.TEST_CONFIG_PATH_PREFIX;
		} else {
			process.env.TEST_CONFIG_PATH_PREFIX = testConfigPathPrefix;
		}
	}
});
