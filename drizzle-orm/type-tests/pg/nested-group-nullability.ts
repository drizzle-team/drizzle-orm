import { Expect } from 'type-tests/utils.ts';
import { integer, pgTable, pgView, serial, text } from '~/pg-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import type { Equal } from '~/utils.ts';
import { db } from './db.ts';

const cities = pgTable('cities_ngn', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	state: text('state'),
	zip: text('zip'),
});
const users = pgTable('users_ngn', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	bio: text('bio'),
	cityId: integer('city_id'),
});
const owners = pgTable('owners_ngn', { id: serial('id').primaryKey(), deskId: integer('desk_id') });
const desks = pgTable('desks_ngn', { id: serial('id').primaryKey(), label: text('label'), floor: text('floor') });
const tickets = pgTable('tickets_ngn', { id: serial('id').primaryKey(), ownerId: integer('owner_id') });

const crewSub = db.select().from(owners).innerJoin(desks, eq(owners.deskId, desks.id)).as('crew');
const crewView = pgView('crew_ngn_v').as((qb) =>
	qb.select().from(owners).innerJoin(desks, eq(owners.deskId, desks.id))
);

type Group<Q, K extends string> = Awaited<Q> extends readonly (infer R)[] ? (K extends keyof R ? R[K] : never)
	: never;

// E1 — all columns from the (not-null) from-table -> NOT folded
const e1 = db.select({ id: users.id, meta: { bio: users.bio, city: users.name } }).from(users);
Expect<Equal<Group<typeof e1, 'meta'>, { bio: string | null; city: string }>>();

// E2a — mixed sources (users + left-joined cities), non-null column first -> NOT folded
const e2a = db.select({ id: users.id, g: { user: users.name, cityId: cities.id } }).from(users)
	.leftJoin(cities, eq(users.cityId, cities.id));
Expect<Equal<Group<typeof e2a, 'g'>, { user: string; cityId: number | null }>>();

// E2b — mixed sources, nullable column first -> NOT folded
const e2b = db.select({ id: users.id, g: { bio: users.bio, cityId: cities.id } }).from(users)
	.leftJoin(cities, eq(users.cityId, cities.id));
Expect<Equal<Group<typeof e2b, 'g'>, { bio: string | null; cityId: number | null }>>();

// E3 — only SQL fields, no table to bind to -> NOT folded
const e3 = db.select({ id: users.id, calc: { u: sql`1`, c: sql`2` } }).from(users)
	.leftJoin(cities, eq(users.cityId, cities.id));
Expect<Equal<Group<typeof e3, 'calc'>, { u: unknown; c: unknown }>>();

// E4 — all columns from a single left-joined table -> folded
const e4 = db.select({ n: users.name, c: { state: cities.state, zip: cities.zip } }).from(users)
	.leftJoin(cities, eq(users.cityId, cities.id));
Expect<Equal<Group<typeof e4, 'c'>, { state: string | null; zip: string | null } | null>>();

// E5 — nullable-join column + a non-null SQL field -> still folded (the join column drives it)
const e5 = db.select({ n: users.name, c: { state: cities.state, up: sql<number>`3` } }).from(users)
	.leftJoin(cities, eq(users.cityId, cities.id));
Expect<Equal<Group<typeof e5, 'c'>, { state: string | null; up: number } | null>>();

// E7 — same shape as E4 but INNER-joined (not-null) -> NOT folded
const e7 = db.select({ n: users.name, c: { state: cities.state, zip: cities.zip } }).from(users)
	.innerJoin(cities, eq(users.cityId, cities.id));
Expect<Equal<Group<typeof e7, 'c'>, { state: string | null; zip: string | null }>>();

// E8 — group projected from a left-joined subquery (columns report the nullable alias) -> folded
const e8 = db.select({ t: tickets.id, desk: { label: crewSub.desks_ngn.label, floor: crewSub.desks_ngn.floor } })
	.from(tickets).leftJoin(crewSub, eq(crewSub.owners_ngn.id, tickets.ownerId));
Expect<Equal<Group<typeof e8, 'desk'>, { label: string | null; floor: string | null } | null>>();

// E9 — same, projected from a left-joined view -> folded
const e9 = db.select({ t: tickets.id, desk: { label: crewView.desks_ngn.label, floor: crewView.desks_ngn.floor } })
	.from(tickets).leftJoin(crewView, eq(crewView.owners_ngn.id, tickets.ownerId));
Expect<Equal<Group<typeof e9, 'desk'>, { label: string | null; floor: string | null } | null>>();
