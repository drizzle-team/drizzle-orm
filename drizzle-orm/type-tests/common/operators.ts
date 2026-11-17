import { type Equal, Expect } from 'type-tests/utils.ts';
import { drizzle as cockroachd } from '~/cockroach/index.ts';
import { and, eq, not, or } from '~/index.ts';
import { drizzle as sqlited } from '~/libsql/index.ts';
import { drizzle as mysqld } from '~/mysql2/index.ts';
import { drizzle as mssqld } from '~/node-mssql/index.ts';
import { drizzle as pgd } from '~/postgres-js/index.ts';
import { users as cockroachUsers } from '../cockroach/tables.ts';
import { users as mssqlUsers } from '../mssql/tables.ts';
import { users as mysqlUsers } from '../mysql/tables.ts';
import { users as pgUsers } from '../pg/tables.ts';
import { users as sqliteUsers } from '../sqlite/tables.ts';

const pg = pgd.mock();
const sqlite = sqlited.mock();
const mysql = mysqld.mock();
const mssql = mssqld.mock();
const cockroach = cockroachd.mock();

// Expect not to have ts error in "not" operator
// https://github.com/drizzle-team/drizzle-orm/issues/4160
// patched drizzle-orm/src/sql/expressions/conditions.ts:177
{
	await pg
		.delete(pgUsers)
		.where(
			and(
				eq(pgUsers.id, 1),
				not(
					or(
						eq(pgUsers.class, 'A'),
						eq(pgUsers.class, 'C'),
					),
				),
			),
		);

	await sqlite
		.delete(sqliteUsers)
		.where(
			and(
				eq(sqliteUsers.id, 1),
				not(
					or(
						eq(sqliteUsers.class, 'A'),
						eq(sqliteUsers.class, 'C'),
					),
				),
			),
		);

	await mysql
		.delete(mysqlUsers)
		.where(
			and(
				eq(mysqlUsers.id, 1),
				not(
					or(
						eq(mysqlUsers.class, 'A'),
						eq(mysqlUsers.class, 'C'),
					),
				),
			),
		);

	await mssql
		.delete(mssqlUsers)
		.where(
			and(
				eq(mssqlUsers.id, 1),
				not(
					or(
						eq(mssqlUsers.class, 'A'),
						eq(mssqlUsers.class, 'C'),
					),
				),
			),
		);

	await cockroach
		.delete(cockroachUsers)
		.where(
			and(
				eq(cockroachUsers.id, 1),
				not(
					or(
						eq(cockroachUsers.class, 'A'),
						eq(cockroachUsers.class, 'C'),
					),
				),
			),
		);
}
