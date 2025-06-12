import { entityKind } from '~/entity.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import type {
	PgColumn,
	PgDeleteConfig,
	PgDialect,
	PgInsertConfig,
	PgSelectConfig,
	PgSession,
	PgUpdateConfig,
} from '~/pg-core/index.ts';
import type { BuildRelationalQueryResult, TableRelationalConfig, TablesRelationalConfig } from '~/relations.ts';
import { DrizzleExtension } from '../index.ts';

export type DrizzlePgHookContext<TExtData = unknown> =
	& {
		readonly session: PgSession;
		readonly dialect: PgDialect;
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
		readonly fieldsOrdered?: SelectedFieldsOrdered<PgColumn>;
		readonly config: PgSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: PgInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: PgDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: PgUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
	});

export type BlankPgHookContext =
	& {
		readonly session: PgSession;
		readonly dialect: PgDialect;
	}
	& ({
		readonly query: 'select';
		readonly joinsNotNullableMap: Record<string, boolean>;
		readonly fieldsOrdered?: SelectedFieldsOrdered<PgColumn>;
		readonly config: PgSelectConfig;
	} | {
		readonly query: 'insert';
		readonly config: PgInsertConfig;
	} | {
		readonly query: 'delete';
		readonly config: PgDeleteConfig;
	} | {
		readonly query: 'update';
		readonly config: PgUpdateConfig;
	} | {
		readonly query: '_query';
		readonly config: BuildRelationalQueryResult;
		readonly tablesConfig: TablesRelationalConfig;
		readonly tableConfig: TableRelationalConfig;
		readonly tableNamesMap: Record<string, string>;
		readonly mode: 'first' | 'many';
	});

export abstract class DrizzlePgExtension<TExtData = unknown> extends DrizzleExtension<DrizzlePgHookContext<TExtData>> {
	static override readonly [entityKind]: string = 'DrizzlePgExtension';
}
