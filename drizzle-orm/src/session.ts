import type { Query } from './sql/sql.ts';

export interface PreparedQuery {
	getQuery(): Query;
	mapResult(response: unknown, isFromBatch?: boolean): unknown;
	/** @internal */
	isResponseInArrayMode(): boolean;
}
