import { expect, test } from 'vitest';
import { refineCodecs } from '~/codecs';
import { getMaterializedViewConfig, getViewConfig, pgMaterializedView, pgTable, pgView } from '~/pg-core';
import { castToText } from '~/pg-core/codecs';
import { drizzle, pgliteCodecs } from '~/pglite';
import { gte, sql } from '~/sql';

const db = drizzle('memory://', {
	codecs: refineCodecs(pgliteCodecs, {
		date: {
			cast: castToText,
			castParam: (p) => `${p}::date`,
		},
		timestamp: {
			cast: castToText,
			castParam: (p) => `${p}::timestamp`,
		},
	}),
});

const t1 = pgTable('t1', (t) => ({
	id: t.serial('id').primaryKey(),
	date: t.date('date', { mode: 'date' }).notNull(),
}));

const t2 = pgTable('t2', (t) => ({
	id: t.serial('id').primaryKey(),
	timestamp: t.timestamp('timestamp', { mode: 'date' }).notNull(),
}));

test('view selection', () => {
	const v1 = pgView('v1').as(
		db.select({
			id: t1.id.as('id1'),
			date: t1.date.as('d1'),
			jId: t2.id.as('id2'),
			ts: t2.timestamp.as('d2'),
		}).from(t1).crossJoin(t2).where(gte(t1.date, new Date(0))),
	);

	const v2 = pgView('v1').as((qb) =>
		qb.select({
			id: t1.id.as('id1'),
			date: t1.date.as('d1'),
			jId: t2.id.as('id2'),
			ts: t2.timestamp.as('d2'),
		}).from(t1).crossJoin(t2).where(gte(t1.date, new Date(0)))
	);

	expect(db.dialect.sqlToQuery(getViewConfig(v1).query).sql).toStrictEqual(
		`select "t1"."id" as "id1", "t1"."date" as "d1", "t2"."id" as "id2", "t2"."timestamp" as "d2" from "t1" cross join "t2" where "t1"."date" >= '1970-01-01T00:00:00.000Z'`,
	);
	expect(db.dialect.sqlToQuery(getViewConfig(v2).query).sql).toStrictEqual(
		`select "t1"."id" as "id1", "t1"."date" as "d1", "t2"."id" as "id2", "t2"."timestamp" as "d2" from "t1" cross join "t2" where "t1"."date" >= '1970-01-01T00:00:00.000Z'`,
	);
});

test('materialized view selection', () => {
	const v1 = pgMaterializedView('v1').as(
		db.select({
			id: t1.id.as('id1'),
			date: t1.date.as('d1'),
			jId: t2.id.as('id2'),
			ts: t2.timestamp.as('d2'),
		}).from(t1).crossJoin(t2).where(gte(t1.date, new Date(0))),
	);

	const v2 = pgMaterializedView('v1').as((qb) =>
		qb.select({
			id: t1.id.as('id1'),
			date: t1.date.as('d1'),
			jId: t2.id.as('id2'),
			ts: t2.timestamp.as('d2'),
		}).from(t1).crossJoin(t2).where(gte(t1.date, new Date(0)))
	);

	expect(db.dialect.sqlToQuery(getMaterializedViewConfig(v1).query!).sql).toStrictEqual(
		`select "t1"."id" as "id1", "t1"."date" as "d1", "t2"."id" as "id2", "t2"."timestamp" as "d2" from "t1" cross join "t2" where "t1"."date" >= '1970-01-01T00:00:00.000Z'`,
	);
	expect(db.dialect.sqlToQuery(getMaterializedViewConfig(v2).query!).sql).toStrictEqual(
		`select "t1"."id" as "id1", "t1"."date" as "d1", "t2"."id" as "id2", "t2"."timestamp" as "d2" from "t1" cross join "t2" where "t1"."date" >= '1970-01-01T00:00:00.000Z'`,
	);
});

test('insert from select', () => {
	const q1 = db.insert(t1).select((qb) => qb.select().from(t1)).returning();
	const q2 = db.insert(t1).select(db.select().from(t1)).returning();

	expect(db.dialect.sqlToQuery(q1.getSQL()).sql).toStrictEqual(
		`insert into "t1" ("id", "date") select "id", "date" from "t1" returning "id", "date"::text`,
	);
	expect(db.dialect.sqlToQuery(q2.getSQL()).sql).toStrictEqual(
		`insert into "t1" ("id", "date") select "id", "date" from "t1" returning "id", "date"::text`,
	);
});

test('update from subquery', () => {
	const sq = db.select().from(t1).limit(1).as('sq');

	const q1 = db.update(t1).set({
		id: sq.id,
		date: sq.date,
	}).where(gte(t1.date, new Date(0))).from(sq).returning();

	expect(db.dialect.sqlToQuery(q1.getSQL()).sql).toStrictEqual(
		`update "t1" set "id" = "sq"."id", "date" = "sq"."date" from (select "id", "date" from "t1" limit $1) "sq" where "t1"."date" >= $2::date returning "t1"."id", "t1"."date"::text, "sq"."id", "sq"."date"::text`,
	);
});

