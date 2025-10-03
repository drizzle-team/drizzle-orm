import { geometry, pgSchema } from 'drizzle-orm/pg-core';

export const schema = pgSchema('seeder_lib_pg');

export const allDataTypes = schema.table('postgis_data_types', {
	geometry: geometry('geometry', { type: 'point', mode: 'tuple', srid: 0 }),
});

export const allArrayDataTypes = schema.table('postgis_array_data_types', {
	geometryArray: geometry('geometry_array', { type: 'point', mode: 'tuple', srid: 0 }).array(1),
});
