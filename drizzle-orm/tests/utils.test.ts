import { describe, expect, test } from 'vitest';
import type { MigrationMeta } from '~/migrator';
import { getMigrationsToRun } from '~/migrator.utils';

describe('filter migrations to run: util function test', () => {
	test('normal chronological migrations', async () => {
		const localMigrations: MigrationMeta[] = [
			{ folderMillis: 1700000000000, hash: 'hash1', sql: ['stmt1'], bps: true },
			{ folderMillis: 1700000001000, hash: 'hash2', sql: ['stmt2'], bps: true },
			{ folderMillis: 1700000002000, hash: 'hash3', sql: ['stmt3'], bps: true },
		];
		const dbMigrations = [
			{ id: 1, created_at: '1700000000000', hash: 'hash1' },
		];

		const migrationsToRun = getMigrationsToRun({ localMigrations, dbMigrations });

		expect(migrationsToRun).toStrictEqual([
			{ folderMillis: 1700000001000, hash: 'hash2', sql: ['stmt2'], bps: true },
			{ folderMillis: 1700000002000, hash: 'hash3', sql: ['stmt3'], bps: true },
		]);
	});

	test('db and local migrations are the same', async () => {
		const localMigrations: MigrationMeta[] = [
			{ folderMillis: 1700000000000, hash: 'hash1', sql: ['stmt1'], bps: true },
			{ folderMillis: 1700000001000, hash: 'hash2', sql: ['stmt2'], bps: true },
			{ folderMillis: 1700000002000, hash: 'hash3', sql: ['stmt3'], bps: true },
		];
		const dbMigrations = [
			{ id: 1, created_at: '1700000000000', hash: 'hash1' },
			{ id: 2, created_at: '1700000001000', hash: 'hash2' },
			{ id: 3, created_at: '1700000002000', hash: 'hash3' },
		];

		const migrationsToRun = getMigrationsToRun({ localMigrations, dbMigrations });

		expect(migrationsToRun).toStrictEqual([]);
	});

	test('local has migration before last db migration', async () => {
		const localMigrations: MigrationMeta[] = [
			{ folderMillis: 100, hash: 'hash1', sql: ['stmt1'], bps: true },
			{ folderMillis: 200, hash: 'hash2', sql: ['stmt2'], bps: true },
			{ folderMillis: 300, hash: 'hash3', sql: ['stmt3'], bps: true },
		];
		const dbMigrations = [
			{ id: 1, created_at: '100', hash: 'hash1' },
			{ id: 2, created_at: '300', hash: 'hash3' },
		];

		const migrationsToRun = getMigrationsToRun({ localMigrations, dbMigrations });

		expect(migrationsToRun).toStrictEqual([
			{ folderMillis: 200, hash: 'hash2', sql: ['stmt2'], bps: true },
		]);
	});
});
