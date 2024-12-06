import { datetime, mysqlTable, year } from 'drizzle-orm/mysql-core';

export const datetimeTable = mysqlTable('datetime_table', {
	datetime: datetime('datetime'),
});

export const yearTable = mysqlTable('year_table', {
	year: year('year'),
});
