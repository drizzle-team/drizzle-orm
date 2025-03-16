import { pgTable, text, unique } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './schemaDiffer';

test('unique #1', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD CONSTRAINT "users_name_key" UNIQUE("name");`,
	]);
});

test('unique #2', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique('unique_name'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE("name");`,
	]);
});

test('unique #3', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique('unique_name', { nulls: 'distinct' }),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE("name");`,
	]);
});

test('unique #4', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique('unique_name', { nulls: 'not distinct' }),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE NULLS NOT DISTINCT("name");`,
	]);
});

test('unique #5', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().unique('unique_name', { nulls: 'not distinct' }),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE NULLS NOT DISTINCT("name");`,
	]);
});

test('unique #6', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE("name");`,
	]);
});

test('unique #7', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name).nullsNotDistinct()]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(1);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name" UNIQUE NULLS NOT DISTINCT("name");`,
	]);
});

test('unique #8', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, []);
	expect(statements.length).toBe(2);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" DROP CONSTRAINT "unique_name";`,
		`ALTER TABLE "users" ADD CONSTRAINT "unique_name2" UNIQUE("name");`,
	]);
});

test('unique #9', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.users.unique_name->public.users.unique_name2',
	]);
	expect(statements.length).toBe(1);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" RENAME CONSTRAINT "unique_name" TO "unique_name2";`,
	]);
});

test('unique #10', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
			email: text().unique(),
		}, (t) => [unique('unique_name').on(t.name)]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
			email2: text().unique(),
		}, (t) => [unique('unique_name2').on(t.name)]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.users.email->public.users.email2',
		'public.users.unique_name->public.users.unique_name2',
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" RENAME COLUMN "email" TO "email2";`,
		`ALTER TABLE "users" DROP CONSTRAINT "users_email_key";`,
		`ALTER TABLE "users" RENAME CONSTRAINT "unique_name" TO "unique_name2";`,
		`ALTER TABLE "users" ADD CONSTRAINT "users_email2_key" UNIQUE("email2");`,
	]);
});

test('unique #11', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
			email: text(),
		}, (t) => [unique('unique_name').on(t.name), unique('unique_email').on(t.email)]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
			email: text(),
		}, (t) => [unique('unique_name2').on(t.name), unique('unique_email2').on(t.email)]),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.users.unique_name->public.users.unique_name2',
	]);
	expect(statements.length).toBe(3);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" DROP CONSTRAINT "unique_email";`,
		`ALTER TABLE "users" RENAME CONSTRAINT "unique_name" TO "unique_name2";`,
		`ALTER TABLE "users" ADD CONSTRAINT "unique_email2" UNIQUE("email");`,
	]);
});

/* rename table, unfortunately has to trigger constraint recreate */
test('unique #12', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
			email: text().unique(),
		}),
	};
	const to = {
		users: pgTable('users2', {
			name: text(),
			email: text().unique(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.users->public.users2',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" RENAME TO "users2";`,
		`ALTER TABLE "users2" DROP CONSTRAINT "users_email_key";`,
		`ALTER TABLE "users2" ADD CONSTRAINT "users2_email_key" UNIQUE("email");`,
	]);
});

/* renamed both table and column, but declared name of the key */
test('unqique #13', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
			email: text().unique(),
		}),
	};
	const to = {
		users: pgTable('users2', {
			name: text(),
			email2: text().unique('users_email_key'),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemas(from, to, [
		'public.users->public.users2',
		'public.users2.email->public.users2.email2',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" RENAME TO "users2";`,
		`ALTER TABLE "users2" RENAME COLUMN "email" TO "email2";`,
	]);
});
