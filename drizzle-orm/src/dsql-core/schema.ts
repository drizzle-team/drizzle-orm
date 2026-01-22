import { entityKind } from '~/entity.ts';
import type { AnyDSQLColumnBuilder, DSQLBuildColumns, DSQLBuildExtraConfigColumns } from './columns/common.ts';
import {
	type DSQLColumnsBuilders,
	type DSQLTableExtraConfig,
	type DSQLTableExtraConfigValue,
	type DSQLTableFn,
	type DSQLTableWithColumns,
	dsqlTableWithSchema,
} from './table.ts';

export class DSQLSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'DSQLSchema';

	constructor(public readonly schemaName: TName) {}

	table: DSQLTableFn<TName> = (name, columns, extraConfig) => {
		return dsqlTableWithSchema(
			name,
			columns,
			extraConfig as any,
			this.schemaName,
		);
	};
}

export function dsqlSchema<TName extends string>(name: TName): DSQLSchema<TName> {
	return new DSQLSchema(name);
}
