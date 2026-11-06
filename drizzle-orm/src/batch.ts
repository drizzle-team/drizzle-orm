import type { Dialect } from './column-builder.ts';
import type { DrizzleQueryError } from './errors.ts';
import type { RunnableQuery } from './runnable-query.ts';

export type BatchItem<TDialect extends Dialect = Dialect> = RunnableQuery<any, TDialect>;

export type BatchResponse<T extends BatchItem[] | readonly BatchItem[]> = {
	[K in keyof T]: T[K]['_']['result'];
};

export interface QueryRejectedResult {
	status: 'rejected';
	reason: DrizzleQueryError;
}

export type SettledQueryResult<T> = PromiseFulfilledResult<T> | QueryRejectedResult;

export type SettledBatchResponse<T extends BatchItem[] | readonly BatchItem[]> = {
	[K in keyof T]: SettledQueryResult<T[K]['_']['result']>;
};
