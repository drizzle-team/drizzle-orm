import type { Query } from './index.ts';

export interface PreparedQuery {
	getQuery(): Query;
	mapResult(response: unknown, isFromBatch?: boolean): unknown;
	/** @internal */
	isResponseInArrayMode(): boolean;
}
