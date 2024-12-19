import { type Equal, Expect } from 'type-tests/utils';
import { type InferInsertModel, type InferSelectModel, sql } from '~/index';
import { mysqlTable, serial, text, varchar } from '~/mysql-core';
import { drizzle } from '~/mysql2';
import { db } from './db';

const users = mysqlTable(
	'users',
	{
		id: serial('id').primaryKey(),
		firstName: varchar('first_name', { length: 255 }),
		lastName: varchar('last_name', { length: 255 }),
		email: text('email').notNull(),
		fullName: text('full_name').generatedAlwaysAs(sql`concat_ws(first_name, ' ', last_name)`),
		upperName: text('upper_name').generatedAlwaysAs(
			sql` case when first_name is null then null else upper(first_name) end `,
		).$type<string | null>(), // There is no way for drizzle to detect nullability in these cases. This is how the user can work around it
	},
);

{
	type User = typeof users.$inferSelect;
	type NewUser = typeof users.$inferInsert;

	Expect<
		Equal<
			{
				id: number;
				firstName: string | null;
				lastName: string | null;
				email: string;
				fullName: string | null;
				upperName: string | null;
			},
			User
		>
	>();

	Expect<
		Equal<
			{
				email: string;
				id?: number | undefined;
				firstName?: string | null | undefined;
				lastName?: string | null | undefined;
			},
			NewUser
		>
	>();
}

{
	type User = InferSelectModel<typeof users>;
	type NewUser = InferInsertModel<typeof users>;

	Expect<
		Equal<
			{
				id: number;
				firstName: string | null;
				lastName: string | null;
				email: string;
				fullName: string | null;
				upperName: string | null;
			},
			User
		>
	>();

	Expect<
		Equal<
			{
				email: string;
				id?: number | undefined;
				firstName?: string | null | undefined;
				lastName?: string | null | undefined;
			},
			NewUser
		>
	>();
}

{
	const dbUsers = await db.select().from(users);

	Expect<
		Equal<
			{
				id: number;
				firstName: string | null;
				lastName: string | null;
				email: string;
				fullName: string | null;
				upperName: string | null;
			}[],
			typeof dbUsers
		>
	>();
}

{
	const db = drizzle({} as any, { schema: { users }, mode: 'default' });

	const dbUser = await db.query.users.findFirst();

	Expect<
		Equal<
			{
				id: number;
				firstName: string | null;
				lastName: string | null;
				email: string;
				fullName: string | null;
				upperName: string | null;
			} | undefined,
			typeof dbUser
		>
	>();
}

{
	const db = drizzle({} as any, { schema: { users }, mode: 'default' });

	const dbUser = await db.query.users.findMany();

	Expect<
		Equal<
			{
				id: number;
				firstName: string | null;
				lastName: string | null;
				email: string;
				fullName: string | null;
				upperName: string | null;
			}[],
			typeof dbUser
		>
	>();
}

{
	// @ts-expect-error - Can't use the fullName because it's a generated column
	await db.insert(users).values({
		firstName: 'test',
		lastName: 'test',
		email: 'test',
		fullName: 'test',
	});
}

{
	await db.update(users).set({
		firstName: 'test',
		lastName: 'test',
		email: 'test',
		// @ts-expect-error - Can't use the fullName because it's a generated column
		fullName: 'test',
	});
}
