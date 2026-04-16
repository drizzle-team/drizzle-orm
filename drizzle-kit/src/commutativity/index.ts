import { mysqlCommutativity } from 'src/dialects/mysql/commutativity';
import { postgresCommutativity } from 'src/dialects/postgres/commutativity';
import type { Dialect } from 'src/utils/schemaValidator';

export const commutativityDialects = {
	postgresql: postgresCommutativity,
	mysql: mysqlCommutativity,
} as const;

export const getCommutativityDialect = (dialect: Dialect) => {
	if (dialect === 'postgresql' || dialect === 'mysql') {
		return commutativityDialects[dialect];
	}
};
