/* eslint-disable drizzle-internal/require-entity-kind */
import { text } from 'drizzle-orm/pg-core';
import type { BuildColumn, Column } from '../../lib/optimized-columns';

export const column = text('text');

export type Col = BuildColumn<'t', typeof column>;

export type Check<TColumn extends Column> = TColumn;

export type Tmp = Check<Col>;
