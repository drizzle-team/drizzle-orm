import { CreateView } from 'src/dialects/mysql/statements';
import { entityKey, sortCreateViews } from 'src/dialects/utils';
import { expect, test } from 'vitest';

const createView = (name: string, schema?: string) => ({
	type: 'create_view' as const,
	view: { schema, name },
});

test('sort create views: order is kept without metadata', () => {
	const statements = [createView('b'), createView('a')];
	const sorted = sortCreateViews(statements, undefined);

	expect(sorted).toStrictEqual([createView('b'), createView('a')]);
});

test('sort create views: no statements', () => {
	// b depends on a
	const sorted = sortCreateViews([], new Map([[entityKey('public', 'b'), [entityKey('public', 'a')]]]));

	expect(sorted).toStrictEqual([]);
});

test('sort create views: dependency goes before dependent view', () => {
	const statements = [createView('b', 'public'), createView('a', 'public')];

	// a has 0 dependencies
	// b depends on a
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey('public', 'a'), []],
			[entityKey('public', 'b'), [entityKey('public', 'a')]],
		]),
	);

	expect(sorted).toStrictEqual([createView('a', 'public'), createView('b', 'public')]);
});

test('sort create views: chain declared in reverse order', () => {
	const statements = [createView('c'), createView('b'), createView('a')];

	// a has 0 dependencies
	// b depends on a
	// c depends on b
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey(null, 'b'), [entityKey(null, 'a')]],
			[entityKey(null, 'a'), []],
			[entityKey(null, 'c'), [entityKey(null, 'b')]],
		]),
	);

	expect(sorted).toStrictEqual([createView('a'), createView('b'), createView('c')]);
});

test('sort create views: diamond', () => {
	const statements = [createView('d', 'public'), createView('c'), createView('b', 'other_schema'), createView('a')];

	// a has 0 dependencies
	// b depends on a
	// c depends on a
	// d depends on b and c
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey(null, 'a'), []],
			[entityKey('other_schema', 'b'), [entityKey(null, 'a')]],
			[entityKey(null, 'c'), [entityKey(null, 'a')]],
			[entityKey('public', 'd'), [entityKey('other_schema', 'b'), entityKey(null, 'c')]],
		]),
	);

	expect(sorted).toStrictEqual([
		createView('a'),
		createView('b', 'other_schema'),
		createView('c'),
		createView('d', 'public'),
	]);
});

test('sort create views: independent views keep their order', () => {
	const statements = [createView('z'), createView('x'), createView('y', 'public')];

	// x has 0 dependencies
	// y has 0 dependencies
	// z has 0 dependencies
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey(null, 'x'), []],
			[entityKey('public', 'y'), []],
			[entityKey(null, 'z'), []],
		]),
	);

	expect(sorted).toStrictEqual([createView('z'), createView('x'), createView('y', 'public')]);
});

test('sort create views: dependency that is not created in this migration is skipped', () => {
	const statements = [createView('b', 'public'), createView('a')];

	// "existing" is already in the database (or .existing()), so there is no create statement for it
	// a depends on existing
	// b depends on existing
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey('public', 'a'), [entityKey('public', 'existing')]],
			[entityKey(null, 'b'), [entityKey('public', 'existing')]],
		]),
	);

	expect(sorted).toStrictEqual([createView('b', 'public'), createView('a')]);
});

test('sort create views: view without metadata entry has no dependencies', () => {
	const statements = [createView('b', 'public'), createView('a', 'public')];

	// a depends on b
	// b has no entry
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey('public', 'a'), [entityKey('public', 'b')]],
		]),
	);

	expect(sorted).toStrictEqual([createView('b', 'public'), createView('a', 'public')]);
});

test('sort create views: dependency cycle does not loop forever', () => {
	const statements = [createView('a', 'public'), createView('b', 'public')];

	// a depends on b
	// b depends on a
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey('public', 'a'), [entityKey('public', 'b')]],
			[entityKey('public', 'b'), [entityKey('public', 'a')]],
		]),
	);

	expect(sorted).toStrictEqual([createView('b', 'public'), createView('a', 'public')]);
});

test('sort create views: same view name in different schemas', () => {
	const statements = [createView('v', 's1'), createView('v', 's2')];

	// s1.v depends on s2.v
	// s2.v has 0 dependencies
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey('s1', 'v'), [entityKey('s2', 'v')]],
			[entityKey('s2', 'v'), []],
		]),
	);

	expect(sorted).toStrictEqual([createView('v', 's2'), createView('v', 's1')]);
});

test('sort create views: names with dots do not collide', () => {
	const statements = [createView('c', 'a.b'), createView('b.c', 'a')];

	// schema "a.b" + view "c" and schema "a" + view "b.c" are different views
	// view "c" in schema "a.b" depends on view "b.c" in schema "a"
	// view "b.c" in schema "a" has 0 dependencies
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey('a.b', 'c'), [entityKey('a', 'b.c')]],
			[entityKey('a', 'b.c'), []],
		]),
	);

	expect(sorted).toStrictEqual([createView('b.c', 'a'), createView('c', 'a.b')]);
});

test('sort create views: views without schema (mysql, sqlite)', () => {
	const statements: CreateView[] = [
		{
			type: 'create_view' as const,
			view: {
				name: 'b',
				algorithm: 'merge',
				definition: '',
				entityType: 'views',
				sqlSecurity: 'definer',
				withCheckOption: null,
			},
			replace: false,
		},
		{
			type: 'create_view' as const,
			view: {
				name: 'a',
				algorithm: 'merge',
				definition: '',
				entityType: 'views',
				sqlSecurity: 'definer',
				withCheckOption: null,
			},
			replace: false,
		},
	];

	// a has 0 dependencies
	// b depends on a
	const sorted = sortCreateViews(
		statements,
		new Map([
			[entityKey(null, 'a'), []],
			[entityKey(null, 'b'), [entityKey(null, 'a')]],
		]),
	);

	// statements are returned as is, extra fields are kept
	expect(sorted).toStrictEqual([
		{
			type: 'create_view',
			view: {
				name: 'a',
				algorithm: 'merge',
				definition: '',
				entityType: 'views',
				sqlSecurity: 'definer',
				withCheckOption: null,
			},
			replace: false,
		},
		{
			type: 'create_view',
			view: {
				name: 'b',
				algorithm: 'merge',
				definition: '',
				entityType: 'views',
				sqlSecurity: 'definer',
				withCheckOption: null,
			},
			replace: false,
		},
	]);
});
