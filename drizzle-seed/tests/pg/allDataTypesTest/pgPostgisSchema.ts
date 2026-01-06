import { geometry, pgTable } from 'drizzle-orm/pg-core';

export const allDataTypes = pgTable('postgis_data_types', {
	geometry: geometry('geometry', { type: 'point', mode: 'tuple', srid: 0 }),
});

export const allArrayDataTypes = pgTable('postgis_array_data_types', {
	geometryArray: geometry('geometry_array', { type: 'point', mode: 'tuple', srid: 0 }).array(),
});
