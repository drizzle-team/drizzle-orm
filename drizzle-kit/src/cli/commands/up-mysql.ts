import { createDDL } from 'src/dialects/mysql/ddl';
import type { MysqlSchema, MysqlSnapshot } from '../../dialects/mysql/snapshot';

export const upMysqlHandler = (out: string) => {};

export const upToV6 = (it: Record<string, any>): MysqlSnapshot => {
	const json = it as MysqlSchema;

	const hints = [] as string[];

	const ddl = createDDL();

	for (const table of Object.values(json.tables)) {
		ddl.tables.push({ name: table.name });

		for(const column of Object.values(table.columns)){

		}
	}

	return {
		version: '6',
		id: json.id,
		prevId: json.prevId,
		dialect: 'mysql',
		ddl: ddl.entities.list(),
		renames: [],
	};
};
