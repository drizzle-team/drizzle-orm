import { ColumnConfig } from "drizzle-orm";
import { ColumnBuilderConfig } from "drizzle-orm/column-builder";
import { AnyPgTable } from "~/table";
import { PgColumn, PgColumnBuilder } from "./common";

function returnColumn<TTableName extends string, TData>(
	table: AnyPgTable<{ name: TTableName }>,
	config: PgColumnBuilder<ColumnConfig<{ data: TData; driverParam: string }>>['config'],
	sqlName: string,
	mapTo?: (value: TData) => any,
	mapFrom?: (value: any) => TData,
): PgColumn<
	ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>
> {
	return new class extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>> {
		protected override $pgColumnBrand!: 'CustomColumnBrand';

		getSQLType(): string {
			return sqlName;
		}

		override mapFromDriverValue(value: any): TData {
			if (typeof mapTo !== 'undefined') {
				return mapTo(value);
			} else {
				return value as TData;
			}
		}

		override mapToDriverValue(value: TData): any {
			if (typeof mapFrom !== 'undefined') {
				return mapFrom(value);
			} else {
				return value as TData;
			}
		}
	}(table, config);
}

export function customType<
	T extends {
		data: unknown;
		driver?: unknown;
		config?: Record<string, unknown>;
	},
>(
	{ dataTypeName, mapToDriver, mapFromDriver }: {
		dataTypeName: (config: T['config']) => string;
		mapToDriver?: (value: T['data']) => T['driver'];
		mapFromDriver?: (value: T['driver']) => T['data'];
	},
): (
	dbName: string,
	fieldConfig?: T['config'],
) => PgColumnBuilder<
	ColumnBuilderConfig<{ data: T['data']; driverParam: string }>,
	Record<string, unknown>
> {
	return (dbName: string, fieldConfig?: T['config']) =>
		new class
			extends PgColumnBuilder<ColumnBuilderConfig<{ data: T['data']; driverParam: string }>, Record<string, unknown>>
		{
			protected $pgColumnBuilderBrand!: 'CustomColumnBuilderBrand';

			/** @internal */
			build<TTableName extends string>(
				table: AnyPgTable<{ name: TTableName }>,
			): PgColumn<ColumnConfig<{ tableName: TTableName; data: T['data']; driverParam: string }>> {
				return returnColumn(table, this.config, dataTypeName(fieldConfig), mapToDriver, mapFromDriver);
			}
		}(dbName);
}