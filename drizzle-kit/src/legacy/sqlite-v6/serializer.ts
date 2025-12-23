import { is } from 'orm044';
import { SQLiteTable, SQLiteView } from 'orm044/sqlite-core';
import type { SQLiteSchemaV6 } from 'src/dialects/sqlite/snapshot';
import type { CasingType } from '../common';
import { generateSqliteSnapshot } from './sqliteSerializer';

export type SQLiteSchema = Record<
	string,
	| SQLiteTable<any>
	| SQLiteView
	| unknown
>;

export const serializeSQLite = async (
	schema: SQLiteSchema,
	casing: CasingType | undefined,
): Promise<SQLiteSchemaV6> => {
	const tables = Object.values(schema).filter((it) => is(it, SQLiteTable)) as SQLiteTable[];
	const views = Object.values(schema).filter((it) => is(it, SQLiteView)) as SQLiteView[];

	const a = generateSqliteSnapshot(
		tables,
		views,
		casing,
	);

	return ({ id: 'id', prevId: 'prev_id', ...a } as SQLiteSchemaV6);
};
