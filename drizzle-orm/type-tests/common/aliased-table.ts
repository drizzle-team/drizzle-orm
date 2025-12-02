import { type Equal, Expect } from 'type-tests/utils.ts';
import { alias as cockroachAliasFn } from '~/cockroach-core/alias.ts';
import { cockroachView } from '~/cockroach-core/view.ts';
import { drizzle as cockroachd } from '~/cockroach/index.ts';
import { eq } from '~/index.ts';
import { drizzle as sqlited } from '~/libsql/index.ts';
import { alias as mysqlAliasFn } from '~/mysql-core/alias.ts';
import { mysqlView } from '~/mysql-core/view.ts';
import { drizzle as mysqld } from '~/mysql2/index.ts';
import { alias as pgAliasFn } from '~/pg-core/alias.ts';
import { pgView } from '~/pg-core/view.ts';
import { drizzle as pgd } from '~/postgres-js/index.ts';
import { alias as sqliteAliasFn } from '~/sqlite-core/alias.ts';
import { sqliteView } from '~/sqlite-core/view.ts';
import { users as cockroachUsers } from '../cockroach/tables.ts';
import { users as mysqlUsers } from '../mysql/tables.ts';
import { users as pgUsers } from '../pg/tables.ts';
import { users as sqliteUsers } from '../sqlite/tables.ts';

const pg = pgd.mock();
const sqlite = sqlited.mock();
const mysql = mysqld.mock();
const cockroach = cockroachd.mock();

const pgvUsers = pgView('users_view').as((qb) => qb.select().from(pgUsers));
const cockroachvUsers = cockroachView('users_view').as((qb) => qb.select().from(cockroachUsers));
const sqlitevUsers = sqliteView('users_view').as((qb) => qb.select().from(sqliteUsers));
const mysqlvUsers = mysqlView('users_view').as((qb) => qb.select().from(mysqlUsers));

const pgAlias = pgAliasFn(pgUsers, 'usersAlias');
const cockroachAlias = cockroachAliasFn(cockroachUsers, 'usersAlias');
const sqliteAlias = sqliteAliasFn(sqliteUsers, 'usersAlias');
const mysqlAlias = mysqlAliasFn(mysqlUsers, 'usersAlias');

const pgvAlias = pgAliasFn(pgvUsers, 'usersvAlias');
const cockroachvAlias = cockroachAliasFn(cockroachvUsers, 'usersvAlias');
const sqlitevAlias = sqliteAliasFn(sqlitevUsers, 'usersvAlias');
const mysqlvAlias = mysqlAliasFn(mysqlvUsers, 'usersvAlias');

const pgRes = await pg.select().from(pgUsers).leftJoin(pgAlias, eq(pgAlias.id, pgUsers.id));
const cockroachRes = await cockroach.select().from(cockroachUsers).leftJoin(
	cockroachAlias,
	eq(pgAlias.id, pgUsers.id),
);
const sqliteRes = await sqlite.select().from(sqliteUsers).leftJoin(sqliteAlias, eq(sqliteAlias.id, sqliteUsers.id));
const mysqlRes = await mysql.select().from(mysqlUsers).leftJoin(mysqlAlias, eq(mysqlAlias.id, mysqlUsers.id));

const pgvRes = await pg.select().from(pgUsers).leftJoin(pgvAlias, eq(pgvAlias.id, pgUsers.id));
const cockroachvRes = await cockroach.select().from(cockroachUsers).leftJoin(
	cockroachvAlias,
	eq(cockroachvAlias.id, cockroachUsers.id),
);
const sqlitevRes = await sqlite.select().from(sqliteUsers).leftJoin(sqlitevAlias, eq(sqlitevAlias.id, sqliteUsers.id));
const mysqlvRes = await mysql.select().from(mysqlUsers).leftJoin(mysqlvAlias, eq(mysqlvAlias.id, mysqlUsers.id));

Expect<
	Equal<typeof pgRes, {
		users_table: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
			arrayCol: string[];
		};
		usersAlias: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
			arrayCol: string[];
		} | null;
	}[]>
>;

Expect<
	Equal<typeof cockroachRes, {
		users_table: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			int4Nullable: number | null;
			int4NotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
			arrayCol: string[];
		};
		usersAlias: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			int4Nullable: number | null;
			int4NotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
			arrayCol: string[];
		} | null;
	}[]>
>;

Expect<
	Equal<typeof sqliteRes, {
		users_table: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number | null;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			name: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		};
		usersAlias: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number | null;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			name: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		} | null;
	}[]>
>;

Expect<
	Equal<typeof mysqlRes, {
		users_table: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		};
		usersAlias: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		} | null;
	}[]>
>;

Expect<
	Equal<typeof pgvRes, {
		users_table: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
			arrayCol: string[];
		};
		usersvAlias: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
			arrayCol: string[];
		} | null;
	}[]>
>;

Expect<
	Equal<typeof cockroachvRes, {
		users_table: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			int4Nullable: number | null;
			int4NotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
			arrayCol: string[];
		};
		usersvAlias: {
			id: number;
			uuid: string;
			homeCity: number;
			currentCity: number | null;
			int4Nullable: number | null;
			int4NotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
			arrayCol: string[];
		} | null;
	}[]>
>;

Expect<
	Equal<typeof sqlitevRes, {
		users_table: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number | null;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			name: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		};
		usersvAlias: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number | null;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			name: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		} | null;
	}[]>
>;

Expect<
	Equal<typeof mysqlvRes, {
		users_table: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		};
		usersvAlias: {
			id: number;
			homeCity: number;
			currentCity: number | null;
			serialNullable: number;
			serialNotNull: number;
			class: 'A' | 'C';
			subClass: 'B' | 'D' | null;
			text: string | null;
			age1: number;
			createdAt: Date;
			enumCol: 'a' | 'b' | 'c';
		} | null;
	}[]>
>;
