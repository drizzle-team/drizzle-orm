import { datetime, mysqlTable, point, year } from 'drizzle-orm/mysql-core';

export const datetimeTable = mysqlTable('datetime_table', {
	datetime: datetime('datetime'),
});

export const yearTable = mysqlTable('year_table', {
	year: year('year'),
});

export const pointTable = mysqlTable('point_table', {
	point: point('point'),
});
