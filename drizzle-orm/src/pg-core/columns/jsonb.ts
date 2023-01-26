import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyPgTable } from '~/pg-core/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgJsonbBuilder<TData>
	extends PgColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: TData | string }>>
{
	protected override $pgColumnBuilderBrand!: 'PgJsonbBuilder';

	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgJsonb<TTableName, TData> {
		return new PgJsonb(table, this.config);
	}
}

export class PgJsonb<TTableName extends string, TData>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: TData | string }>>
{
	protected override $pgColumnBrand!: 'PgJsonb';

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgJsonbBuilder<TData>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'jsonb';
	}

	override mapToDriverValue(value: TData): string {
		return JSON.stringify(value);
	}

	override mapFromDriverValue(value: TData | string): TData {
		if (typeof value === 'string') {
			try {
				return JSON.parse(value);
			} catch (e) {
				return value as TData;
			}
		}
		return value;
	}
}

export function jsonb<TData = any>(name: string): PgJsonbBuilder<TData> {
	return new PgJsonbBuilder(name);
}
