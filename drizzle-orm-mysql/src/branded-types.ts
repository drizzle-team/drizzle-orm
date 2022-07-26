import { ColumnDriverParam } from 'drizzle-orm/branded-types';
import { MySqlColumnDriverDataType } from './connection';

export const brand = Symbol('brand');

export type MySqlColumnDriverParam<T extends MySqlColumnDriverDataType = MySqlColumnDriverDataType> = ColumnDriverParam<
	T
>;
