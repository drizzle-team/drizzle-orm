import type { Column, Engine, Index, Projection, Table } from './serializer/clickhouseSchema';

/**
 * The migration statements the ClickHouse dialect can emit.
 *
 * ClickHouse's `ALTER TABLE` covers columns, indexes and projections, but the engine and its keys
 * (`ORDER BY`, `PARTITION BY`, `SAMPLE BY`) are fixed at creation. A change to any of those becomes a
 * `ch_recreate_table` rather than an alter — which is destructive, so the CLI warns before running it.
 */
export type JsonCreateTableStatement = {
	type: 'ch_create_table';
	table: Table;
};

export type JsonDropTableStatement = {
	type: 'ch_drop_table';
	tableName: string;
	schema: string;
};

export type JsonRenameTableStatement = {
	type: 'ch_rename_table';
	fromSchema: string;
	toSchema: string;
	tableNameFrom: string;
	tableNameTo: string;
};

export type JsonAddColumnStatement = {
	type: 'ch_add_column';
	tableName: string;
	schema: string;
	column: Column;
};

export type JsonDropColumnStatement = {
	type: 'ch_drop_column';
	tableName: string;
	schema: string;
	columnName: string;
};

export type JsonRenameColumnStatement = {
	type: 'ch_rename_column';
	tableName: string;
	schema: string;
	oldColumnName: string;
	newColumnName: string;
};

export type JsonAlterColumnStatement = {
	type: 'ch_alter_column';
	tableName: string;
	schema: string;
	column: Column;
};

export type JsonCreateIndexStatement = {
	type: 'ch_add_index';
	tableName: string;
	schema: string;
	index: Index;
};

export type JsonDropIndexStatement = {
	type: 'ch_drop_index';
	tableName: string;
	schema: string;
	indexName: string;
};

export type JsonCreateProjectionStatement = {
	type: 'ch_add_projection';
	tableName: string;
	schema: string;
	projection: Projection;
};

export type JsonDropProjectionStatement = {
	type: 'ch_drop_projection';
	tableName: string;
	schema: string;
	projectionName: string;
};

export type JsonModifyTtlStatement = {
	type: 'ch_modify_ttl';
	tableName: string;
	schema: string;
	ttl: string | undefined;
};

export type JsonModifySettingsStatement = {
	type: 'ch_modify_settings';
	tableName: string;
	schema: string;
	settings: Record<string, string>;
};

/** Extending the sorting key is the one key change ClickHouse allows in place. */
export type JsonModifyOrderByStatement = {
	type: 'ch_modify_order_by';
	tableName: string;
	schema: string;
	orderBy: string;
};

export type JsonRecreateTableStatement = {
	type: 'ch_recreate_table';
	table: Table;
	reason: string;
};

export type JsonClickHouseStatement =
	| JsonCreateTableStatement
	| JsonDropTableStatement
	| JsonRenameTableStatement
	| JsonAddColumnStatement
	| JsonDropColumnStatement
	| JsonRenameColumnStatement
	| JsonAlterColumnStatement
	| JsonCreateIndexStatement
	| JsonDropIndexStatement
	| JsonCreateProjectionStatement
	| JsonDropProjectionStatement
	| JsonModifyTtlStatement
	| JsonModifySettingsStatement
	| JsonModifyOrderByStatement
	| JsonRecreateTableStatement;

/** Statements that drop data or rebuild a table, which `push` asks the user to confirm. */
export function isDestructive(statement: JsonClickHouseStatement): boolean {
	return statement.type === 'ch_drop_table'
		|| statement.type === 'ch_drop_column'
		|| statement.type === 'ch_recreate_table';
}

export type { Column, Engine, Index, Projection, Table };
