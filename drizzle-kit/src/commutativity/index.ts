import { cockroachCommutativity } from '../dialects/cockroach/commutativity';
import { mysqlCommutativity } from '../dialects/mysql/commutativity';
import { postgresCommutativity } from '../dialects/postgres/commutativity';
import { sqliteCommutativity } from '../dialects/sqlite/commutativity';
import type { Dialect } from '../utils/schemaValidator';

export const commutativityDialects = {
	cockroach: cockroachCommutativity,
	postgresql: postgresCommutativity,
	mysql: mysqlCommutativity,
	sqlite: sqliteCommutativity,
	turso: sqliteCommutativity,
} as const;

export const getCommutativityDialect = (dialect: Dialect) => {
	if (
		dialect === 'cockroach'
		|| dialect === 'postgresql'
		|| dialect === 'mysql'
		|| dialect === 'sqlite'
		|| dialect === 'turso'
	) {
		return commutativityDialects[dialect];
	}
};
