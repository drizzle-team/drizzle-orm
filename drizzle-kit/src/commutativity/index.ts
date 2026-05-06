import { mysqlCommutativity } from 'src/dialects/mysql/commutativity';
import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import { sqliteCommutativity } from 'src/dialects/sqlite/commutativity';
import type { Dialect } from 'src/utils/schemaValidator';

export const commutativityDialects = {
	postgresql: postgresCommutativity,
	mysql: mysqlCommutativity,
	sqlite: sqliteCommutativity,
	turso: sqliteCommutativity,
} as const;

export const getCommutativityDialect = (dialect: Dialect) => {
	if (
		dialect === 'postgresql'
		|| dialect === 'mysql'
		|| dialect === 'sqlite'
		|| dialect === 'turso'
	) {
		return commutativityDialects[dialect];
	}
};
