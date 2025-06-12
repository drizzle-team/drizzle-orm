import { entityKind } from '~/entity.ts';
import type {
	GelColumn,
	GelDeleteConfig,
	GelDialect,
	GelInsertConfig,
	GelSelectConfig,
	GelSession,
	GelUpdateConfig,
} from '~/gel-core/index.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import type { BuildRelationalQueryResult, TableRelationalConfig, TablesRelationalConfig } from '~/relations.ts';
import { DrizzleExtension } from '../index.ts';

export type DrizzleGelHookContext<TExtData = unknown> =
	& {
		readonly session: GelSession;
		readonly dialect: GelDialect;
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
		readonly fieldsOrdered?: SelectedFieldsOrdered<GelColumn>;
		readonly config: GelSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: GelInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: GelDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: GelUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
	});

export type BlankGelHookContext =
	& {
		readonly session: GelSession;
		readonly dialect: GelDialect;
	}
	& ({
		readonly query: 'select';
		readonly joinsNotNullableMap: Record<string, boolean>;
		readonly fieldsOrdered?: SelectedFieldsOrdered<GelColumn>;
		readonly config: GelSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: GelInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: GelDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: GelUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
	});

export abstract class DrizzleGelExtension<TExtData = unknown>
	extends DrizzleExtension<DrizzleGelHookContext<TExtData>>
{
	static override readonly [entityKind]: string = 'DrizzleGelExtension';
}
