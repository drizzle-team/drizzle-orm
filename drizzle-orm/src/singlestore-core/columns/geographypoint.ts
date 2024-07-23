import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table';
import { sql } from '~/sql/sql.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

type GeographyPoint = [number, number];

export type SingleStoreGeographyPointBuilderInitial<TName extends string> = SingleStoreGeographyPointBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'SingleStoreGeographyPoint';
	data: GeographyPoint;
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

	override mapToDriverValue([lon, lat]: GeographyPoint) {
		return sql`"POINT(${lon} ${lat})"`;
	}

	override mapFromDriverValue(value: string): GeographyPoint {
		const numbers = value.slice(value.indexOf('(') + 1, -1);
		return numbers.split(' ').map(Number) as GeographyPoint; // driver value will look like `POINT(lon lat)`
	}
}

export function geographypoint<TName extends string>(name: TName): SingleStoreGeographyPointBuilderInitial<TName> {
	return new SingleStoreGeographyPointBuilder(name);
}
