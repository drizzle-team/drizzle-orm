import { pgTable, text, unique } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { diffTestSchemas } from './mocks-postgres';

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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" ADD CONSTRAINT "users_name_unique" UNIQUE("name");`,
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
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

	const { sqlStatements } = await diffTestSchemas(from, to, []);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.users.unique_name->public.users.unique_name2',
	]);
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.users.email->public.users.email2',
		'public.users.unique_name->public.users.unique_name2',
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" RENAME COLUMN "email" TO "email2";`,
		`ALTER TABLE "users" RENAME CONSTRAINT "unique_name" TO "unique_name2";`,
		'ALTER TABLE "users" RENAME CONSTRAINT "users_email_unique" TO "users_email2_unique";',
	]);
});

test('unique #11', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
			email: text(),
		}, (t) => [
			unique('unique_name').on(t.name),
			unique('unique_email').on(t.email),
		]),
	};
	const to = {
		users: pgTable('users', {
			name: text(),
			email: text(),
		}, (t) => [
			unique('unique_name2').on(t.name),
			unique('unique_email2').on(t.email),
		]),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.users.unique_name->public.users.unique_name2',
	]);
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

	const { sqlStatements, errors } = await diffTestSchemas(from, to, [
		'public.users->public.users2',
	]);

	expect(errors).toStrictEqual([{
		type: 'implicit_column_unique_name',
		schema: 'public',
		table: 'users',
		column: 'email',
	}]);
});

/* renamed both table and column, but declared name of the key */
test.only('pk #1', async () => {
	const from = {
		users: pgTable('users', {
			name: text(),
		}),
	};
	const to = {
		users: pgTable('users', {
			name: text().primaryKey(),
		}),
	};

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.users->public.users2',
		'public.users2.email->public.users2.email2',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" RENAME TO "users2";`,
		`ALTER TABLE "users2" RENAME COLUMN "email" TO "email2";`,
		'ALTER TABLE "users2" RENAME CONSTRAINT "users_email_unique" TO "users_email_key";',
	]);
});


test('unique #13', async () => {
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

	const { sqlStatements } = await diffTestSchemas(from, to, [
		'public.users->public.users2',
		'public.users2.email->public.users2.email2',
	]);

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "users" RENAME TO "users2";`,
		`ALTER TABLE "users2" RENAME COLUMN "email" TO "email2";`,
		'ALTER TABLE "users2" RENAME CONSTRAINT "users_email_unique" TO "users_email_key";',
	]);
});

