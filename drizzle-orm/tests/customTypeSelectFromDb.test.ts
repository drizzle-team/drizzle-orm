import { RDSDataClient } from '@aws-sdk/client-rds-data';
import { expect, test } from 'vitest';

import { drizzle } from '~/aws-data-api/pg';
import { customType, PgDialect, pgTable } from '~/pg-core';
import { sql } from '~/sql/sql';

const db = drizzle(new RDSDataClient(), {
	database: '',
	resourceArn: '',
	secretArn: '',
});

test('customType selectFromDb is used in selects', () => {
	type Point = { lat: number; lng: number };

	const pointType = customType<{ data: Point; driverData: string }>({
		dataType: () => 'geometry(Point,4326)',
		selectFromDb: (column) => sql<string>`st_astext(${column})`.mapWith(column),
		fromDriver: (value) => {
			const matches = value.match(/POINT\\((?<lng>[\\d.-]+) (?<lat>[\\d.-]+)\\)/);
			const { lat, lng } = matches?.groups ?? {};
			return { lat: parseFloat(String(lat)), lng: parseFloat(String(lng)) };
		},
	});

	const t = pgTable('t', {
		coords: pointType('coords'),
	});

	const q = db.select({ coords: t.coords }).from(t);
	const query = new PgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).toContain('st_astext');
});

