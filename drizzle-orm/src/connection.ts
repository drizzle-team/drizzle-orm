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

export async function connect<TSession, TDatabase>(connector: Connector<TSession, TDatabase>) {
	const session = await connector.driver.connect();
	return connector.dialect.createDB(session);
}

interface Pool {}
