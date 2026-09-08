import type * as tables from '../../lib/big-schema.ts';

export type Schema = typeof tables;
export type A = Schema['user']['_']['columns']['apiDisabled']['_'];
