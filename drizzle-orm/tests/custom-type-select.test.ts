import { describe, expect, it } from 'vitest';
import { pgTable, serial, text } from '~/pg-core';
import { customType } from '~/pg-core/columns/custom.ts';
import { QueryBuilder } from '~/pg-core/query-builders/query-builder.ts';
import { sql } from '~/sql/sql.ts';

type Point = { x: number; y: number };

const pointType = customType<{ data: Point; driverData: string }>({
	dataType() {
		return 'geometry(Point,4326)';
	},
	toDriver(value: Point): string {
		return `SRID=4326;POINT(${value.x} ${value.y})`;
	},
	fromDriver(value: string): Point {
		const matches = value.match(/POINT\((?<x>[\d.-]+) (?<y>[\d.-]+)\)/);
		const { x, y } = matches?.groups ?? {};
		return { x: parseFloat(String(x)), y: parseFloat(String(y)) };
	},
	selectFromDb(column) {
		return sql`ST_AsText(${column})`;
	},
});

const plainCustom = customType<{ data: string }>({
	dataType() {
		return 'text';
	},
});

const locations = pgTable('locations', {
	id: serial('id').primaryKey(),
	name: text('name'),
	coords: pointType('coords'),
	plain: plainCustom('plain'),
});

describe('custom type selectFromDb', () => {
	it('wraps custom column with selectFromDb in select queries', () => {
		const qb = new QueryBuilder();
		const query = qb.select().from(locations).toSQL();
		expect(query.sql).toContain('ST_AsText("locations"."coords")');
	});

	it('does not wrap custom columns without selectFromDb', () => {
		const qb = new QueryBuilder();
		const query = qb.select({ plain: locations.plain }).from(locations).toSQL();
		expect(query.sql).toContain('"locations"."plain"');
		expect(query.sql).not.toContain('ST_AsText');
	});

	it('maps results through fromDriver', () => {
		const point = locations.coords.mapFromDriverValue('POINT(1.5 2.5)');
		expect(point).toEqual({ x: 1.5, y: 2.5 });
	});

	it('still emits correct SQL type for migrations', () => {
		expect(locations.coords.getSQLType()).toBe('geometry(Point,4326)');
	});
});
