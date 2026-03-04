import type { SQL } from 'bun';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type BunMySqlDatabase, type BunMySqlDrizzleConfig, drizzle as mysqlConstructor } from './mysql/driver.ts';
import { type BunSQLDatabase, drizzle as postgresConstructor } from './postgres/driver.ts';
import { type BunSQLiteDatabase, drizzle as sqliteConstructor } from './sqlite/driver.ts';

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends SQL = SQL,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | ({ url?: string } & SQL.Options);
			} | {
				client: TClient;
			})
		),
	]
): BunSQLDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	return postgresConstructor(...params);
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(config?: DrizzleConfig<TSchema, TRelations>): BunSQLDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return postgresConstructor.mock(config);
	}

	export function postgres<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
		TClient extends SQL = SQL,
	>(
		...params: [
			string,
		] | [
			string,
			DrizzleConfig<TSchema, TRelations>,
		] | [
			(
				& DrizzleConfig<TSchema, TRelations>
				& ({
					connection: string | ({ url?: string } & SQL.Options);
				} | {
					client: TClient;
				})
			),
		]
	): BunSQLDatabase<TSchema, TRelations> & {
		$client: TClient;
	} {
		return postgresConstructor(...params);
	}

	export namespace postgres {
		export function mock<
			TSchema extends Record<string, unknown> = Record<string, never>,
			TRelations extends AnyRelations = EmptyRelations,
		>(config?: DrizzleConfig<TSchema, TRelations>): BunSQLDatabase<TSchema, TRelations> & {
			$client: '$client is not available on drizzle.mock()';
		} {
			return postgresConstructor.mock(config);
		}
	}

	export function sqlite<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
		TClient extends SQL = SQL,
	>(
		...params: [
			string,
		] | [
			string,
			DrizzleConfig<TSchema, TRelations>,
		] | [
			(
				& DrizzleConfig<TSchema, TRelations>
				& ({
					connection: string | ({ url?: string } & SQL.Options);
				} | {
					client: TClient;
				})
			),
		]
	): BunSQLiteDatabase<TSchema, TRelations> & {
		$client: TClient;
	} {
		return sqliteConstructor(...params);
	}

	export namespace sqlite {
		export function mock<
			TSchema extends Record<string, unknown> = Record<string, never>,
			TRelations extends AnyRelations = EmptyRelations,
		>(config?: DrizzleConfig<TSchema, TRelations>): BunSQLiteDatabase<TSchema, TRelations> & {
			$client: '$client is not available on drizzle.mock()';
		} {
			return sqliteConstructor.mock(config);
		}
	}

	export function mysql<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
		TClient extends SQL = SQL,
	>(
		...params: [
			string,
		] | [
			string,
			BunMySqlDrizzleConfig<TSchema, TRelations>,
		] | [
			(
				& BunMySqlDrizzleConfig<TSchema, TRelations>
				& ({
					connection: string | ({ url?: string } & SQL.Options);
				} | {
					client: TClient;
				})
			),
		]
	): BunMySqlDatabase<TSchema, TRelations> & {
		$client: TClient;
	} {
		return mysqlConstructor(...params) as BunMySqlDatabase<TSchema, TRelations> & {
			$client: TClient;
		};
	}

	export namespace mysql {
		export function mock<
			TSchema extends Record<string, unknown> = Record<string, never>,
			TRelations extends AnyRelations = EmptyRelations,
		>(config?: BunMySqlDrizzleConfig<TSchema, TRelations>): BunMySqlDatabase<TSchema, TRelations> & {
			$client: '$client is not available on drizzle.mock()';
		} {
			return mysqlConstructor.mock(config) as BunMySqlDatabase<TSchema, TRelations> & {
				$client: '$client is not available on drizzle.mock()';
			};
		}
	}
}
