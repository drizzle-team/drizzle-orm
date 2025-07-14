import type { BuildColumn, Column } from 'drizzle-orm';
import { text } from 'drizzle-orm/pg-core';

export const column = text('text');

export type Col = BuildColumn<'t', typeof column, 'pg'>;

export type Check<TColumn extends Column> = TColumn;

export type Tmp1 = Check<Col>;
