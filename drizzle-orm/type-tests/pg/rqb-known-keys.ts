import pg from 'pg';
import { Expect } from 'type-tests/utils.ts';
import { drizzle } from '~/node-postgres/index.ts';
import { integer, jsonb, pgTable, text } from '~/pg-core/index.ts';
import { defineRelations } from '~/relations.ts';
import type { Equal } from '~/utils.ts';

// https://github.com/drizzle-team/drizzle-orm/issues/5644
// https://github.com/drizzle-team/drizzle-orm/issues/6383

const users = pgTable('users', { id: integer().primaryKey(), name: text().notNull() });
const posts = pgTable('posts', {
	id: integer().primaryKey(),
	authorId: integer().notNull(),
	title: text(),
	meta: jsonb().$type<{ k: string }>(),
});
const tags = pgTable('tags', { id: integer().primaryKey(), label: text() });
const relations = defineRelations({ users, posts, tags }, (r) => ({
	users: { posts: r.many.posts() },
	posts: { author: r.one.users({ from: r.posts.authorId, to: r.users.id }) },
}));
const db = drizzle({ client: new pg.Client(), relations });

// Valid configs: inferred result types must not be affected by the known keys checks
{
	const res = await db.query.users.findMany({
		columns: { id: true },
		where: { name: 'x' },
		with: { posts: { columns: { title: true }, where: { id: 1 }, with: { author: true } } },
		orderBy: { id: 'asc' },
		limit: 1,
	});
	Expect<
		Equal<typeof res, {
			id: number;
			posts: { title: string | null; author: { id: number; name: string } | null }[];
		}[]>
	>;
	const one = await db.query.posts.findFirst({ with: { author: { columns: { name: true } } } });
	Expect<
		Equal<
			typeof one,
			{
				id: number;
				authorId: number;
				title: string | null;
				meta: { k: string } | null;
				author: { name: string } | null;
			} | undefined
		>
	>;
	await db.query.users.findMany({ where: { OR: [{ id: 1 }, { name: 'a' }], posts: { title: 'x' } } });
	await db.query.users.findMany({ with: { posts: true }, orderBy: (t, { asc }) => asc(t.id) });
	await db.query.users.findMany({
		where: {
			AND: [{ id: 1 }, { name: { like: 'a%' } }],
			OR: [{ posts: { title: 'x' } }, { posts: true }],
			NOT: { id: { gt: 5 } },
			RAW: (t, { sql }) => sql`${t.id} = 1`,
		},
		with: { posts: { where: { author: { name: 'x' } }, orderBy: { id: 'desc' } } },
	});
	await db.query.tags.findMany({
		where: { label: 'x', OR: [{ id: 1 }], NOT: { label: 'y' } },
		orderBy: { label: 'asc' },
	});
}

// Unknown keys are rejected at every level of the config
await db.query.users.findMany({
	// @ts-expect-error
	unknownTop: 1,
});
await db.query.users.findMany({
	columns: {
		id: true,
		// @ts-expect-error
		unknown: true,
	},
});
await db.query.users.findMany({
	where: {
		name: 'x',
		// @ts-expect-error
		unknown: 'value',
	},
});
await db.query.users.findMany({
	with: {
		posts: true,
		// @ts-expect-error
		unknown: true,
	},
});
await db.query.users.findMany({
	with: {
		posts: {
			columns: {
				title: true,
				// @ts-expect-error
				unknown: true,
			},
		},
	},
});
await db.query.users.findMany({
	with: {
		posts: {
			where: {
				id: 1,
				// @ts-expect-error
				unknown: 1,
			},
			with: {
				author: {
					columns: {
						id: true,
						// @ts-expect-error
						unknown: true,
					},
				},
			},
		},
	},
});
await db.query.users.findMany({
	with: {
		posts: {
			// @ts-expect-error - `comment` only exists on the top-level config
			comment: 'x',
		},
	},
});
await db.query.users.findFirst({
	// @ts-expect-error - no `limit` on findFirst
	limit: 1,
});

// Invalid values under known keys
await db.query.users.findMany({
	columns: {
		// @ts-expect-error
		id: 'INVALID VALUE',
	},
});
await db.query.users.findMany({
	orderBy: {
		// @ts-expect-error
		id: 'INVALID VALUE',
	},
});

// `orderBy`
await db.query.users.findMany({
	orderBy: {
		id: 'asc',
		// @ts-expect-error
		unknown: 'asc',
	},
});
await db.query.users.findMany({
	with: {
		posts: {
			orderBy: {
				id: 'asc',
				// @ts-expect-error
				unknown: 'desc',
			},
		},
	},
});

// Relation filters
await db.query.users.findMany({
	where: {
		posts: {
			title: 'x',
			// @ts-expect-error
			unknown: 1,
		},
	},
});
await db.query.users.findMany({
	with: {
		posts: {
			where: {
				author: {
					name: 'x',
					// @ts-expect-error
					unknown: 1,
				},
			},
		},
	},
});

// `AND` / `OR` / `NOT`
await db.query.users.findMany({
	where: {
		AND: [{ id: 1 }, {
			// @ts-expect-error
			unknown: 1,
		}],
	},
});
await db.query.users.findMany({
	where: {
		OR: [{ id: 1 }, {
			posts: {
				// @ts-expect-error
				unknown: 1,
			},
		}],
	},
});
await db.query.users.findMany({
	where: {
		NOT: {
			id: 1,
			// @ts-expect-error
			unknown: 1,
		},
	},
});

// Tables without relations
await db.query.tags.findMany({
	where: {
		label: 'x',
		// @ts-expect-error
		unknown: 1,
	},
});
await db.query.tags.findMany({
	where: {
		OR: [{ id: 1 }, {
			// @ts-expect-error
			unknown: 1,
		}],
	},
});
await db.query.tags.findMany({
	orderBy: {
		id: 'asc',
		// @ts-expect-error
		unknown: 'asc',
	},
});

// Column filter operators
await db.query.users.findMany({
	where: {
		id: {
			eq: 1,
			// @ts-expect-error
			unknownOp: 1,
		},
	},
});
await db.query.users.findMany({
	where: {
		posts: {
			title: {
				// @ts-expect-error
				unknownOp: 'x',
			},
		},
	},
});
await db.query.users.findMany({
	where: {
		id: {
			NOT: {
				eq: 1,
				// @ts-expect-error
				unknownOp: 1,
			},
		},
	},
});
await db.query.users.findMany({
	where: {
		id: {
			OR: [1, {
				gt: 1,
				// @ts-expect-error
				unknownOp: 1,
			}],
		},
	},
});
await db.query.users.findMany({
	where: {
		AND: [{
			name: {
				// @ts-expect-error
				unknownOp: 'x',
			},
		}],
	},
});
await db.query.tags.findMany({
	where: {
		label: {
			// @ts-expect-error
			unknownOp: 'x',
		},
	},
});

// `comment` values are still validated
await db.query.users.findMany({ comment: 'x' });
await db.query.users.findMany({ comment: { key: 'value' } });
await db.query.users.findFirst({
	// @ts-expect-error
	comment: 1,
});
await db.query.users.findMany({
	// @ts-expect-error
	comment: true,
});
await db.query.users.findMany({
	// @ts-expect-error
	limit: 'x',
});
