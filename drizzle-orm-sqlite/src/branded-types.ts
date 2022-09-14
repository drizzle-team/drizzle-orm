import { ColumnDriverParam } from 'drizzle-orm/branded-types';

import { SQLiteColumnDriverDataType } from './connection';

export type SQLiteColumnDriverParam<T extends SQLiteColumnDriverDataType = SQLiteColumnDriverDataType> =
	ColumnDriverParam<T>;
