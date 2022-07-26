import { ColumnDriverParam } from 'drizzle-orm/branded-types';

import { PgColumnDriverDataType } from './connection';

export type PgColumnDriverParam<T extends PgColumnDriverDataType = PgColumnDriverDataType> = ColumnDriverParam<T>;
