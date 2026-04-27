import { describe, expect, it } from 'vitest';
import { boolean } from '~/pg-core/columns/boolean.ts';
import { isPgComposite, pgComposite } from '~/pg-core/columns/composite.ts';
import { doublePrecision } from '~/pg-core/columns/double-precision.ts';
import { integer } from '~/pg-core/columns/integer.ts';
import { text } from '~/pg-core/columns/text.ts';
import { pgTable } from '~/pg-core/table.ts';

describe('pgComposite — runtime', () => {
	const point = pgComposite('point', {
		x: doublePrecision().notNull(),
		y: doublePrecision().notNull(),
	});

	const labeledPoint = pgComposite('labeled_point', {
		label: text().notNull(),
		x: doublePrecision().notNull(),
		y: doublePrecision().notNull(),
		visible: boolean(),
		score: integer(),
	});

	it('isPgComposite identifies composite factories', () => {
		expect(isPgComposite(point)).toBe(true);
		expect(isPgComposite(labeledPoint)).toBe(true);
		expect(isPgComposite({})).toBe(false);
		expect(isPgComposite(() => {})).toBe(false);
		expect(isPgComposite(null)).toBe(false);
	});

	it('exposes name and field metadata', () => {
		expect(point.compositeName).toBe('point');
		expect(Object.keys(point.compositeFields)).toEqual(['x', 'y']);
		expect(point.schema).toBeUndefined();
	});

	it('column getSQLType returns the composite name', () => {
		const places = pgTable('places', { loc: point().notNull() });
		expect((places.loc as any).getSQLType()).toBe('point');
	});

	it('round-trips a simple composite through driver mappers', () => {
		const places = pgTable('places', { loc: point().notNull() });
		const col = places.loc as any;

		const driverIn = col.mapToDriverValue({ x: 1.5, y: -2.5 });
		expect(driverIn).toBe('(1.5,-2.5)');

		const jsOut = col.mapFromDriverValue('(1.5,-2.5)');
		expect(jsOut).toEqual({ x: 1.5, y: -2.5 });
	});

	it('round-trips composites with text, NULL, boolean, and integer fields', () => {
		const places = pgTable('places', { lp: labeledPoint().notNull() });
		const col = places.lp as any;

		const input = { label: 'origin', x: 0, y: 0, visible: true, score: 42 };
		const driverText = col.mapToDriverValue(input);
		expect(driverText).toBe('(origin,0,0,t,42)');

		const parsed = col.mapFromDriverValue(driverText);
		expect(parsed).toEqual(input);
	});

	it('handles NULL fields in both directions', () => {
		const places = pgTable('places', { lp: labeledPoint().notNull() });
		const col = places.lp as any;

		const input = { label: 'p1', x: 1, y: 2, visible: null, score: null };
		const driverText = col.mapToDriverValue(input);
		expect(driverText).toBe('(p1,1,2,,)');

		const parsed = col.mapFromDriverValue(driverText);
		expect(parsed).toEqual(input);
	});

	it('quotes and escapes string fields with structural characters', () => {
		const places = pgTable('places', { lp: labeledPoint().notNull() });
		const col = places.lp as any;

		const input = { label: 'hello, "world"', x: 1, y: 2, visible: false, score: 0 };
		const driverText = col.mapToDriverValue(input);
		// label quoted with embedded double-quotes escaped as `\"`
		expect(driverText).toBe('("hello, \\"world\\"",1,2,f,0)');

		const parsed = col.mapFromDriverValue(driverText);
		expect(parsed).toEqual(input);
	});

	it('supports a callable factory with explicit column name', () => {
		const places = pgTable('places', {
			loc: point('explicit_name').notNull(),
		});
		expect(places.loc.name).toBe('explicit_name');
	});

	it('schema-bound composites carry the schema name', () => {
		const { pgSchema } = require('~/pg-core/schema.ts');
		const sch = pgSchema('geom');
		const sp = sch.composite('s_point', {
			x: doublePrecision().notNull(),
			y: doublePrecision().notNull(),
		});
		expect(sp.schema).toBe('geom');
		expect(sp.compositeName).toBe('s_point');
	});
});
