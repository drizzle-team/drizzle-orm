import { integer, text, uuid } from 'drizzle-orm/pg-core';

export const rawColumns = {
	text: text('text'),
	int: integer('number'),
	id: uuid(),
};
