/* eslint-disable drizzle-internal/require-entity-kind */
import type { Column } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';

export const column = text('text');

export type Col = Column<
	{
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
	},
	{
		c: 'str';
	},
	{
		d: 'str';
	}
>;

export type Check<TColumn extends Column> = TColumn;

export type Tmp = Check<Col>;

export type Data = Col['_']['dataType'];
