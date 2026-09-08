import type { BuildColumns, Column } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';

export const rawColumns = {
	text0: text('text'),
	text1: text('text'),
	text2: text('text'),
	text3: text('text'),
	text4: text('text'),
	text5: text('text'),
	text6: text('text'),
	text7: text('text'),
	text8: text('text'),
	text9: text('text'),
};

export type Columns = BuildColumns<'t', typeof rawColumns, 'pg'>;

export type Check<TColumns extends Record<string, Column>> = {
	[K in keyof TColumns]: TColumns[K]['_']['dataType'];
};

export type Tmp = Check<Columns>;
