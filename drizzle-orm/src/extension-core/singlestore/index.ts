import { entityKind } from '~/entity.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import type { BuildRelationalQueryResult, TableRelationalConfig, TablesRelationalConfig } from '~/relations.ts';
import type {
	SingleStoreColumn,
	SingleStoreDeleteConfig,
	SingleStoreDialect,
	SingleStoreInsertConfig,
	SingleStoreSelectConfig,
	SingleStoreSession,
	SingleStoreUpdateConfig,
} from '~/singlestore-core/index.ts';
import { DrizzleExtension } from '../index.ts';

export type DrizzleSingleStoreHookContext<TExtData = unknown> =
	& {
		readonly session: SingleStoreSession;
		readonly dialect: SingleStoreDialect;
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
		readonly fieldsOrdered?: SelectedFieldsOrdered<SingleStoreColumn>;
		readonly config: SingleStoreSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: SingleStoreInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: SingleStoreDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: SingleStoreUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
	});

export type BlankSingleStoreHookContext =
	& {
		readonly session: SingleStoreSession;
		readonly dialect: SingleStoreDialect;
	}
	& ({
		readonly query: 'select';
		readonly joinsNotNullableMap: Record<string, boolean>;
		readonly fieldsOrdered?: SelectedFieldsOrdered<SingleStoreColumn>;
		readonly config: SingleStoreSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: SingleStoreInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: SingleStoreDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: SingleStoreUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
	});

export abstract class DrizzleSingleStoreExtension<TExtData = unknown>
	extends DrizzleExtension<DrizzleSingleStoreHookContext<TExtData>>
{
	static override readonly [entityKind]: string = 'DrizzleSingleStoreExtension';
}