test('$with select', () => {
	const w1 = db.$with('w1').as(
		db.select({
			id: t1.id.as('id1'),
			date: t1.date.as('d1'),
			jId: t2.id.as('id2'),
			ts: t2.timestamp.as('d2'),
		}).from(t1).crossJoin(t2).where(gte(t1.date, new Date(0))),
	);

	const w2 = db.$with('w1').as((qb) =>
		qb.select({
			id: t1.id.as('id1'),
			date: t1.date.as('d1'),
			jId: t2.id.as('id2'),
			ts: t2.timestamp.as('d2'),
		}).from(t1).crossJoin(t2).where(gte(t1.date, new Date(0)))
	);

	const s1 = db.with(w1).select().from(w1);
	const s2 = db.with(w2).select().from(w2);

	expect(db.dialect.sqlToQuery(s1.getSQL()).sql).toStrictEqual(
		`with "w1" as (select "t1"."id" as "id1", "t1"."date" as "d1", "t2"."id" as "id2", "t2"."timestamp" as "d2" from "t1" cross join "t2" where "t1"."date" >= $1::date) select "id1", "d1"::text, "id2", "d2"::text from "w1"`,
	);
	expect(db.dialect.sqlToQuery(s2.getSQL()).sql).toStrictEqual(
		`with "w1" as (select "t1"."id" as "id1", "t1"."date" as "d1", "t2"."id" as "id2", "t2"."timestamp" as "d2" from "t1" cross join "t2" where "t1"."date" >= $1::date) select "id1", "d1"::text, "id2", "d2"::text from "w1"`,
	);
});

test('$with insert returning', () => {
	const w1 = db.$with('w1').as(
		db.insert(t1).values({
			id: 1,
			date: new Date(0),
		}).returning(),
	);

	const s1 = db.with(w1).select().from(w1);

	expect(db.dialect.sqlToQuery(s1.getSQL()).sql).toStrictEqual(
		`with "w1" as (insert into "t1" ("id", "date") values ($1, $2::date) returning "id", "date") select "id", "date"::text from "w1"`,
	);
});

test('$with update returning', () => {
	const w1 = db.$with('w1').as(
		db.update(t1).set({
			id: 1,
			date: new Date(0),
		}).where(gte(t1.date, new Date(0))).returning(),
	);

	const s1 = db.with(w1).select().from(w1);

	expect(db.dialect.sqlToQuery(s1.getSQL()).sql).toStrictEqual(
		`with "w1" as (update "t1" set "id" = $1, "date" = $2::date where "t1"."date" >= $3::date returning "id", "date") select "id", "date"::text from "w1"`,
	);
});

test('$with delete returning', () => {
	const w1 = db.$with('w1').as(
		db.delete(t1).where(gte(t1.date, new Date(0))).returning(),
	);

	const s1 = db.with(w1).select().from(w1);

	expect(db.dialect.sqlToQuery(s1.getSQL()).sql).toStrictEqual(
		`with "w1" as (delete from "t1" where "t1"."date" >= $1::date returning "id", "date") select "id", "date"::text from "w1"`,
	);
});

test('$with nested', () => {
	const w1 = db.$with('w1').as(
		(qb) => {
			const wn = db.$with('wn').as((qb) =>
				qb.select({
					id: t1.id.as('id1'),
					date: t1.date.as('d1'),
					jId: t2.id.as('id2'),
					ts: t2.timestamp.as('d2'),
				}).from(t1).crossJoin(t2).where(gte(t1.date, new Date(0)))
			);

			return qb.with(wn).select().from(wn);
		},
	);

	const w2 = db.$with('w1').as(
		(qb) => {
			const wn = db.$with('wn').as(
				db.select({
					id: t1.id.as('id1'),
					date: t1.date.as('d1'),
					jId: t2.id.as('id2'),
					ts: t2.timestamp.as('d2'),
				}).from(t1).crossJoin(t2).where(gte(t1.date, new Date(0))),
			);

			return qb.with(wn).select().from(wn);
		},
	);

	const s1 = db.with(w1).select().from(w1);
	const s2 = db.with(w2).select().from(w2);

	expect(db.dialect.sqlToQuery(s1.getSQL()).sql).toStrictEqual(
		`with "w1" as (with "wn" as (select "t1"."id" as "id1", "t1"."date" as "d1", "t2"."id" as "id2", "t2"."timestamp" as "d2" from "t1" cross join "t2" where "t1"."date" >= $1::date) select "id1", "d1", "id2", "d2" from "wn") select "id1", "d1"::text, "id2", "d2"::text from "w1"`,
	);
	expect(db.dialect.sqlToQuery(s2.getSQL()).sql).toStrictEqual(
		`with "w1" as (with "wn" as (select "t1"."id" as "id1", "t1"."date" as "d1", "t2"."id" as "id2", "t2"."timestamp" as "d2" from "t1" cross join "t2" where "t1"."date" >= $1::date) select "id1", "d1", "id2", "d2" from "wn") select "id1", "d1"::text, "id2", "d2"::text from "w1"`,
	);
});
