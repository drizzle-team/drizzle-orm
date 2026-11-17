import { expect, test } from 'vitest';
import { createMigrationResolver } from '../src/cli/commands/migrate';

test('preflight collects unresolved table conflicts', async () => {
	const resolver = createMigrationResolver();

	const result = await resolver.tablesResolver({
		created: [{ name: 'accounts', schema: 'public' }] as any,
		deleted: [{ name: 'users', schema: 'public' }] as any,
	});

	expect(result).toStrictEqual({
		created: [{ name: 'accounts', schema: 'public' }],
		deleted: [{ name: 'users', schema: 'public' }],
		moved: [],
		renamed: [],
	});

	expect(resolver.hasUnresolvedQuestions()).toBe(true);
	expect(resolver.questions()).toStrictEqual({
		version: 1,
		questions: [
			{
				id: 'table:public.accounts',
				kind: 'table',
				to: { name: 'accounts', schema: 'public' },
				choices: [
					{ type: 'create' },
					{ type: 'rename', from: { name: 'users', schema: 'public' } },
				],
			},
		],
	});
});

test('answers apply renames without prompting', async () => {
	const resolver = createMigrationResolver({
		answers: {
			version: 1,
			questions: [
				{
					id: 'table:public.accounts',
					kind: 'table',
					to: { name: 'accounts', schema: 'public' },
					choices: [
						{ type: 'create' },
						{ type: 'rename', from: { name: 'users', schema: 'public' } },
					],
					answer: { type: 'rename', from: { name: 'users', schema: 'public' } },
				},
			],
		},
	});

	const result = await resolver.tablesResolver({
		created: [{ name: 'accounts', schema: 'public' }] as any,
		deleted: [{ name: 'users', schema: 'public' }] as any,
	});

	expect(result).toStrictEqual({
		created: [],
		deleted: [],
		moved: [],
		renamed: [
			{
				from: { name: 'users', schema: 'public' },
				to: { name: 'accounts', schema: 'public' },
			},
		],
	});

	expect(resolver.hasUnresolvedQuestions()).toBe(false);
	expect(resolver.questions().questions[0]?.answer).toStrictEqual({
		type: 'rename',
		from: { name: 'users', schema: 'public' },
	});
});

test('column questions are keyed by table context', async () => {
	const resolver = createMigrationResolver();

	await resolver.columnsResolver({
		tableName: 'users',
		schema: 'public',
		created: [{ name: 'full_name' }] as any,
		deleted: [{ name: 'name' }] as any,
	});

	expect(resolver.questions()).toStrictEqual({
		version: 1,
		questions: [
			{
				id: 'column:public.users:full_name',
				kind: 'column',
				to: { name: 'full_name' },
				table: { name: 'users', schema: 'public' },
				choices: [
					{ type: 'create' },
					{ type: 'rename', from: { name: 'name' } },
				],
			},
		],
	});
});
