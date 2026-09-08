import { is } from 'orm044';
import { MySqlTable, MySqlView } from 'orm044/mysql-core';
import type { CasingType } from '../common';
import type { MySqlSchema as SCHEMA } from './mysqlSchema';
import { generateMySqlSnapshot } from './mysqlSerializer';

export type MysqlSchema = Record<
	string,
	| MySqlTable<any>
	| MySqlView
	| unknown
>;

export const serializeMysql = async (
	schema: MysqlSchema,
	casing: CasingType | undefined,
): Promise<SCHEMA> => {
	const tables = Object.values(schema).filter((it) => is(it, MySqlTable)) as MySqlTable[];
	const views = Object.values(schema).filter((it) => is(it, MySqlView)) as MySqlView[];
	const snapshot = generateMySqlSnapshot(
		tables,
		views,
		casing,
	);
	return {
		id: 'id',
		prevId: 'prev_id',
		...snapshot,
	};
};
