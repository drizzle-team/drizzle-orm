import { entityKind } from '~/entity.ts';
import { type DSQLTableFn, dsqlTableWithSchema } from './table.ts';
import { type dsqlView, dsqlViewWithSchema } from './view.ts';

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

	view = ((name, columns) => {
		return dsqlViewWithSchema(name, columns, this.schemaName);
	}) as typeof dsqlView;
}

export function dsqlSchema<TName extends string>(name: TName): DSQLSchema<TName> {
	return new DSQLSchema(name);
}
