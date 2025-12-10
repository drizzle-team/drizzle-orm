import type { PgGeometryConfig } from './types';

export function mapGeometryToDriverValue(value: [number, number], config: PgGeometryConfig): string {
	let wkt = `point(${value[0]} ${value[1]})`;

	if (config.srid) {
		wkt = `SRID=${config.srid};${wkt}`;
	}

	return wkt;
}

export function getGeometrySQLType(config: PgGeometryConfig): string {
	const type = config.type ?? 'Point';
	const srid = config.srid;

	return `geometry(${type}${srid ? `,${srid}` : ''})`;
}
