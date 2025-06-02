const { int: mysqlInt, mysqlTable } = require('drizzle-orm/mysql-core');
const { integer: pgInt, pgTable } = require('drizzle-orm/pg-core');
const { integer: sqliteInt, sqliteTable } = require('drizzle-orm/sqlite-core');
const { int: mssqlInt, mssqlTable } = require('drizzle-orm/mssql-core');

module.exports.sqlite = {
	User: sqliteTable('test', {
		id: sqliteInt('id').primaryKey().notNull(),
	}),
};

module.exports.pg = {
	User: pgTable('test', {
		id: pgInt('id').primaryKey().notNull(),
	}),
};

module.exports.mysql = {
	User: mysqlTable('test', {
		id: mysqlInt('id').primaryKey().notNull(),
	}),
};

module.exports.pg = {
	User: mssqlTable('test', {
		id: pgInt('id').primaryKey(),
	}),
};
