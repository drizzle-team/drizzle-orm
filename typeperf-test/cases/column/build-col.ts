import type { BuildColumn } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';

export const column = text('text');

export type Col = BuildColumn<'t', typeof column, 'pg'>;
