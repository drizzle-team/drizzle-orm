import { mysqlCommutativity } from '../dialects/mysql/commutativity';
import { postgresCommutativity } from '../dialects/postgres/commutativity';
import { sqliteCommutativity } from '../dialects/sqlite/commutativity';
import type { Dialect } from '../utils/schemaValidator';

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
