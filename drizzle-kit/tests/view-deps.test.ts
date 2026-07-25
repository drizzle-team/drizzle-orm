import { describe, expect, test } from 'vitest';
import { sortCreateViewStatements, sortDropViewStatements } from '../src/viewDeps';

describe('sortCreateViewStatements', () => {
	test('returns empty array for empty input', () => {
		expect(sortCreateViewStatements([], 'pg')).toEqual([]);
	});

	test('returns single view unchanged', () => {
		const views = [{ name: 'v1', definition: 'select 1' }];
		expect(sortCreateViewStatements(views, 'pg')).toEqual(views);
	});

	test('sorts pg views by dependency', () => {
		const views = [
			{ name: 'dependent', definition: 'select * from "base_view"' },
			{ name: 'base_view', definition: 'select * from "users"' },
		];
		const sorted = sortCreateViewStatements(views, 'pg');
		expect(sorted.map((v) => v.name)).toEqual(['base_view', 'dependent']);
	});

	test('sorts mysql views by dependency', () => {
		const views = [
			{ name: 'dependent', definition: 'select * from `base_view`' },
			{ name: 'base_view', definition: 'select * from `users`' },
		];
		const sorted = sortCreateViewStatements(views, 'mysql');
		expect(sorted.map((v) => v.name)).toEqual(['base_view', 'dependent']);
	});

	test('sorts three-level dependency chain', () => {
		const views = [
			{ name: 'level3', definition: 'select * from "level2"' },
			{ name: 'level1', definition: 'select * from "some_table"' },
			{ name: 'level2', definition: 'select * from "level1"' },
		];
		const sorted = sortCreateViewStatements(views, 'pg');
		expect(sorted.map((v) => v.name)).toEqual(['level1', 'level2', 'level3']);
	});

	test('handles independent views without changing order', () => {
		const views = [
			{ name: 'view_b', definition: 'select * from "table_b"' },
			{ name: 'view_a', definition: 'select * from "table_a"' },
		];
		const sorted = sortCreateViewStatements(views, 'pg');
		expect(sorted.map((v) => v.name)).toEqual(['view_b', 'view_a']);
	});

	test('does not break on circular dependency', () => {
		const views = [
			{ name: 'view_a', definition: 'select * from "view_b"' },
			{ name: 'view_b', definition: 'select * from "view_a"' },
		];
		const sorted = sortCreateViewStatements(views, 'pg');
		expect(sorted.length).toBe(2);
	});

	test('handles self-referencing view', () => {
		const views = [
			{ name: 'recursive', definition: 'select * from "recursive"' },
			{ name: 'base', definition: 'select 1' },
		];
		const sorted = sortCreateViewStatements(views, 'pg');
		expect(sorted.length).toBe(2);
	});

	test('ignores references to non-view tables', () => {
		const views = [
			{ name: 'top', definition: 'select * from "bottom"' },
			{ name: 'bottom', definition: 'select * from "users"' },
		];
		const sorted = sortCreateViewStatements(views, 'pg');
		expect(sorted.map((v) => v.name)).toEqual(['bottom', 'top']);
	});
});

describe('sortDropViewStatements', () => {
	test('drops dependent views before their dependencies', () => {
		const drops = [
			{ name: 'base_view', definition: 'select 1' },
			{ name: 'dependent', definition: 'select * from "base_view"' },
		];
		const allViews: Record<string, typeof drops[0]> = {
			base_view: { name: 'base_view', definition: 'select 1' },
			dependent: { name: 'dependent', definition: 'select * from "base_view"' },
		};
		const sorted = sortDropViewStatements(drops, allViews, 'pg');
		expect(sorted.map((v) => v.name)).toEqual(['dependent', 'base_view']);
	});
});
