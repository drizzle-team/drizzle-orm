import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table';
import { sql } from '~/sql/sql.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type LngLat = [lng: number, lat: number];

type GeographyPoint = LngLat;
type GeographyLineString = Array<LngLat>;
type GeographyPolygon = Array<Array<LngLat>>;

type Geography = {
	__type: 'POINT';
	data: GeographyPoint;
} | {
	__type: 'LINESTRING';
	data: GeographyLineString;
} | {
	__type: 'POLYGON';
	data: GeographyPolygon;
};

export type SingleStoreGeographyBuilderInitial<TName extends string> = SingleStoreGeographyBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'SingleStoreGeography';
	data: GeographyPoint | GeographyLineString | GeographyPolygon;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreGeographyBuilder<T extends ColumnBuilderBaseConfig<'array', 'SingleStoreGeography'>>
	extends SingleStoreColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SingleStoreGeographyBuilder';

	constructor(name: T['name']) {
		super(name, 'array', 'SingleStoreGeography');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreGeography<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreGeography(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreGeography<T extends ColumnBaseConfig<'array', 'SingleStoreGeography'>>
	extends SingleStoreColumn<T>
{
	static readonly [entityKind]: string = 'SingleStoreGeography';

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreGeographyBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return 'text';
		// TODO `geography` is only supported on rowstore tables. Geography data
		// on columnstore should be stored as `text`
		// return 'geography';
	}

	override mapToDriverValue(value: GeographyPoint | GeographyLineString | GeographyPolygon) {
		const test = value[0];
		if (typeof test === 'number') {
			const [lng, lat] = value as GeographyPoint;
			return sql`"POINT(${lng} ${lat})"`;
		} else if (Array.isArray(test)) {
			if (typeof test[0] === 'number') {
				const linestring = value as GeographyLineString;
				const points = linestring.map((ls) => sql`${ls[0]} ${ls[1]}`);
				return sql`"LINESTRING(${sql.join(points, sql.raw(', '))})"`;
			} else {
				const polygon = value as GeographyPolygon;
				const rings = polygon.map((ring) => {
					const points = ring.map((point) => sql`${point[0]} ${point[1]}`);
					return sql`(${sql.join(points, sql.raw(', '))})`;
				});
				return sql`"POLYGON(${sql.join(rings, sql.raw(', '))})`;
			}
		} else {
			throw new Error('value is not Array');
		}
	}

	override mapFromDriverValue(value: string): Geography {
		const firstParenIndex = value.indexOf('(');
		const __type = value.slice(0, firstParenIndex);
		const inner = value.slice(firstParenIndex + 1, -1);
		switch (__type) {
			case 'POINT': {
				return {
					__type,
					data: inner.split(' ').map(Number) as LngLat,
				};
			}
			case 'LINESTRING': {
				const pairs = inner.split(', ');
				return {
					__type,
					data: pairs.map((pair) => pair.split(' ').map(Number)) as GeographyLineString,
				};
			}
			case 'POLYGON': {
				const rings = inner.slice(1, -1).split('), (');
				return {
					__type,
					data: rings.map((ring) => {
						const pairs = ring.split(', ');
						return pairs.map((pair) => pair.split(' ').map(Number));
					}) as GeographyPolygon,
				};
			}
			default: {
				throw new Error('unexpected Geography type');
			}
		}
	}
}

export function geography<TName extends string>(name: TName): SingleStoreGeographyBuilderInitial<TName> {
	return new SingleStoreGeographyBuilder(name);
}