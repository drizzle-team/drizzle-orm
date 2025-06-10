import { entityKind } from '~/entity.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import type { BuildRelationalQueryResult, TableRelationalConfig, TablesRelationalConfig } from '~/relations.ts';
import type {
	SQLiteColumn,
	SQLiteDeleteConfig,
	SQLiteDialect,
	SQLiteInsertConfig,
	SQLiteSelectConfig,
	SQLiteSession,
	SQLiteUpdateConfig,
} from '~/sqlite-core/index.ts';
import { DrizzleExtension } from '../index.ts';

export type DrizzleSQLiteHookContext<TExtData = unknown> =
	& {
		readonly session: SQLiteSession<'async', any, any, any>;
		readonly dialect: SQLiteDialect;
		readonly executionMode: 'run' | 'get' | 'all' | 'values';
		metadata?: TExtData;
	}
	& (
		| {
			readonly stage: 'before';
			readonly sql: string;
			readonly placeholders?: Record<string, unknown>;
			readonly params?: unknown[];
		}
		| {
			readonly stage: 'after';
			readonly data: unknown[];
		}
	)
	& ({
		readonly query: 'select';
		readonly joinsNotNullableMap: Record<string, boolean>;
		readonly fieldsOrdered?: SelectedFieldsOrdered<SQLiteColumn>;
		readonly config: SQLiteSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: SQLiteInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: SQLiteDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: SQLiteUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
	});

export type BlankSQLiteHookContext =
	& {
		readonly session: SQLiteSession<'async', any, any, any>;
		readonly dialect: SQLiteDialect;
	}
	& ({
		readonly query: 'select';
		readonly joinsNotNullableMap: Record<string, boolean>;
		readonly fieldsOrdered?: SelectedFieldsOrdered<SQLiteColumn>;
		readonly config: SQLiteSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: SQLiteInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: SQLiteDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: SQLiteUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
	});

export abstract class DrizzleSQLiteExtension<TExtData = unknown>
	extends DrizzleExtension<DrizzleSQLiteHookContext<TExtData>>
{
	static override readonly [entityKind]: string = 'DrizzleSQLiteExtension';
}
