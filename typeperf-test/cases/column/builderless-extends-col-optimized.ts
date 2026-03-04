/* eslint-disable drizzle-internal/require-entity-kind */
import { text } from 'drizzle-orm/pg-core';
import type { Column, PgColumn } from '../../lib/optimized-columns';

export const column = text('text');

export type Col = PgColumn<{
	name: 'a';
	columnType: 'string';
	data: string;
	dataType: 'string';
	driverParam: string;
	enumValues: string[];
	hasDefault: false;
	hasRuntimeDefault: false;
	isAutoincrement: false;
	isPrimaryKey: false;
	notNull: true;
	tableName: 't';
}>;

export type Check<TColumn extends Column> = TColumn;

export type Tmp = Check<Col>;

export type Data = Col['dataType'];
