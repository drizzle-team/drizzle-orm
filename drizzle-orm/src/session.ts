import type { Query } from './sql/sql.ts';

export interface PreparedQuery {
	getQuery(): Query;
}
