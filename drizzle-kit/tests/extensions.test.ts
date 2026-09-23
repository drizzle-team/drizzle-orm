import { expect, test } from 'vitest';
import { getTablesFilterByExtensions } from '../src/extensions/getTablesFilterByExtensions';

test('postgis extension filters', () => {
	const filters = getTablesFilterByExtensions({
		extensionsFilters: ['postgis'],
		dialect: 'postgresql',
	});

	expect(filters).toEqual([
		'!geography_columns',
		'!geometry_columns',
		'!spatial_ref_sys',
	]);
});

test('pg_stat_statements extension filters', () => {
	const filters = getTablesFilterByExtensions({
		extensionsFilters: ['pg_stat_statements'],
		dialect: 'postgresql',
	});

	expect(filters).toEqual(['!pg_stat_*']);
});

test('multiple extensions filters', () => {
	const filters = getTablesFilterByExtensions({
		extensionsFilters: ['postgis', 'pg_stat_statements'],
		dialect: 'postgresql',
	});

	expect(filters).toEqual([
		'!geography_columns',
		'!geometry_columns',
		'!spatial_ref_sys',
		'!pg_stat_*',
	]);
});

test('no extension filters', () => {
	const filters = getTablesFilterByExtensions({
		extensionsFilters: undefined,
		dialect: 'postgresql',
	});

	expect(filters).toEqual([]);
});

test('extension filters only for postgresql', () => {
	const filters = getTablesFilterByExtensions({
		extensionsFilters: ['postgis', 'pg_stat_statements'],
		dialect: 'mysql',
	});

	expect(filters).toEqual([]);
});
