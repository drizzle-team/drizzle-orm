import { integer, pgTable, text } from 'drizzle-orm/pg-core';

const colBuilders = {
	id1: text(),
	id2: integer(),
};

const table = pgTable('n', colBuilders);

export type Tbl = typeof table;

export type Id1Config = Tbl['_']['columns']['id1']['config'];
export type Id2Config = Tbl['_']['columns']['id2']['config'];
