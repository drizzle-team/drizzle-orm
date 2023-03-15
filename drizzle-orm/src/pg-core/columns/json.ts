import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgJsonBuilder<TData>
	extends PgColumnBuilder<ColumnBuilderConfig<{ data: TData; driverParam: TData | string }>>
{
	protected override $pgColumnBuilderBrand!: 'PgJsonBuilder';

	constructor(name: string) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgJson<TTableName, TData> {
		return new PgJson(table, this.config);
	}
}

export class PgJson<TTableName extends string, TData>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: TData | string }>>
{
	protected override $pgColumnBrand!: 'PgJson';

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgJsonBuilder<TData>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'json';
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

export function json<TData = any>(name: string): PgJsonBuilder<TData> {
	return new PgJsonBuilder(name);
}
