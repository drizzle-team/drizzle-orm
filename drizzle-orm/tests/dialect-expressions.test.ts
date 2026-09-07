import { describe, test } from 'vitest';
import { CockroachDialect } from '~/cockroach-core/dialect.ts';
import { concat as cockroachConcat, substring as cockroachSubstring } from '~/cockroach-core/expressions.ts';
import { cockroachTable, text as cockroachText } from '~/cockroach-core/index.ts';
import { MsSqlDialect } from '~/mssql-core/dialect.ts';
import { concat as msSqlConcat, substring as msSqlSubstring } from '~/mssql-core/expressions.ts';
import { mssqlTable, text as msSqlText } from '~/mssql-core/index.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import { concat as mySqlConcat, substring as mySqlSubstring } from '~/mysql-core/expressions.ts';
import { mysqlTable, text as mySqlText } from '~/mysql-core/index.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { concat as pgConcat, substring as pgSubstring } from '~/pg-core/expressions.ts';
import { pgTable, text as pgText } from '~/pg-core/index.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import { concat as singleStoreConcat, substring as singleStoreSubstring } from '~/singlestore-core/expressions.ts';
import { singlestoreTable, text as singleStoreText } from '~/singlestore-core/index.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { concat as sqliteConcat, substring as sqliteSubstring } from '~/sqlite-core/expressions.ts';
import { sqliteTable, text as sqliteText } from '~/sqlite-core/index.ts';

const pgUsers = pgTable('users', { name: pgText('name') });
const cockroachUsers = cockroachTable('users', { name: cockroachText('name') });
const mySqlUsers = mysqlTable('users', { name: mySqlText('name') });
const singleStoreUsers = singlestoreTable('users', { name: singleStoreText('name') });
const sqliteUsers = sqliteTable('users', { name: sqliteText('name') });
const msSqlUsers = mssqlTable('users', { name: msSqlText('name') });

describe.concurrent('concat by dialect', () => {
	test('Pg uses the || operator', ({ expect }) => {
		expect(new PgDialect().sqlToQuery(pgConcat(pgUsers.name, '!')).sql).toBe('"users"."name" || $1');
	});

	test('Cockroach uses the || operator', ({ expect }) => {
		expect(new CockroachDialect().sqlToQuery(cockroachConcat(cockroachUsers.name, '!')).sql).toBe(
			'"users"."name" || $1',
		);
	});

	test('SQLite uses the || operator', ({ expect }) => {
		expect(new SQLiteDialect().sqlToQuery(sqliteConcat(sqliteUsers.name, '!')).sql).toBe(
			'"users"."name" || ?',
		);
	});

	test('MySQL calls concat() instead of the || operator', ({ expect }) => {
		const query = new MySqlDialect().sqlToQuery(mySqlConcat(mySqlUsers.name, '!'));
		expect(query.sql).toBe('concat(`users`.`name`, ?)');
		expect(query.params).toEqual(['!']);
	});

	test('SingleStore calls concat() instead of the || operator', ({ expect }) => {
		const query = new SingleStoreDialect().sqlToQuery(singleStoreConcat(singleStoreUsers.name, '!'));
		expect(query.sql).toBe('concat(`users`.`name`, ?)');
		expect(query.params).toEqual(['!']);
	});

	test('MsSQL calls concat() instead of the || operator', ({ expect }) => {
		const query = new MsSqlDialect().sqlToQuery(msSqlConcat(msSqlUsers.name, '!'));
		expect(query.sql).toBe('concat([users].[name], @par0)');
		expect(query.params).toEqual(['!']);
	});
});

describe.concurrent('substring by dialect', () => {
	test('Pg uses the from/for form', ({ expect }) => {
		expect(new PgDialect().sqlToQuery(pgSubstring(pgUsers.name, { from: 2, for: 3 })).sql).toBe(
			'substring("users"."name" from $1 for $2)',
		);
	});

	test('Cockroach uses the from/for form', ({ expect }) => {
		expect(
			new CockroachDialect().sqlToQuery(cockroachSubstring(cockroachUsers.name, { from: 2, for: 3 })).sql,
		).toBe('substring("users"."name" from $1 for $2)');
	});

	test('MySQL uses the from/for form', ({ expect }) => {
		expect(new MySqlDialect().sqlToQuery(mySqlSubstring(mySqlUsers.name, { from: 2, for: 3 })).sql).toBe(
			'substring(`users`.`name` from ? for ?)',
		);
	});

	test('SingleStore uses the from/for form', ({ expect }) => {
		expect(
			new SingleStoreDialect().sqlToQuery(singleStoreSubstring(singleStoreUsers.name, { from: 2, for: 3 })).sql,
		).toBe('substring(`users`.`name` from ? for ?)');
	});

	test('SQLite calls substr() with positional arguments', ({ expect }) => {
		const query = new SQLiteDialect().sqlToQuery(sqliteSubstring(sqliteUsers.name, { from: 2, for: 3 }));
		expect(query.sql).toBe('substr("users"."name", ?, ?)');
		expect(query.params).toEqual([2, 3]);
	});

	test('SQLite omits the length when only from is given', ({ expect }) => {
		const query = new SQLiteDialect().sqlToQuery(sqliteSubstring(sqliteUsers.name, { from: 7 }));
		expect(query.sql).toBe('substr("users"."name", ?)');
		expect(query.params).toEqual([7]);
	});

	test('SQLite starts at 1 when only for is given', ({ expect }) => {
		const query = new SQLiteDialect().sqlToQuery(sqliteSubstring(sqliteUsers.name, { for: 5 }));
		expect(query.sql).toBe('substr("users"."name", 1, ?)');
		expect(query.params).toEqual([5]);
	});

	test('MsSQL calls substring() with positional arguments', ({ expect }) => {
		const query = new MsSqlDialect().sqlToQuery(msSqlSubstring(msSqlUsers.name, { from: 2, for: 3 }));
		expect(query.sql).toBe('substring([users].[name], @par0, @par1)');
		expect(query.params).toEqual([2, 3]);
	});

	test('MsSQL runs to the end of the string when only from is given', ({ expect }) => {
		const query = new MsSqlDialect().sqlToQuery(msSqlSubstring(msSqlUsers.name, { from: 7 }));
		expect(query.sql).toBe('substring([users].[name], @par0, len([users].[name]))');
		expect(query.params).toEqual([7]);
	});

	test('MsSQL starts at 1 when only for is given', ({ expect }) => {
		const query = new MsSqlDialect().sqlToQuery(msSqlSubstring(msSqlUsers.name, { for: 5 }));
		expect(query.sql).toBe('substring([users].[name], 1, @par0)');
		expect(query.params).toEqual([5]);
	});
});
