import type { BuildColumns } from 'drizzle-orm';
import { integer, text, uuid } from 'drizzle-orm/pg-core';

export const rawColumns = {
	text: text('text'),
	int: integer('number'),
	id: uuid(),
};

export type Columns = BuildColumns<'t', typeof rawColumns, 'pg'>;
