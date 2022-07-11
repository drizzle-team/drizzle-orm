import { InferType, Table } from './core';
import { pgTable, connect as connect, raw } from './pg/core';
import { varchar } from './pg/columns/varchar';
import { getTableName } from './utils';
import { int } from './pg/columns';

const users = pgTable('users', {
	name: varchar('name', 10).notNull().default('John'),
});

const cities = pgTable('cities', {
	name: varchar('name', 10).notNull().default('London'),
});

type T = InferType<typeof cities>;
//   ^?

console.log(users.name);
//                ^?

console.log(getTableName(users));
console.log(users instanceof Table);

const pool = {};

const db = connect('pg', { users, cities });
