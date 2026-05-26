import { type BindParams, connect, type Database, type Row, type Statement } from '@tursodatabase/sync-react-native';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { construct, type TursoDatabaseDatabase } from './driver-core.ts';

export type DatabaseOpts = (Database extends { new(path: string, opts: infer D): any } ? D : any) & {
	path: string;
};

/** Structural type so apps are not tied to drizzle's peer copy of @tursodatabase/sync-react-native. */
export type SyncReactNativeDatabaseClient = {
	prepare(sql: string): {
		all(...params: BindParams[]): Promise<Row[]>;
		get(...params: BindParams[]): Promise<Row | undefined>;
		run(...params: BindParams[]): Promise<unknown>;
		bind(...params: BindParams[]): unknown;
	};
	transaction<T>(fn: () => T | Promise<T>): Promise<T>;
};

type SyncReactNativeRow = Row;

function rowToArray(row: SyncReactNativeRow): unknown[] {
	return Object.keys(row).map((key) => row[key]);
}

/** Maps sync-react-native Statement to the database-common shape Drizzle expects. */
function adaptStatement(stmt: Statement) {
	const adapted = {
		raw(asArrays?: boolean) {
			return {
				all: async (...params: BindParams[]) => {
					const rows = await stmt.all(...params);
					if (asArrays === false) return rows;
					return rows.map(rowToArray);
				},
				get: async (...params: BindParams[]) => {
					const row = await stmt.get(...params);
					if (row === undefined) return row;
					if (asArrays === false) return row;
					return rowToArray(row);
				},
			};
		},
		run: (...params: BindParams[]) => stmt.run(...params),
		bind: (...params: BindParams[]) => {
			stmt.bind(...params);
			return adapted;
		},
	};
	return adapted;
}

/** Adapts sync-react-native Database for Drizzle's Turso driver (prepare/raw/transaction). */
export function adaptSyncReactNativeClient(client: SyncReactNativeDatabaseClient) {
	return {
		prepare: (sql: string) => adaptStatement(client.prepare(sql) as Statement),
		transaction: (fn: () => Promise<unknown>) => async () => client.transaction(fn),
	};
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends SyncReactNativeDatabaseClient = SyncReactNativeDatabaseClient,
>(
	config: DrizzleConfig<TSchema, TRelations> & {
		client: TClient;
	},
): TursoDatabaseDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	const { client, ...drizzleConfig } = config;
	const adapted = adaptSyncReactNativeClient(client);
	const db = construct(adapted, drizzleConfig) as TursoDatabaseDatabase<TSchema, TRelations> & {
		$client: TClient;
	};
	(db as { $client: TClient }).$client = client;
	return db;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): TursoDatabaseDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}

export { connect };
