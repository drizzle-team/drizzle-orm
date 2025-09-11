import type { ColumnRuntimeConfig } from 'drizzle-beta';
import { integer, pgTable, text } from 'drizzle-beta/pg-core';

const colBuilders = {
	id1: text(),
	id2: integer(),
};

const table = pgTable('n', colBuilders);

export type Tbl = typeof table;

export type Id1Config = Tbl['_']['columns']['id1']['config'];
export type Id2Config = Tbl['_']['columns']['id2']['config'];

export type Check6<T extends ColumnRuntimeConfig<any, object>> = T;

export type Tmp1 = Check6<Id1Config>;
export type Tmp2 = Check6<Id2Config>;
