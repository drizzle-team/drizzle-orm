import { text } from 'drizzle-orm/pg-core';

export const column = text('text');

export type Col = typeof column._.dataType;
