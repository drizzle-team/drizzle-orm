import { type Equal, Expect } from 'type-tests/utils';
import { cockroachTable, int4, text, varchar } from '~/cockroach-core';
import { type InferInsertModel, type InferSelectModel, sql } from '~/index';
import { drizzle } from '~/node-postgres';
import { db } from './db';

const users = cockroachTable(
	'users',
	{
		id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
		firstName: varchar('first_name', { length: 255 }),
		lastName: varchar('last_name', { length: 255 }),
		email: text('email').notNull(),
		fullName: text('full_name').generatedAlwaysAs(sql`concat_ws(first_name, ' ', last_name)`).notNull(),
		upperName: text('upper_name').generatedAlwaysAs(
			sql` case when first_name is null then null else upper(first_name) end `,
		),
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
				fullName: string;
				upperName: string | null;
			},
			User
		>
	>();

	Expect<
		Equal<
			{
				email: string;
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
				fullName: string;
				upperName: string | null;
			},
			User
		>
	>();

	Expect<
		Equal<
			{
				email: string;
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
				fullName: string;
				upperName: string | null;
			}[],
			typeof dbUsers
		>
	>();
}

{
	const db = drizzle({} as any, { schema: { users } });

	const dbUser = await db._query.users.findFirst();

	Expect<
		Equal<
			{
				id: number;
				firstName: string | null;
				lastName: string | null;
				email: string;
				fullName: string;
				upperName: string | null;
			} | undefined,
			typeof dbUser
		>
	>();
}

{
	const db = drizzle({} as any, { schema: { users } });

	const dbUser = await db._query.users.findMany();

	Expect<
		Equal<
			{
				id: number;
				firstName: string | null;
				lastName: string | null;
				email: string;
				fullName: string;
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

const users2 = cockroachTable(
	'users',
	{
		id: int4('id').generatedByDefaultAsIdentity(),
		id2: int4('id').generatedAlwaysAsIdentity(),
	},
);

{
	type User = typeof users2.$inferSelect;
	type NewUser = typeof users2.$inferInsert;

	Expect<
		Equal<
			{
				id: number;
				id2: number;
			},
			User
		>
	>();

	Expect<
		Equal<
			{
				id?: number | undefined;
			},
			NewUser
		>
	>();
}

const usersSeq = cockroachTable(
	'users',
	{
		id: int4('id').generatedByDefaultAsIdentity(),
		id2: int4('id').generatedAlwaysAsIdentity(),
	},
);

{
	type User = typeof usersSeq.$inferSelect;
	type NewUser = typeof usersSeq.$inferInsert;

	Expect<
		Equal<
			{
				id: number;
				id2: number;
			},
			User
		>
	>();

	Expect<
		Equal<
			{
				id?: number | undefined;
			},
			NewUser
		>
	>();
}
