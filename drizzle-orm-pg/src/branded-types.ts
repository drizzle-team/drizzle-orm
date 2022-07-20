import { ColumnDriverParam } from 'drizzle-orm/branded-types';

import { PgColumnDriverDataType } from './connection';

export const brand = Symbol('brand');

export type PgColumnDriverParam<T extends PgColumnDriverDataType = PgColumnDriverDataType> = ColumnDriverParam<T>;
