import { entityKind } from '~/entity.ts';
import type { SingleStoreTableExtraConfig, SingleStoreTableFn, SingleStoreTableWithColumns, TableConfig } from './common.ts';
import { SingleStoreTable, singlestoreTableWithSchema } from './common.ts';
import type { BuildColumns } from '~/column-builder.ts';
import type { SingleStoreColumnBuilderBase } from '../columns/common.ts';

export class SingleStoreRowstoreTable<T extends TableConfig = TableConfig> extends SingleStoreTable<T> {
	static readonly [entityKind]: string = 'SingleStoreRowstoreTable';
}

export function singlestoreRowstoreTableWithSchema<
	TTableName extends string,
	TSchemaName extends string | undefined,
	TColumnsMap extends Record<string, SingleStoreColumnBuilderBase>,
>(
	name: TTableName,
	columns: TColumnsMap,
	extraConfig:
		| ((self: BuildColumns<TTableName, TColumnsMap, 'singlestore'>) => SingleStoreTableExtraConfig)
		| undefined,
	schema: TSchemaName,
	baseName = name,
): SingleStoreTableWithColumns<{
	name: TTableName;
	schema: TSchemaName;
	columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
	dialect: 'singlestore';
}> {
	const rawTable = new SingleStoreRowstoreTable<{
		name: TTableName;
		schema: TSchemaName;
		columns: BuildColumns<TTableName, TColumnsMap, 'singlestore'>;
		dialect: 'singlestore';
	}>(name, schema, baseName);

    return singlestoreTableWithSchema(rawTable, columns, extraConfig)
}

export const singlestoreRowstoreTable: SingleStoreTableFn = (name, columns, extraConfig) => {
	return singlestoreRowstoreTableWithSchema(name, columns, extraConfig, undefined, name);
};