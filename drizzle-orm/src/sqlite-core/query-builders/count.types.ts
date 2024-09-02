import type { SQL, SQLWrapper } from '~/index';
import type { SQLiteTable } from '../table';
import type { SQLiteViewBase } from '../view-base';

export type SQLiteCountConfig = {
	source: SQLiteTable | SQLiteViewBase | SQL | SQLWrapper;
	filters?: SQL;
};
