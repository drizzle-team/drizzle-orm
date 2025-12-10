import { entityKind } from '~/entity.ts';
import { type MsSqlTableFn, mssqlTableWithSchema } from './table.ts';
import { type mssqlView, mssqlViewWithSchema } from './view.ts';

export class MsSqlSchema<TName extends string = string> {
	static readonly [entityKind]: string = 'MsSqlSchema';

	isExisting: boolean = false;
	constructor(
		public readonly schemaName: TName,
	) {}

	table: MsSqlTableFn<TName> = (name, columns, extraConfig) => {
		return mssqlTableWithSchema(name, columns, extraConfig, this.schemaName);
	};

	view = ((name, columns) => {
		return mssqlViewWithSchema(name, columns, this.schemaName);
	}) as typeof mssqlView;

	existing(): this {
		this.isExisting = true;
		return this;
	}
}

export function mssqlSchema<TName extends string>(name: TName) {
	return new MsSqlSchema(name);
}
