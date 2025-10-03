import { geometry, integer, pgSchema, unique } from 'drizzle-orm/pg-core';

export const schema = pgSchema('seeder_lib_pg');

export const geometryTable = schema.table('geometry_table', {
	geometryPointTuple: geometry('geometry_point_tuple', { type: 'point', mode: 'tuple', srid: 0 }),
	geometryPointXy: geometry('geometry_point_xy', { type: 'point', mode: 'xy', srid: 0 }),
});
export const geometryUniqueTable = schema.table('geometry_unique_table', {
	geometryPointTuple: geometry('geometry_point_tuple', { type: 'point', mode: 'tuple', srid: 0 }).unique(),
	geometryPointXy: geometry('geometry_point_xy', { type: 'point', mode: 'xy', srid: 0 }).unique(),
});
export const geometryArrayTable = schema.table('geometry_array_table', {
	geometryPointTuple: geometry('geometry_point_tuple', { type: 'point', mode: 'tuple', srid: 0 }).array(),
	geometryPointXy: geometry('geometry_point_xy', { type: 'point', mode: 'xy', srid: 0 }).array(),
});

export const compositeUniqueKeyTable = schema.table('composite_unique_key_table', {
	id: integer('id'),
	geometryPoint: geometry('geometry_point', { type: 'point' }),
}, (table) => [
	unique().on(
		table.id,
		table.geometryPoint,
	),
]);
