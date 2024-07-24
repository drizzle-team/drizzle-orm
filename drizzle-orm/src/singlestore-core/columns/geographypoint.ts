import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table';
import { sql } from '~/sql/sql.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';
import type { LngLat } from './geography';

export type SingleStoreGeographyPointBuilderInitial<TName extends string> = SingleStoreGeographyPointBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'SingleStoreGeographyPoint';
	data: LngLat;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreGeographyPointBuilder<T extends ColumnBuilderBaseConfig<'array', 'SingleStoreGeographyPoint'>>
	extends SingleStoreColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SingleStoreGeographyPointBuilder';

	constructor(name: T['name']) {
		super(name, 'array', 'SingleStoreGeographyPoint');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreGeographyPoint<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreGeographyPoint(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreGeographyPoint<T extends ColumnBaseConfig<'array', 'SingleStoreGeographyPoint'>>
	extends SingleStoreColumn<T>
{
	static readonly [entityKind]: string = 'SingleStoreGeographyPoint';

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreGeographyPointBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return 'geographypoint';
	}

	override mapToDriverValue([lon, lat]: LngLat) {
		return sql`"POINT(${lon} ${lat})"`;
	}

	override mapFromDriverValue(value: string): LngLat {
		const numbers = value.slice(value.indexOf('(') + 1, -1);
		return numbers.split(' ').map(Number) as LngLat; // driver value will look like `POINT(lon lat)`
	}
}

export function geographypoint<TName extends string>(name: TName): SingleStoreGeographyPointBuilderInitial<TName> {
	return new SingleStoreGeographyPointBuilder(name);
}
