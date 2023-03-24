import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgCharBuilder<TData extends string = string>
	extends PgColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>, { length: number | undefined }>
{
	protected override $pgColumnBuilderBrand!: 'PgCharBuilder';

	constructor(name: string, length?: number) {
		super(name);
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgChar<TTableName, TData> {
		return new PgChar(table, this.config);
	}
}

export class PgChar<TTableName extends string, TData extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgChar';

	length: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgCharBuilder<TData>['config']) {
		super(table, config);
		this.length = config.length;
	}

	getSQLType(): string {
		return typeof this.length !== 'undefined' ? `char(${this.length})` : `char`;
	}
}

export function char<T extends string = string>(
	name: string,
	config: { length?: number } = {},
): PgCharBuilder<T> {
	return new PgCharBuilder(name, config.length);
}
