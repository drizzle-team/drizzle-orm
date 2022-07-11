import { AnyPgTable } from 'drizzle-orm-pg';
import { PgConnector, PGDatabase } from 'drizzle-orm-pg/connection';

export interface Driver<TSession> {
	connect(): Promise<TSession>;
}

export interface Dialect<TSession, TDatabase> {
	createDB(session: TSession): TDatabase;
}

export interface Connector<TSession, TOperations> {
	dialect: Dialect<TSession, TOperations>;
	driver: Driver<TSession>;
}

export async function connectWith<TSession, TDatabase>(connector: Connector<TSession, TDatabase>) {
	const session = await connector.driver.connect();
	return connector.dialect.createDB(session);
}

interface Pool {}

export async function connect<TSchema extends Record<string, AnyPgTable>>(
	dialect: 'pg',
	pool: Pool,
	schema: TSchema,
): Promise<PGDatabase<TSchema>>;
export async function connect(driver: 'pg' | 'pg-native', ...args: any[]): Promise<any> {
	if (driver === 'pg') {
		return connectWith(new PgConnector(args[0], args[1]));
	}
	// if (dialect === 'pg-native') {
	// 	return connectWith(pgNative(...args));
	// }
	throw new Error(`Unknown dialect: ${driver}`);
}
