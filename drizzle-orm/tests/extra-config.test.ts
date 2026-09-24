import { getTableConfig as getPgTableConfig, integer, pgTable, primaryKey, text } from '~/pg-core/index.ts';
import { getTableConfig as getMySqlTableConfig, mysqlTable } from '~/mysql-core/index.ts';
import { getTableConfig as getSingleStoreTableConfig, singlestoreTable } from '~/singlestore-core/index.ts';
import { getTableConfig as getSQLiteTableConfig, sqliteTable } from '~/sqlite-core/index.ts';
import { gelTable, getTableConfig as getGelTableConfig } from '~/gel-core/index.ts';
import { describe, expect, it } from 'vitest';

// https://github.com/drizzle-team/drizzle-orm/issues/6140
// Unknown values in the table extra-config array used to be silently skipped.
// getTableConfig() is what evaluates the extra-config builder (used by
// drizzle-kit generate/push and relational queries).
describe('unknown extra config values', () => {
	it('pgTable throws on unknown extra config values', () => {
		const t = pgTable('t', { id: integer('id') }, () => [{ totallyBogus: 42 }] as any);
		expect(() => getPgTableConfig(t)).toThrow('Can\'t use "Object" as an extra config value');
	});

	it('mysqlTable throws on unknown extra config values', () => {
		const t = mysqlTable('t', { id: integer('id') }, () => [{ totallyBogus: 42 }] as any);
		expect(() => getMySqlTableConfig(t)).toThrow('Can\'t use "Object" as an extra config value');
	});

	it('sqliteTable throws on unknown extra config values', () => {
		const t = sqliteTable('t', { id: integer('id') }, () => [{ totallyBogus: 42 }] as any);
		expect(() => getSQLiteTableConfig(t)).toThrow('Can\'t use "Object" as an extra config value');
	});

	it('singlestoreTable throws on unknown extra config values', () => {
		const t = singlestoreTable('t', { id: integer('id') }, () => [{ totallyBogus: 42 }] as any);
		expect(() => getSingleStoreTableConfig(t)).toThrow('Can\'t use "Object" as an extra config value');
	});

	it('gelTable throws on unknown extra config values', () => {
		const t = gelTable('t', { id: integer('id') }, () => [{ totallyBogus: 42 }] as any);
		expect(() => getGelTableConfig(t)).toThrow('Can\'t use "Object" as an extra config value');
	});

	it('still accepts valid extra config builders', () => {
		const t = pgTable('t', { id: integer('id'), name: text('name') }, (t) => [
			primaryKey({ columns: [t.id] }),
		]);
		expect(() => getPgTableConfig(t)).not.toThrow();
	});
});
