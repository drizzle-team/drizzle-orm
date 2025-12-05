import type { PgGeometryConfig } from './types';

export function mapGeometryToDriverValue(value: [number, number], config: PgGeometryConfig): string {
	let wkt = `point(${value[0]} ${value[1]})`;

	if (config.srid) {
		wkt = `SRID=${config.srid};${wkt}`;
	}

	return wkt;
}
