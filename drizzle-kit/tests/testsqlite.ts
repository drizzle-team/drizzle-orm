import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { diffTestSchemasMysql, diffTestSchemasSqlite } from './schemaDiffer';

const from = {
	users: sqliteTable('table', {
		password: text('password'),
	}),
};

const to = {
	users: sqliteTable('table1', {
		password_hash: text('password_hash'),
	}),
};

const { statements, sqlStatements } = await diffTestSchemasSqlite(from, to, [], true);

console.log(statements);
console.log(sqlStatements);
