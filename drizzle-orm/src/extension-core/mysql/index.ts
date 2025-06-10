import { entityKind } from '~/entity.ts';
import type {
	MySqlColumn,
	MySqlDeleteConfig,
	MySqlDialect,
	MySqlInsertConfig,
	MySqlSelectConfig,
	MySqlSession,
	MySqlUpdateConfig,
} from '~/mysql-core/index.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import type { BuildRelationalQueryResult, TableRelationalConfig, TablesRelationalConfig } from '~/relations.ts';
import { DrizzleExtension } from '../index.ts';

export type DrizzleMySqlHookContext<TExtData = unknown> =
	& {
		readonly session: MySqlSession;
		readonly dialect: MySqlDialect;
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
		readonly fieldsOrdered?: SelectedFieldsOrdered<MySqlColumn>;
		readonly config: MySqlSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: MySqlInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: MySqlDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: MySqlUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
		readonly planetscale: boolean;
	});

export type BlankMySqlHookContext =
	& {
		readonly session: MySqlSession;
		readonly dialect: MySqlDialect;
	}
	& ({
		readonly query: 'select';
		readonly joinsNotNullableMap: Record<string, boolean>;
		readonly fieldsOrdered?: SelectedFieldsOrdered<MySqlColumn>;
		readonly config: MySqlSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: MySqlInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: MySqlDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: MySqlUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
		readonly planetscale: boolean;
	});

export abstract class DrizzleMySqlExtension<TExtData = unknown>
	extends DrizzleExtension<DrizzleMySqlHookContext<TExtData>>
{
	static override readonly [entityKind]: string = 'DrizzleMySqlExtension';
}
