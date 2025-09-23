/* eslint-disable drizzle-internal/require-entity-kind */
import { integer, text, uuid } from 'drizzle-orm/pg-core';
import type { BuildColumns, Column } from '../../lib/optimized-columns';

export const rawColumns = {
	text: text('text'),
	int: integer('number'),
	id: uuid(),
};

export type Columns = BuildColumns<'t', typeof rawColumns>;

export type Check<TColumns extends Record<string, Column>> = {
	[K in keyof TColumns]: TColumns[K];
};

export type Tmp = Check<Columns>;
