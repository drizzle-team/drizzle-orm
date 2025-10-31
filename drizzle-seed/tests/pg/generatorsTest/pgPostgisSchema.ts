import { geometry, integer, pgTable, unique } from 'drizzle-orm/pg-core';

export const geometryTable = pgTable('geometry_table', {
	geometryPointTuple: geometry('geometry_point_tuple', { type: 'point', mode: 'tuple', srid: 0 }),
	geometryPointXy: geometry('geometry_point_xy', { type: 'point', mode: 'xy', srid: 0 }),
});
export const geometryUniqueTable = pgTable('geometry_unique_table', {
	geometryPointTuple: geometry('geometry_point_tuple', { type: 'point', mode: 'tuple', srid: 0 }).unique(),
	geometryPointXy: geometry('geometry_point_xy', { type: 'point', mode: 'xy', srid: 0 }).unique(),
});
export const geometryArrayTable = pgTable('geometry_array_table', {
	geometryPointTuple: geometry('geometry_point_tuple', { type: 'point', mode: 'tuple', srid: 0 }).array(),
	geometryPointXy: geometry('geometry_point_xy', { type: 'point', mode: 'xy', srid: 0 }).array(),
});

export const compositeUniqueKeyTable = pgTable('composite_unique_key_table', {
	id: integer('id'),
	geometryPoint: geometry('geometry_point', { type: 'point' }),
}, (table) => [
	unique().on(
		table.id,
		table.geometryPoint,
	),
]);
