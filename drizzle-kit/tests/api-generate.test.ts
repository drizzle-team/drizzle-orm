import { expect, test } from 'vitest';
import { integer, pgTable } from 'drizzle-orm/pg-core';
import {
	GenerateMigrationQuestionsError,
	generateDrizzleJson,
	generateMigration,
	preflightMigration,
} from '../src/api';

test('api preflight exports questions and answers drive non-interactive generate', async () => {
	const prev = generateDrizzleJson({
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	});

	const cur = generateDrizzleJson(
		{
			accounts: pgTable('accounts', {
				id: integer('id').primaryKey(),
			}),
		},
		prev.id,
	);

	const questions = await preflightMigration(prev, cur);

	expect(questions).toStrictEqual({
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

	await expect(
		generateMigration(prev, cur, { answers: questions }),
	).rejects.toBeInstanceOf(GenerateMigrationQuestionsError);

	const sqlStatements = await generateMigration(prev, cur, {
		answers: {
			version: 1,
			questions: [
				{
					...questions.questions[0]!,
					answer: { type: 'rename', from: { name: 'users', schema: 'public' } },
				},
			],
		},
	});

	expect(sqlStatements).toContain('ALTER TABLE "users" RENAME TO "accounts";');
});
