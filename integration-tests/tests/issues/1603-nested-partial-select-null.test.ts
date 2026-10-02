/**
 * Issue drizzle-team/drizzle-orm#1603 — minimal reproduction
 * BUG: Nested Partial Select returns null for the WHOLE nested object on left
 * join if the FIRST selected column of that (nullable) table is null, even
 * when other columns of the same table have non-null values.
 *
 * Root cause (drizzle-orm/src/utils.ts, mapResultRow):
 *   nullifyMap[objectName] is set from the FIRST column encountered for a
 *   path prefix of length 2. If that first value is null, the map stores the
 *   table name and — because joinsNotNullableMap[tableName] is false for a
 *   left-joined table — the entire nested object gets overwritten with null,
 *   discarding other non-null column values of the same row.
 *
 * Expected: each column nullifies independently; the nested object only
 * becomes null when ALL of its columns are null (or the join row is absent —
 * every column null, which the fix handles identically).
 *
 * NOTE: mapResultRow/orderSelectedFields are `@internal` in drizzle-orm and
 * stripped from the public .d.ts (stripInternal: true), so we resolve them at
 * runtime and keep the call sites untyped.
 */

import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { integer, pgTable, QueryBuilder, text } from 'drizzle-orm/pg-core';
import type { Column } from 'drizzle-orm';

const users = pgTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const profiles = pgTable('profiles', {
	id: integer('id').primaryKey(),
	// nullable column selected FIRST in the partial select
	avatar: text('avatar'),
	bio: text('bio'),
	userId: integer('user_id').references(() => users.id),
});

describe('issue #1603: nested partial select + left join null', () => {
	it('does not nullify whole nested object when first column is null but others are not', async () => {
		const orm = (await import('drizzle-orm')) as unknown as {
			mapResultRow: (
				columns: { path: string[]; field: Column }[],
				row: unknown[],
				joinsNotNullableMap: Record<string, boolean> | undefined,
			) => Record<string, unknown>;
			orderSelectedFields: (fields: Record<string, unknown>) => { path: string[]; field: Column }[];
		};

		const qb = new QueryBuilder();
		const query = qb
			.select({
				user: { id: users.id, name: users.name },
				profile: {
					avatar: profiles.avatar, // <-- first profile column, null in row
					bio: profiles.bio, // <-- non-null in row
				},
			})
			.from(users)
			.leftJoin(profiles, eq(profiles.userId, users.id));

		// Row: user present, profile joined but avatar=null, bio='hello'
		const rawRow = [1, 'sam', null, 'hello'];
		const internals = query as unknown as {
			getSelectedFields: () => Record<string, unknown>;
			joinsNotNullableMap: Record<string, boolean>;
		};
		const columns = orm.orderSelectedFields(internals.getSelectedFields());
		const mapped = orm.mapResultRow(columns, rawRow, internals.joinsNotNullableMap);

		expect(mapped).toStrictEqual({
			user: { id: 1, name: 'sam' },
			profile: { avatar: null, bio: 'hello' }, // BUG currently returns profile: null
		});
	});
});
