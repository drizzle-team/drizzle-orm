export type PgGeometryMode = 'tuple' | 'xy';

export type PgGeometryType =
	| 'Point'
	| 'LineString'
	| 'Polygon'
	| 'MultiPoint'
	| 'MultiLineString'
	| 'MultiPolygon'
	| 'GeometryCollection';

export type PgGeometryTypeAnyCase = PgGeometryType | Lowercase<PgGeometryType>;

export interface PgGeometryConfig<
	T extends PgGeometryMode = PgGeometryMode,
	G extends PgGeometryType = PgGeometryType,
> {
	mode?: T;
	type?: G | (string & {});
	srid?: number;
}
