import { assert, expect, expectTypeOf, it, Vitest } from '@effect/vitest';
import {
	asc,
	count,
	desc,
	eq,
	getColumns,
	getTableColumns,
	getTableName,
	gt,
	gte,
	inArray,
	lt,
	makeDefaultQueryMapper,
	makeDefaultRqbMapper,
	makeJitQueryMapper,
	makeJitRqbMapper,
	sql,
} from 'drizzle-orm';
import { EffectLogger, type EffectLoggerShape, QueryEffectHKTBase } from 'drizzle-orm/effect-core';
import {
	alias,
	bigint,
	boolean,
	char,
	customType,
	date,
	datetime,
	decimal,
	except,
	getViewConfig,
	int,
	json,
	MySqlDialect,
	mysqlSchema,
	mysqlTable,
	mysqlView,
	primaryKey,
	serial,
	text,
	time,
	timestamp,
	union,
	unionAll,
	year,
} from 'drizzle-orm/mysql-core';
import type { MySqlEffectDatabase } from 'drizzle-orm/mysql-core/effect/db';
import { MySqlEffectSession } from 'drizzle-orm/mysql-core/effect/session';
import {
	AnyRelations,
	EmptyRelations,
	ExtractTablesFromSchema,
	ExtractTablesWithRelations,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
} from 'drizzle-orm/relations';
import { ConfigError } from 'effect/Config';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import { SqlClient } from 'effect/sql/SqlClient';
import { SqlError } from 'effect/sql/SqlError';
import { jsonRows, parseStoredJson } from '~/json-values';
import { expectRecentTime } from '~/recent-time';
import {
	type AllTypes,
	allTypesData,
	allTypesTable,
	assertAllTypesBounds,
	assertAllTypesTemporalBounds,
	assertAllTypesUnions,
	boundsRelations,
	boundsSchema,
	makeAllTypes,
} from './all-types';
import relations from './relations';
import { rqbPost, rqbUser } from './schema';
import { normalizeDataWithDbCodecs } from './utils';

export class DB extends Context.Service<DB, MySqlEffectDatabase<any, any, typeof relations>>()('CommonEffectMySqlDB') {}

let _diff!: (_: {}, schema: Record<string, unknown>, renames: []) => Promise<{ sqlStatements: string[] }>;
const getDiff = async () => {
	return _diff ??= (await import('../../../drizzle-kit/tests/mysql/mocks' as string)).diff;
};

export const push = (db: MySqlEffectDatabase<any, any, any>, schema: Record<string, any>) =>
	Effect.gen(function*() {
		const diff = yield* Effect.promise(() => getDiff());

		const { sqlStatements: deleteStatements } = yield* Effect.promise(() => diff(schema, {}, []));
		const { sqlStatements: createStatements } = yield* Effect.promise(() => diff({}, schema, []));

		yield* db.execute('SET FOREIGN_KEY_CHECKS = 0;');

		for (const s of deleteStatements) {
			if (s.startsWith('DROP')) {
				const exists = s.replace('`', 'IF EXISTS `');

				yield* db.execute(exists.includes('CASCADE') ? exists : exists.replace(';', ' CASCADE;'));
			}
		}
		for (const s of createStatements) {
			yield* db.execute(s);
		}

		yield* db.execute('SET FOREIGN_KEY_CHECKS = 1;');
	});

const dnStaff = mysqlTable('dn_staff', (t) => ({ userId: t.int('user_id').primaryKey() }));
const dnPeople = mysqlTable('dn_people', (t) => ({
	id: t.int('id').primaryKey(),
	name: t.text('name').notNull(),
	nick: t.text('nick'),
}));
const dnTicket = mysqlTable('dn_ticket', (t) => ({
	id: t.serial('id').primaryKey(),
	staffId: t.int('staff_id'),
}));
const dnVStaff = mysqlTable('dn_vstaff', (t) => ({
	id: t.int('id').primaryKey(),
	deptId: t.int('dept_id'),
}));
const dnDept = mysqlTable('dn_dept', (t) => ({
	id: t.int('id').primaryKey(),
	name: t.text('name').notNull(),
}));
const dnEmp = mysqlTable('dn_emp', (t) => ({
	id: t.serial('id').primaryKey(),
	staffId: t.int('staff_id'),
}));
const dnStaffView = mysqlView('dn_staff_view').as((qb) =>
	qb
		.select({
			staffId: dnVStaff.id.as('staff_id'),
			dept: { id: dnDept.id.as('dept_id'), name: dnDept.name.as('dept_name') },
		})
		.from(dnVStaff)
		.leftJoin(dnDept, eq(dnVStaff.deptId, dnDept.id))
);

const dnTables = { dnStaff, dnPeople, dnTicket, dnVStaff, dnDept, dnEmp };
const dnPushSchema = { ...dnTables, dnStaffView };

const resetDeepNullification = (db: MySqlEffectDatabase<any, any, any>) =>
	Effect.gen(function*() {
		yield* db.execute(sql`DROP VIEW IF EXISTS ${dnStaffView}`);
		for (const t of Object.values(dnTables)) yield* db.execute(sql`DROP TABLE IF EXISTS ${t}`);
	});

const runDeepNullification = (db: MySqlEffectDatabase<any, any, any>) =>
	Effect.gen(function*() {
		yield* db.insert(dnStaff).values([{ userId: 1 }, { userId: 2 }]);
		yield* db.insert(dnPeople).values([{ id: 1, name: 'Ann', nick: null }, { id: 2, name: 'Bob', nick: 'b' }]);
		yield* db.insert(dnTicket).values([{ staffId: 1 }, { staffId: 2 }, { staffId: 3 }]); // #3 -> outer miss
		yield* db.insert(dnVStaff).values([{ id: 1, deptId: 1 }, { id: 2, deptId: 1 }]);
		yield* db.insert(dnDept).values([{ id: 1, name: 'Eng' }]);
		yield* db.insert(dnEmp).values([{ staffId: 1 }, { staffId: 2 }, { staffId: 3 }]); // #3 -> outer view miss

		const crew = db.select().from(dnStaff).leftJoin(dnPeople, eq(dnStaff.userId, dnPeople.id)).as('crew');

		const sqJoin = yield* db
			.select()
			.from(dnTicket)
			.leftJoin(crew, eq(crew.dn_staff.userId, dnTicket.staffId))
			.orderBy(dnTicket.id);
		expect(sqJoin).toStrictEqual([
			{
				dn_ticket: { id: 1, staffId: 1 },
				crew: { dn_staff: { userId: 1 }, dn_people: { id: 1, name: 'Ann', nick: null } },
			},
			{
				dn_ticket: { id: 2, staffId: 2 },
				crew: { dn_staff: { userId: 2 }, dn_people: { id: 2, name: 'Bob', nick: 'b' } },
			},
			{ dn_ticket: { id: 3, staffId: 3 }, crew: null },
		]);

		const viewJoin = yield* db
			.select()
			.from(dnEmp)
			.leftJoin(dnStaffView, eq(dnStaffView.staffId, dnEmp.staffId))
			.orderBy(dnEmp.id);
		expect(viewJoin).toStrictEqual([
			{ dn_emp: { id: 1, staffId: 1 }, dn_staff_view: { staffId: 1, dept: { id: 1, name: 'Eng' } } },
			{ dn_emp: { id: 2, staffId: 2 }, dn_staff_view: { staffId: 2, dept: { id: 1, name: 'Eng' } } },
			{ dn_emp: { id: 3, staffId: 3 }, dn_staff_view: null },
		]);

		const crewInner = db.select().from(dnStaff).innerJoin(dnPeople, eq(dnStaff.userId, dnPeople.id)).as('crew_inner');
		const innerFold = yield* db
			.select({
				ticketId: dnTicket.id,
				person: { id: crewInner.dn_people.id, name: crewInner.dn_people.name, nick: crewInner.dn_people.nick },
			})
			.from(dnTicket)
			.leftJoin(crewInner, eq(crewInner.dn_staff.userId, dnTicket.staffId))
			.orderBy(dnTicket.id);
		expect(innerFold).toStrictEqual([
			{ ticketId: 1, person: { id: 1, name: 'Ann', nick: null } },
			{ ticketId: 2, person: { id: 2, name: 'Bob', nick: 'b' } },
			{ ticketId: 3, person: null },
		]);
	});

export interface RunCommonEffectMySqlTestsOptions {
	testLayer: Layer.Layer<DB | SqlClient, SqlError | ConfigError, never>;
	MySqlDrizzle: {
		// Methods: parameters checked bivariantly, so drivers requiring config (`effect-d1`) fit
		make<TRelations extends AnyRelations = EmptyRelations>(
			config?: { relations?: TRelations } & Record<string, any>,
		): Effect.Effect<MySqlEffectDatabase<QueryEffectHKTBase, any, TRelations>, never, any>;
		makeWithDefaults<TRelations extends AnyRelations = EmptyRelations>(
			config?: { relations?: TRelations } & Record<string, any>,
		): Effect.Effect<MySqlEffectDatabase<QueryEffectHKTBase, any, TRelations>, never, any>;
		DefaultServices: Layer.Layer<any, never, any>;
	};
	createDB: <
		TSchema extends Record<string, any>,
		TConfig extends RelationsBuilderConfig<TTables>,
		TTables extends Schema = ExtractTablesFromSchema<TSchema>,
	>(
		schema: TSchema,
		relations: (helpers: RelationsBuilder<TTables>) => TConfig,
		useJitMappers?: boolean,
	) => Effect.Effect<
		MySqlEffectDatabase<QueryEffectHKTBase, any, ExtractTablesWithRelations<TConfig, TTables>>,
		never,
		any
	>;
	skipTests?: string[];
	addTests?: (it: Vitest.MethodsNonLive<DB | SqlClient>) => void;
}

export const runCommonEffectMySqlTests = (opts: RunCommonEffectMySqlTestsOptions): void => {
	const { testLayer, MySqlDrizzle, createDB, addTests, skipTests = [] } = opts;

	it.layer(testLayer)('common', (it) => {
		it.beforeEach(({ task, skip }) => {
			if (skipTests.includes(task.name)) skip();
		});

		it.effect('execute', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const res = yield* db.execute<{ '1': 1 }>(sql`SELECT 1 as "1"`);

				expect(res).toStrictEqual([{ '1': 1 }]);
			}));

		it.effect('all types', () =>
			Effect.gen(function*() {
				const table = makeAllTypes('all_types_48');

				const db = yield* DB;
				yield* push(db, { table });

				yield* db.insert(table).values(allTypesData);

				const rawRes = yield* db.select().from(table);

				expectTypeOf(rawRes).toEqualTypeOf<AllTypes[]>();
				expect(rawRes).toStrictEqual([allTypesData]);
			}));

		it.effect('all types ~codecs~', () =>
			Effect.gen(function*() {
				const db = yield* createDB({ allTypesTable, ...boundsSchema }, (r) => ({
					allTypesTable: {
						self: r.many.allTypesTable({
							from: r.allTypesTable.serial,
							to: r.allTypesTable.serial,
						}),
					},
					...boundsRelations(r),
				}));
				yield* push(db, { allTypesTable });

				yield* db.insert(allTypesTable).values(allTypesData);

				const session = (<any> db).session as MySqlEffectSession;

				const queryRaw = yield* session.objects<AllTypes>(
					db.select(
						Object.fromEntries(
							Object.entries(getTableColumns(allTypesTable)).map(([k, v]) => [k, v.as(v.name)]),
						),
					).from(allTypesTable).getSQL(),
				);
				const queryRes = normalizeDataWithDbCodecs({
					db,
					columns: getColumns(allTypesTable),
					data: queryRaw,
					mode: 'query',
				})[0];

				const relationRaw = yield* session.objects<AllTypes & { self: AllTypes[] }>(
					db.query.allTypesTable.findFirst({
						with: {
							self: true,
						},
					}).getSQL(),
				);
				const { self: relationSelf, ...rootRaw } = relationRaw[0]!;
				const relationRes = normalizeDataWithDbCodecs({
					db,
					columns: getColumns(allTypesTable),
					data: relationSelf,
					mode: 'json',
				})[0]!;
				const rootRes = normalizeDataWithDbCodecs({
					db,
					columns: getColumns(allTypesTable),
					data: [rootRaw],
					mode: 'query',
				})[0]!;

				expect(queryRes).toStrictEqual(allTypesData);
				expect(relationRes).toStrictEqual(allTypesData);
				expect(rootRes).toStrictEqual(allTypesData);

				const unionsContext = yield* Effect.context<never>();
				yield* Effect.promise(() =>
					assertAllTypesUnions(db as any, allTypesTable, (query) => Effect.runPromiseWith(unionsContext)(query))
				);

				const context = yield* Effect.context<never>();
				yield* Effect.promise(() =>
					assertAllTypesBounds(db as any, { run: (query) => Effect.runPromiseWith(context)(query), rqb: true })
				);
				yield* Effect.promise(() =>
					assertAllTypesTemporalBounds(db as any, { run: (query) => Effect.runPromiseWith(context)(query), rqb: true })
				);
			}));

		it.effect('all types ~json~', () =>
			Effect.gen(function*() {
				const table = mysqlTable('all_types_json', {
					id: int('id').primaryKey(),
					json: json('json'),
				});

				const db = yield* DB;
				yield* push(db, { table });

				const { input, output } = jsonRows(['json']);

				yield* db.insert(table).values(input);

				// json text as the database stores it, read without decoding
				const stored = yield* db.select({
					id: table.id,
					json: sql<string>`cast(${table.json} as char)`,
				}).from(table).orderBy(table.id);

				expect(yield* db.select().from(table).orderBy(table.id)).toStrictEqual(output);
				expect(parseStoredJson(stored)).toStrictEqual(output);
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/1442
		it.effect('date and time columns keep UTC values regardless of process timezone', () =>
			Effect.gen(function*() {
				const datesTable = mysqlTable('dates_tz_1', {
					id: int('id').primaryKey(),
					date: date('date').notNull(),
					dateStr: date('date_str', { mode: 'string' }).notNull(),
					datetime: datetime('datetime', { fsp: 3 }).notNull(),
					datetimeStr: datetime('datetime_str', { fsp: 3, mode: 'string' }).notNull(),
					timestamp: timestamp('timestamp', { fsp: 3 }).notNull(),
					timestampStr: timestamp('timestamp_str', { fsp: 3, mode: 'string' }).notNull(),
					time: time('time', { fsp: 3 }).notNull(),
					year: year('year').notNull(),
				});
				const db = yield* createDB({ datesTable }, (r) => ({
					datesTable: { self: r.many.datesTable({ from: r.datesTable.id, to: r.datesTable.id }) },
				}));

				yield* push(db, { datesTable });

				const startOfDay = new Date('2022-11-11T00:00:00.000Z');
				const endOfDay = new Date('2022-11-11T23:59:59.999Z');
				const rows = [{
					id: 1,
					date: new Date('2022-11-11'),
					dateStr: '2022-11-11',
					datetime: startOfDay,
					datetimeStr: '2022-11-11 00:00:00.000',
					timestamp: startOfDay,
					timestampStr: '2022-11-11 00:00:00.000',
					time: '00:00:00.000',
					year: 2022,
				}, {
					id: 2,
					date: new Date('2022-11-11'),
					dateStr: '2022-11-11',
					datetime: endOfDay,
					datetimeStr: '2022-11-11 23:59:59.999',
					timestamp: endOfDay,
					timestampStr: '2022-11-11 23:59:59.999',
					time: '23:59:59.999',
					year: 2022,
				}];

				const originalTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
				yield* Effect.gen(function*() {
					for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
						process.env['TZ'] = tz;

						yield* db.delete(datesTable);
						yield* db.insert(datesTable).values(rows.map((row) => ({ ...row, date: row.datetime })));

						const stored = yield* db.select({
							id: datesTable.id,
							date: sql<string>`cast(${datesTable.date} as char)`,
							datetime: sql<string>`cast(${datesTable.datetime} as char)`,
							timestamp: sql<string>`cast(${datesTable.timestamp} as char)`,
						}).from(datesTable).orderBy(datesTable.id);
						expect(stored, tz).toStrictEqual(
							rows.map((row) => ({
								id: row.id,
								date: row.dateStr,
								datetime: row.datetimeStr,
								timestamp: row.timestampStr,
							})),
						);

						expect(yield* db.select().from(datesTable).orderBy(datesTable.id), tz).toStrictEqual(rows);
						expect(yield* db.select().from(datesTable).where(eq(datesTable.date, endOfDay)).orderBy(datesTable.id), tz)
							.toStrictEqual(rows);
						expect(yield* db.select().from(datesTable).where(eq(datesTable.datetime, endOfDay)), tz).toStrictEqual([
							rows[1]!,
						]);
						expect(yield* db.select().from(datesTable).where(eq(datesTable.timestamp, startOfDay)), tz)
							.toStrictEqual([rows[0]!]);

						expect(yield* db.query.datesTable.findMany({ orderBy: { id: 'asc' }, with: { self: true } }), tz)
							.toStrictEqual(rows.map((row) => ({ ...row, self: [row] })));
					}
				}).pipe(Effect.ensuring(Effect.sync(() => {
					process.env['TZ'] = originalTz;
				})));
			}));

		it.effect('RQB v2 simple find first - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser });

				const result = yield* db.query.rqbUser.findFirst();

				expect(result).toStrictEqual(undefined);
			}));

		it.effect('RQB v2 simple find first - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.query.rqbUser.findFirst({
					orderBy: {
						id: 'desc',
					},
				});

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 simple find first - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}]);

				const result = yield* db.query.rqbUser.findFirst({
					with: {
						posts: {
							orderBy: {
								id: 'asc',
							},
						},
					},
					orderBy: {
						id: 'asc',
					},
				});

				expect(result).toStrictEqual({
					id: 1,
					createdAt: date,
					name: 'First',
					posts: [{
						id: 1,
						userId: 1,
						createdAt: date,
						content: null,
					}, {
						id: 2,
						userId: 1,
						createdAt: date,
						content: 'Has message this time',
					}],
				});
			}));

		it.effect('RQB v2 simple find first - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const query = db.query.rqbUser.findFirst({
					where: {
						id: {
							eq: sql.placeholder('filter'),
						},
					},
					orderBy: {
						id: 'asc',
					},
				}).prepare();

				const result = yield* query.execute({
					filter: 2,
				});

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 simple find many - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.query.rqbUser.findMany();

				expect(result).toStrictEqual([]);
			}));

		it.effect('RQB v2 simple find many - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.query.rqbUser.findMany({
					orderBy: {
						id: 'desc',
					},
				});

				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}, {
					id: 1,
					createdAt: date,
					name: 'First',
				}]);
			}));

		it.effect('RQB v2 simple find many - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser, rqbPost });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}]);

				const result = yield* db.query.rqbPost.findMany({
					with: {
						author: true,
					},
					orderBy: {
						id: 'asc',
					},
				});

				expect(result).toStrictEqual([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
					author: {
						id: 1,
						createdAt: date,
						name: 'First',
					},
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
					author: {
						id: 1,
						createdAt: date,
						name: 'First',
					},
				}]);
			}));

		it.effect('RQB v2 simple find many - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const query = db.query.rqbUser.findMany({
					where: {
						id: {
							eq: sql.placeholder('filter'),
						},
					},
					orderBy: {
						id: 'asc',
					},
				}).prepare();

				const result = yield* query.execute({
					filter: 2,
				});

				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);
			}));

		it.effect('RQB v2 transaction find first - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findFirst();

						expect(result).toStrictEqual(undefined);

						return result;
					})
				);

				expect(result).toStrictEqual(undefined);
			}));

		it.effect('RQB v2 transaction find first - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findFirst({
							orderBy: {
								id: 'desc',
							},
						});

						expect(result).toStrictEqual({
							id: 2,
							createdAt: date,
							name: 'Second',
						});

						return result;
					})
				);

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 transaction find first - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });
				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findFirst({
							with: {
								posts: {
									orderBy: {
										id: 'asc',
									},
								},
							},
							orderBy: {
								id: 'asc',
							},
						});

						expect(result).toStrictEqual({
							id: 1,
							createdAt: date,
							name: 'First',
							posts: [{
								id: 1,
								userId: 1,
								createdAt: date,
								content: null,
							}, {
								id: 2,
								userId: 1,
								createdAt: date,
								content: 'Has message this time',
							}],
						});

						return result;
					})
				);

				expect(result).toStrictEqual({
					id: 1,
					createdAt: date,
					name: 'First',
					posts: [{
						id: 1,
						userId: 1,
						createdAt: date,
						content: null,
					}, {
						id: 2,
						userId: 1,
						createdAt: date,
						content: 'Has message this time',
					}],
				});
			}));

		it.effect('RQB v2 transaction find first - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const query = db.query.rqbUser.findFirst({
							where: {
								id: {
									eq: sql.placeholder('filter'),
								},
							},
							orderBy: {
								id: 'asc',
							},
						}).prepare();

						const result = yield* query.execute({
							filter: 2,
						});

						expect(result).toStrictEqual({
							id: 2,
							createdAt: date,
							name: 'Second',
						});

						return result;
					})
				);

				expect(result).toStrictEqual({
					id: 2,
					createdAt: date,
					name: 'Second',
				});
			}));

		it.effect('RQB v2 transaction find many - no rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findMany();

						expect(result).toStrictEqual([]);
						return result;
					})
				);

				expect(result).toStrictEqual([]);
			}));

		it.effect('RQB v2 transaction find many - multiple rows', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbUser.findMany({
							orderBy: {
								id: 'desc',
							},
						});

						expect(result).toStrictEqual([{
							id: 2,
							createdAt: date,
							name: 'Second',
						}, {
							id: 1,
							createdAt: date,
							name: 'First',
						}]);

						return result;
					})
				);

				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}, {
					id: 1,
					createdAt: date,
					name: 'First',
				}]);
			}));

		it.effect('RQB v2 transaction find many - with relation', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				yield* push(db, { rqbUser, rqbPost });
				const date = new Date(120000);

				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				yield* db.insert(rqbPost).values([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const result = yield* db.query.rqbPost.findMany({
							with: {
								author: true,
							},
							orderBy: {
								id: 'asc',
							},
						});

						expect(result).toStrictEqual([{
							id: 1,
							userId: 1,
							createdAt: date,
							content: null,
							author: {
								id: 1,
								createdAt: date,
								name: 'First',
							},
						}, {
							id: 2,
							userId: 1,
							createdAt: date,
							content: 'Has message this time',
							author: {
								id: 1,
								createdAt: date,
								name: 'First',
							},
						}]);

						return result;
					})
				);

				expect(result).toStrictEqual([{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
					author: {
						id: 1,
						createdAt: date,
						name: 'First',
					},
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
					author: {
						id: 1,
						createdAt: date,
						name: 'First',
					},
				}]);
			}));

		it.effect('RQB v2 transaction find many - placeholders', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				yield* push(db, { rqbUser });

				const date = new Date(120000);
				yield* db.insert(rqbUser).values([{
					id: 1,
					createdAt: date,
					name: 'First',
				}, {
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);

				const result = yield* db.transaction((db) =>
					Effect.gen(function*() {
						const query = db.query.rqbUser.findMany({
							where: {
								id: {
									eq: sql.placeholder('filter'),
								},
							},
							orderBy: {
								id: 'asc',
							},
						}).prepare();

						const result = yield* query.execute({
							filter: 2,
						});

						expect(result).toStrictEqual([{
							id: 2,
							createdAt: date,
							name: 'Second',
						}]);

						return result;
					})
				);
				expect(result).toStrictEqual([{
					id: 2,
					createdAt: date,
					name: 'Second',
				}]);
			}));

		it.effect('transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = mysqlTable('users_transactions', {
					id: serial('id').primaryKey(),
					balance: int('balance').notNull(),
				});
				const products = mysqlTable('products_transactions', {
					id: serial('id').primaryKey(),
					price: int('price').notNull(),
					stock: int('stock').notNull(),
				});

				yield* push(db, { users, products });

				const [userId] = yield* db.insert(users).values({ balance: 100 }).$returningId();
				const [productId] = yield* db.insert(products).values({ price: 10, stock: 10 }).$returningId();

				const [user] = yield* db.select().from(users).where(eq(users.id, userId!.id));
				const [product] = yield* db.select().from(products).where(eq(products.id, productId!.id));

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.update(users).set({ balance: user!.balance - product!.price }).where(eq(users.id, user!.id));
						yield* tx.update(products).set({ stock: product!.stock - 1 }).where(eq(products.id, product!.id));

						// Regardless if `db` or `tx` is used, every query within the transaction effect is completed in transaction
						const nonTxRes = yield* db.select().from(users);
						expect(nonTxRes).toStrictEqual([{ id: 1, balance: 90 }]);
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 90 }]);
			}));

		it.effect('transaction rollback', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = mysqlTable('users_transactions_rollback', {
					id: serial('id').primaryKey(),
					balance: int('balance').notNull(),
				});

				yield* push(db, { users });

				const res = yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });
						yield* tx.rollback();
					})
				).pipe(Effect.result);

				assert(Result.isFailure(res));
				assert(Predicate.isTagged(res.failure, 'EffectTransactionRollbackError'));

				const result = yield* db.select().from(users);

				expect(result).toEqual([]);
			}));

		it.effect('nested transaction', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = mysqlTable('users_nested_transactions', {
					id: serial('id').primaryKey(),
					balance: int('balance').notNull(),
				});

				yield* push(db, { users });

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });

						yield* tx.transaction((tx) =>
							Effect.gen(function*() {
								yield* tx.update(users).set({ balance: 200 });
							})
						);
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 200 }]);
			}));

		it.effect('nested transaction rollback', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = mysqlTable('users_nested_transactions_rollback', {
					id: serial('id').primaryKey(),
					balance: int('balance').notNull(),
				});

				yield* push(db, { users });

				yield* db.transaction((tx) =>
					Effect.gen(function*() {
						yield* tx.insert(users).values({ balance: 100 });

						const res = yield* tx.transaction((tx) =>
							Effect.gen(function*() {
								yield* tx.update(users).set({ balance: 200 });
								yield* tx.rollback();
							})
						).pipe(Effect.result);

						assert(Result.isFailure(res));
						assert(Predicate.isTagged(res.failure, 'EffectTransactionRollbackError'));
					})
				);

				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, balance: 100 }]);
			}));

		it.effect('mySchema :: view', () =>
			Effect.gen(function*() {
				const mySchema = mysqlSchema(`my_schema_custom`);

				const users = mySchema.table('users_100', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: int('city_id').notNull(),
				});

				const cities = mySchema.table('cities_100', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				// Kit's push doesn't support schemas, create manually
				yield* db.execute('drop schema if exists `my_schema_custom`;');
				yield* db.execute('create schema `my_schema_custom`;');
				yield* db.execute(
					'create table `my_schema_custom`.`users_100` (`id` serial AUTO_INCREMENT PRIMARY KEY NOT NULL, `name` text NOT NULL, `city_id` int NOT NULL);',
				);
				yield* db.execute(
					'create table `my_schema_custom`.`cities_100` (`id` serial AUTO_INCREMENT PRIMARY KEY NOT NULL, `name` text NOT NULL);',
				);

				const newYorkers1 = mySchema.view('new_yorkers')
					.as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

				const newYorkers2 = mySchema.view('new_yorkers', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: int('city_id').notNull(),
				}).as(sql`select * from ${users} where ${eq(users.cityId, 1)}`);

				const newYorkers3 = mySchema.view('new_yorkers', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					cityId: int('city_id').notNull(),
				}).existing();

				yield* db.execute(
					sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`,
				);

				yield* db.insert(cities).values([{ name: 'New York' }, { name: 'Paris' }]);

				yield* db.insert(users).values([
					{ name: 'John', cityId: 1 },
					{ name: 'Jane', cityId: 1 },
					{ name: 'Jack', cityId: 2 },
				]);

				{
					const result = yield* db.select().from(newYorkers1);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select().from(newYorkers2);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select().from(newYorkers3);
					expect(result).toEqual([
						{ id: 1, name: 'John', cityId: 1 },
						{ id: 2, name: 'Jane', cityId: 1 },
					]);
				}

				{
					const result = yield* db.select({ name: newYorkers1.name }).from(newYorkers1);
					expect(result).toEqual([
						{ name: 'John' },
						{ name: 'Jane' },
					]);
				}
			}));

		it.effect('insert into ... select', () =>
			Effect.gen(function*() {
				const notifications = mysqlTable('notifications_31', {
					id: int('id').primaryKey().autoincrement(),
					sentAt: timestamp('sent_at').notNull().defaultNow(),
					message: text('message').notNull(),
				});
				const users = mysqlTable('users_31', {
					id: int('id').primaryKey().autoincrement(),
					name: text('name').notNull(),
				});
				const userNotications = mysqlTable('user_notifications_31', {
					userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
					notificationId: int('notification_id').notNull().references(() => notifications.id, {
						onDelete: 'cascade',
					}),
				}, (t) => [primaryKey({ columns: [t.userId, t.notificationId] })]);

				const db = yield* DB;

				yield* push(db, { notifications, users, userNotications });

				yield* db
					.insert(notifications)
					.values({ message: 'You are one of the 3 lucky winners!' });
				const newNotification = (yield* db
					.select({ id: notifications.id })
					.from(notifications))[0]!;

				yield* db.insert(users).values([
					{ name: 'Alice' },
					{ name: 'Bob' },
					{ name: 'Charlie' },
					{ name: 'David' },
					{ name: 'Eve' },
				]);

				yield* db
					.insert(userNotications)
					.select(
						db
							.select({
								userId: users.id,
								notificationId: sql`(${newNotification!.id})`.as('notification_id'),
							})
							.from(users)
							.where(inArray(users.name, ['Alice', 'Charlie', 'Eve']))
							.orderBy(asc(users.id)),
					);
				const sentNotifications = yield* db.select().from(userNotications);

				expect(sentNotifications).toStrictEqual([
					{ userId: 1, notificationId: newNotification!.id },
					{ userId: 3, notificationId: newNotification!.id },
					{ userId: 5, notificationId: newNotification!.id },
				]);
			}));

		it.effect('$count separate', () =>
			Effect.gen(function*() {
				const countTestTable = mysqlTable('count_test_33', {
					id: int('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.$count(countTestTable);

				expect(count).toStrictEqual(4);
			}));

		it.effect('$count embedded', () =>
			Effect.gen(function*() {
				const countTestTable = mysqlTable('count_test_34', {
					id: int('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.select({
					count: db.$count(countTestTable),
				}).from(countTestTable);

				expect(count).toStrictEqual([
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
				]);
			}));

		it.effect('$count separate reuse', () =>
			Effect.gen(function*() {
				const countTestTable = mysqlTable('count_test_35', {
					id: int('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = db.$count(countTestTable);

				const count1 = yield* count;

				yield* db.insert(countTestTable).values({ id: 5, name: 'fifth' });

				const count2 = yield* count;

				yield* db.insert(countTestTable).values({ id: 6, name: 'sixth' });

				const count3 = yield* count;

				expect(count1).toStrictEqual(4);
				expect(count2).toStrictEqual(5);
				expect(count3).toStrictEqual(6);
			}));

		it.effect('$count embedded reuse', () =>
			Effect.gen(function*() {
				const countTestTable = mysqlTable('count_test_36', {
					id: int('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = db.select({
					count: db.$count(countTestTable),
				}).from(countTestTable);

				const count1 = yield* count;

				yield* db.insert(countTestTable).values({ id: 5, name: 'fifth' });

				const count2 = yield* count;

				yield* db.insert(countTestTable).values({ id: 6, name: 'sixth' });

				const count3 = yield* count;

				expect(count1).toStrictEqual([
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
					{ count: 4 },
				]);
				expect(count2).toStrictEqual([
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
					{ count: 5 },
				]);
				expect(count3).toStrictEqual([
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
					{ count: 6 },
				]);
			}));

		it.effect('$count separate with filters', () =>
			Effect.gen(function*() {
				const countTestTable = mysqlTable('count_test_37', {
					id: int('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.$count(countTestTable, gt(countTestTable.id, 1));
				expect(count).toStrictEqual(3);
			}));

		it.effect('$count embedded with filters', () =>
			Effect.gen(function*() {
				const countTestTable = mysqlTable('count_test_38', {
					id: int('id').notNull(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { countTestTable });

				yield* db.insert(countTestTable).values([
					{ id: 1, name: 'First' },
					{ id: 2, name: 'Second' },
					{ id: 3, name: 'Third' },
					{ id: 4, name: 'Fourth' },
				]);

				const count = yield* db.select({
					count: db.$count(countTestTable, gt(countTestTable.id, 1)),
				}).from(countTestTable);

				expect(count).toStrictEqual([
					{ count: 3 },
					{ count: 3 },
					{ count: 3 },
					{ count: 3 },
				]);
			}));

		it.effect('select distinct', () =>
			Effect.gen(function*() {
				const usersDistinctTable = mysqlTable('users_distinct_101', {
					id: int('id').notNull(),
					name: text('name').notNull(),
					age: int('age').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersDistinctTable });

				yield* db.insert(usersDistinctTable).values([
					{ id: 1, name: 'John', age: 24 },
					{ id: 1, name: 'John', age: 24 },
					{ id: 2, name: 'John', age: 25 },
					{ id: 1, name: 'Jane', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
				]);
				const users1 = yield* db.selectDistinct().from(usersDistinctTable).orderBy(
					usersDistinctTable.id,
					usersDistinctTable.name,
				);

				expect(users1).toEqual([
					{ id: 1, name: 'Jane', age: 24 },
					{ id: 1, name: 'Jane', age: 26 },
					{ id: 1, name: 'John', age: 24 },
					{ id: 2, name: 'John', age: 25 },
				]);
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/6673
		it.effect('select distinct ordered by cast columns', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = mysqlTable('distinct_cast_order', {
					id: int('id').notNull(),
					createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
					amount: decimal('amount', { mode: 'number', precision: 10, scale: 2 }).notNull(),
				});

				yield* push(db, { table });

				yield* db.insert(table).values([
					{ id: 1, createdAt: new Date('2026-10-01T12:00:00.000Z'), amount: 9 },
					{ id: 2, createdAt: new Date('2026-10-02T12:00:00.000Z'), amount: 100 },
					{ id: 2, createdAt: new Date('2026-10-02T12:00:00.000Z'), amount: 100 },
					{ id: 3, createdAt: new Date('2026-10-03T12:00:00.000Z'), amount: 10 },
				]);

				const byDate = yield* db
					.selectDistinct({ id: table.id, createdAt: table.createdAt, amount: table.amount })
					.from(table)
					.orderBy(desc(table.createdAt));
				const byAmount = yield* db
					.selectDistinct({ id: table.id, amount: table.amount })
					.from(table)
					.orderBy(desc(table.amount));

				expect(byDate).toEqual([
					{ id: 3, createdAt: new Date('2026-10-03T12:00:00.000Z'), amount: 10 },
					{ id: 2, createdAt: new Date('2026-10-02T12:00:00.000Z'), amount: 100 },
					{ id: 1, createdAt: new Date('2026-10-01T12:00:00.000Z'), amount: 9 },
				]);
				expect(byAmount).toEqual([
					{ id: 2, amount: 100 },
					{ id: 3, amount: 10 },
					{ id: 1, amount: 9 },
				]);
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/6673
		it.effect('order by aliased cast columns', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = mysqlTable('alias_cast_order', {
					id: int('id').notNull(),
					amount: decimal('amount', { mode: 'number', precision: 10, scale: 2 }).notNull(),
				});

				yield* push(db, { table });

				yield* db.insert(table).values([
					{ id: 1, amount: 9 },
					{ id: 2, amount: 100 },
					{ id: 3, amount: 10 },
				]);

				const amountAlias = table.amount.as('amount_alias');
				const amountSql = sql<number>`${table.amount}`.mapWith(table.amount).as('amount_sql');

				const byColumnAlias = yield* db.select({ id: table.id, amount: amountAlias }).from(table).orderBy(
					desc(amountAlias),
				);
				const bySqlAlias = yield* db.select({ id: table.id, amount: amountSql }).from(table).orderBy(desc(amountSql));
				const byDistinctAlias = yield* db
					.selectDistinct({ id: table.id, amount: amountAlias })
					.from(table)
					.orderBy(desc(amountAlias));

				const expected = [
					{ id: 2, amount: 100 },
					{ id: 3, amount: 10 },
					{ id: 1, amount: 9 },
				];
				expect(byColumnAlias).toEqual(expected);
				expect(bySqlAlias).toEqual(expected);
				expect(byDistinctAlias).toEqual(expected);
			}));

		it.effect('update with returning all fields', () =>
			Effect.gen(function*() {
				const users = mysqlTable('users_9', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: json('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at').notNull().defaultNow(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const now = Date.now();

				yield* db.insert(users).values({ name: 'John' });
				yield* db
					.update(users)
					.set({ name: 'Jane' })
					.where(eq(users.name, 'John'));
				const usersResult = yield* db.select().from(users);

				expect(usersResult[0]!.createdAt).toBeInstanceOf(Date);
				expectRecentTime(usersResult[0]!.createdAt, now, 1000);
				expect(usersResult).toEqual([
					{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: usersResult[0]!.createdAt },
				]);
			}));

		it.effect('update with returning partial', () =>
			Effect.gen(function*() {
				const users = mysqlTable('users_10', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values({ name: 'John' });
				yield* db
					.update(users)
					.set({ name: 'Jane' })
					.where(eq(users.name, 'John'));
				const usersResult = yield* db.select({
					id: users.id,
					name: users.name,
				}).from(users);

				expect(usersResult).toEqual([{ id: 1, name: 'Jane' }]);
			}));

		it.effect('delete with returning all fields', () =>
			Effect.gen(function*() {
				const users = mysqlTable('users_11', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: json('jsonb').$type<string[]>(),
					createdAt: timestamp('created_at').notNull().defaultNow(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const now = Date.now();

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db.select().from(users);
				yield* db.delete(users).where(eq(users.name, 'John'));

				expect(usersResult[0]!.createdAt).toBeInstanceOf(Date);
				expectRecentTime(usersResult[0]!.createdAt, now, 1000);
				expect(usersResult).toEqual([
					{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: usersResult[0]!.createdAt },
				]);

				const afterDelete = yield* db.select().from(users);
				expect(afterDelete).toEqual([]);
			}));

		it.effect('delete with returning partial', () =>
			Effect.gen(function*() {
				const users = mysqlTable('users_12', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db.insert(users).values({ name: 'John' });
				const usersResult = yield* db.select({
					id: users.id,
					name: users.name,
				}).from(users);
				yield* db.delete(users).where(eq(users.name, 'John'));

				expect(usersResult).toEqual([{ id: 1, name: 'John' }]);

				const afterDelete = yield* db.select().from(users);
				expect(afterDelete).toEqual([]);
			}));

		it.effect('insert many', () =>
			Effect.gen(function*() {
				const users = mysqlTable('users_19', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: json('jsonb').$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					]);
				const result = yield* db
					.select({
						id: users.id,
						name: users.name,
						jsonb: users.jsonb,
						verified: users.verified,
					})
					.from(users);

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('insert with returning partial', () =>
			Effect.gen(function*() {
				const users = mysqlTable('users_20', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: json('jsonb').$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					]);
				const result = yield* db
					.select({
						id: users.id,
						name: users.name,
						jsonb: users.jsonb,
						verified: users.verified,
					})
					.from(users);

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('insert with returning all fields', () =>
			Effect.gen(function*() {
				const users = mysqlTable('users_20', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					jsonb: json('jsonb').$type<string[]>(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				yield* db
					.insert(users)
					.values([
						{ name: 'John' },
						{ name: 'Bruce', jsonb: ['foo', 'bar'] },
						{ name: 'Jane' },
						{ name: 'Austin', verified: true },
					]);
				const result = yield* db
					.select({
						id: users.id,
						name: users.name,
						jsonb: users.jsonb,
						verified: users.verified,
					})
					.from(users);

				expect(result).toEqual([
					{ id: 1, name: 'John', jsonb: null, verified: false },
					{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
					{ id: 3, name: 'Jane', jsonb: null, verified: false },
					{ id: 4, name: 'Austin', jsonb: null, verified: true },
				]);
			}));

		it.effect('prepared statement reuse', () =>
			Effect.gen(function*() {
				const usersTable = mysqlTable('users_35', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				const stmt = db
					.insert(usersTable)
					.values({
						verified: true,
						name: sql.placeholder('name'),
					})
					.prepare();

				for (let i = 0; i < 10; i++) {
					yield* stmt.execute({ name: `John ${i}` });
				}

				const result = yield* db
					.select({
						id: usersTable.id,
						name: usersTable.name,
						verified: usersTable.verified,
					})
					.from(usersTable);

				expect(result).toEqual([
					{ id: 1, name: 'John 0', verified: true },
					{ id: 2, name: 'John 1', verified: true },
					{ id: 3, name: 'John 2', verified: true },
					{ id: 4, name: 'John 3', verified: true },
					{ id: 5, name: 'John 4', verified: true },
					{ id: 6, name: 'John 5', verified: true },
					{ id: 7, name: 'John 6', verified: true },
					{ id: 8, name: 'John 7', verified: true },
					{ id: 9, name: 'John 8', verified: true },
					{ id: 10, name: 'John 9', verified: true },
				]);
			}));

		it.effect('prepared statement with placeholder in .where', () =>
			Effect.gen(function*() {
				const usersTable = mysqlTable('users_36', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values({ name: 'John' });
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.where(eq(usersTable.id, sql.placeholder('id')))
					.prepare();
				const result = yield* stmt.execute({ id: 1 });

				expect(result).toEqual([{ id: 1, name: 'John' }]);
			}));

		it.effect('prepared statement with placeholder in .limit', () =>
			Effect.gen(function*() {
				const usersTable = mysqlTable('users_37', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values({ name: 'John' });
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.where(eq(usersTable.id, sql.placeholder('id')))
					.limit(sql.placeholder('limit'))
					.prepare();

				const result = yield* stmt.execute({ id: 1, limit: '1' });

				expect(result).toEqual([{ id: 1, name: 'John' }]);
				expect(result).toHaveLength(1);
			}));

		it.effect('prepared statement with placeholder in .offset', () =>
			Effect.gen(function*() {
				const usersTable = mysqlTable('users_38', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				yield* db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.offset(sql.placeholder('offset'))
					.limit(sql.placeholder('limit'))
					.prepare();

				const result = yield* stmt.execute({ offset: '1', limit: '1' });

				expect(result).toEqual([{ id: 2, name: 'John1' }]);
			}));

		it.effect('prepared statement built using $dynamic', () =>
			Effect.gen(function*() {
				const usersTable = mysqlTable('users_39', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { usersTable });

				function withLimitOffset(qb: any) {
					return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
				}

				yield* db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
				const stmt = db
					.select({
						id: usersTable.id,
						name: usersTable.name,
					})
					.from(usersTable)
					.$dynamic();
				withLimitOffset(stmt).prepare();

				const result = yield* stmt.execute({ limit: '1', offset: '1' });

				expect(result).toEqual([{ id: 2, name: 'John1' }]);
				expect(result).toHaveLength(1);
			}));

		it.effect('with ... select', () =>
			Effect.gen(function*() {
				const orders = mysqlTable('orders_55', {
					region: text('region').notNull(),
					product: text('product').notNull(),
					amount: int('amount').notNull(),
					quantity: int('quantity').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { orders });

				yield* db.insert(orders).values([
					{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
					{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 50, quantity: 5 },
				]);

				const regionalSales = db
					.$with('regional_sales')
					.as(
						db
							.select({
								region: orders.region,
								totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
							})
							.from(orders)
							.groupBy(orders.region),
					);

				const topRegions = db
					.$with('top_regions')
					.as(
						db
							.select({
								region: regionalSales.region,
							})
							.from(regionalSales)
							.where(
								gt(
									regionalSales.totalSales,
									db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
								),
							),
					);

				const result1 = yield* db
					.with(regionalSales, topRegions)
					.select({
						region: orders.region,
						product: orders.product,
						productUnits: sql<number>`cast(sum(${orders.quantity}) as unsigned)`,
						productSales: sql<number>`cast(sum(${orders.amount}) as unsigned)`,
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region, orders.product)
					.orderBy(orders.region, orders.product);
				const result2 = yield* db
					.with(regionalSales, topRegions)
					.selectDistinct({
						region: orders.region,
						product: orders.product,
						productUnits: sql<number>`cast(sum(${orders.quantity}) as unsigned)`,
						productSales: sql<number>`cast(sum(${orders.amount}) as unsigned)`,
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region, orders.product)
					.orderBy(orders.region, orders.product);
				const result3 = yield* db
					.with(regionalSales, topRegions)
					.selectDistinct({
						region: orders.region,
						productUnits: sql<number>`cast(sum(${orders.quantity}) as unsigned)`,
						productSales: sql<number>`cast(sum(${orders.amount}) as unsigned)`,
					})
					.from(orders)
					.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
					.groupBy(orders.region)
					.orderBy(orders.region);

				expect(result1).toEqual([
					{
						region: 'Europe',
						product: 'A',
						productUnits: 3,
						productSales: 30,
					},
					{
						region: 'Europe',
						product: 'B',
						productUnits: 5,
						productSales: 50,
					},
					{
						region: 'US',
						product: 'A',
						productUnits: 7,
						productSales: 70,
					},
					{
						region: 'US',
						product: 'B',
						productUnits: 9,
						productSales: 90,
					},
				]);
				expect(result2).toEqual(result1);
				expect(result3).toEqual([
					{
						region: 'Europe',
						productUnits: 8,
						productSales: 80,
					},
					{
						region: 'US',
						productUnits: 16,
						productSales: 160,
					},
				]);
			}));

		it.effect('with ... update', () =>
			Effect.gen(function*() {
				const products = mysqlTable('products_56', {
					id: serial('id').primaryKey(),
					price: decimal('price', {
						precision: 15,
						scale: 2,
					}).notNull(),
					cheap: boolean('cheap').notNull().default(false),
				});

				const db = yield* DB;
				yield* push(db, { products });

				yield* db.insert(products).values([
					{ price: '10.99' },
					{ price: '25.85' },
					{ price: '32.99' },
					{ price: '2.50' },
					{ price: '4.59' },
				]);

				const averagePrice = db
					.$with('average_price')
					.as(
						db
							.select({
								value: sql`avg(${products.price})`.as('value'),
							})
							.from(products),
					);

				yield* db
					.with(averagePrice)
					.update(products)
					.set({
						cheap: true,
					})
					.where(lt(products.price, sql`(select * from ${averagePrice})`));

				const result = yield* db
					.select({
						id: products.id,
					})
					.from(products)
					.where(eq(products.cheap, true));

				expect(result).toEqual([
					{ id: 1 },
					{ id: 4 },
					{ id: 5 },
				]);
			}));

		it.effect('with ... delete', () =>
			Effect.gen(function*() {
				const orders = mysqlTable('orders_58', {
					id: serial('id').primaryKey(),
					region: text('region').notNull(),
					product: text('product').notNull(),
					amount: int('amount').notNull(),
					quantity: int('quantity').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { orders });

				yield* db.insert(orders).values([
					{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
					{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
					{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 30, quantity: 3 },
					{ region: 'US', product: 'A', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 40, quantity: 4 },
					{ region: 'US', product: 'B', amount: 50, quantity: 5 },
				]);

				const averageAmount = db
					.$with('average_amount')
					.as(
						db
							.select({
								value: sql`avg(${orders.amount})`.as('value'),
							})
							.from(orders),
					);

				yield* db
					.with(averageAmount)
					.delete(orders)
					.where(gt(orders.amount, sql`(select * from ${averageAmount})`));

				const result = yield* db
					.select({
						id: orders.id,
					})
					.from(orders);

				expect(result).toEqual([
					{ id: 1 },
					{ id: 2 },
					{ id: 3 },
					{ id: 4 },
					{ id: 5 },
				]);
			}));

		it.effect('partial join with alias', () =>
			Effect.gen(function*() {
				const users = mysqlTable('users_29', {
					id: serial('id' as string).primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const customerAlias = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select({
						user: {
							id: users.id,
							name: users.name,
						},
						customer: {
							id: customerAlias.id,
							name: customerAlias.name,
						},
					})
					.from(users)
					.leftJoin(customerAlias, eq(customerAlias.id, 11))
					.where(eq(users.id, 10));

				expect(result).toEqual([
					{
						user: { id: 10, name: 'Ivan' },
						customer: { id: 11, name: 'Hans' },
					},
				]);
			}));

		it.effect('full join with alias', () =>
			Effect.gen(function*() {
				const users = mysqlTable('prefixed_users_30', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const customers = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select()
					.from(users)
					.leftJoin(customers, eq(customers.id, 11))
					.where(eq(users.id, 10));

				expect(result).toEqual([{
					prefixed_users_30: {
						id: 10,
						name: 'Ivan',
					},
					customer: {
						id: 11,
						name: 'Hans',
					},
				}]);
			}));

		it.effect('select from alias', () =>
			Effect.gen(function*() {
				const users = mysqlTable('prefixed_users_31', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				const db = yield* DB;
				yield* push(db, { users });

				const user = alias(users, 'user');
				const customers = alias(users, 'customer');

				yield* db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
				const result = yield* db
					.select()
					.from(user)
					.leftJoin(customers, eq(customers.id, 11))
					.where(eq(user.id, 10));

				expect(result).toEqual([{
					user: {
						id: 10,
						name: 'Ivan',
					},
					customer: {
						id: 11,
						name: 'Hans',
					},
				}]);
			}));

		it.effect('set operations (mixed) from query builder with subquery', () =>
			Effect.gen(function*() {
				const cities2Table = mysqlTable('cities_1', {
					id: int('id').primaryKey(),
					name: text('name').notNull(),
				});

				const users2Table = mysqlTable('users2_1', {
					id: int('id').primaryKey(),
					name: text('name').notNull(),
					cityId: int('city_id').references(() => cities2Table.id),
				});

				const db = yield* DB;
				yield* push(db, { cities2Table, users2Table });

				yield* db.insert(cities2Table).values([
					{ id: 1, name: 'New York' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
				]);

				yield* db.insert(users2Table).values([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 2 },
					{ id: 3, name: 'Jack', cityId: 3 },
					{ id: 4, name: 'Peter', cityId: 3 },
					{ id: 5, name: 'Ben', cityId: 2 },
					{ id: 6, name: 'Jill', cityId: 1 },
					{ id: 7, name: 'Mary', cityId: 2 },
					{ id: 8, name: 'Sally', cityId: 1 },
				]);

				const sq = db
					.select()
					.from(cities2Table).where(gt(cities2Table.id, 1)).as('sq');

				const result = yield* db
					.select()
					.from(cities2Table).except(
						({ unionAll }) =>
							unionAll(
								db.select().from(sq),
								db.select().from(cities2Table).where(eq(cities2Table.id, 2)),
							),
					);

				expect(result).toHaveLength(1);

				expect(result).toEqual([
					{ id: 1, name: 'New York' },
				]);

				let err: unknown;
				try {
					yield* db
						.select()
						.from(cities2Table).except(
							({ unionAll }) =>
								unionAll(
									db
										.select({ name: cities2Table.name, id: cities2Table.id })
										.from(cities2Table).where(gt(cities2Table.id, 1)),
									db.select().from(cities2Table).where(eq(cities2Table.id, 2)),
								),
						);
				} catch (error) {
					err = error;
				}

				expect(err).toBeInstanceOf(Error);
			}));

		it.effect('set operations (mixed all) as function', () =>
			Effect.gen(function*() {
				const cities2Table = mysqlTable('cities_2', {
					id: int('id').primaryKey(),
					name: text('name').notNull(),
				});

				const users2Table = mysqlTable('users2_2', {
					id: int('id').primaryKey(),
					name: text('name').notNull(),
					cityId: int('city_id').references(() => cities2Table.id),
				});

				const db = yield* DB;
				yield* push(db, { cities2Table, users2Table });

				yield* db.insert(cities2Table).values([
					{ id: 1, name: 'New York' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
				]);

				yield* db.insert(users2Table).values([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 2 },
					{ id: 3, name: 'Jack', cityId: 3 },
					{ id: 4, name: 'Peter', cityId: 3 },
					{ id: 5, name: 'Ben', cityId: 2 },
					{ id: 6, name: 'Jill', cityId: 1 },
					{ id: 7, name: 'Mary', cityId: 2 },
					{ id: 8, name: 'Sally', cityId: 1 },
				]);

				const result = yield* union(
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 1)),
					except(
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(gte(users2Table.id, 5)),
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(eq(users2Table.id, 7)),
					),
					db
						.select().from(cities2Table).where(gt(cities2Table.id, 1)),
				).orderBy(asc(sql`id`));

				expect(result).toHaveLength(6);

				expect(result).toEqual([
					{ id: 1, name: 'John' },
					{ id: 2, name: 'London' },
					{ id: 3, name: 'Tampa' },
					{ id: 5, name: 'Ben' },
					{ id: 6, name: 'Jill' },
					{ id: 8, name: 'Sally' },
				]);

				let err: unknown;
				try {
					yield* union(
						db
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(eq(users2Table.id, 1)),
						except(
							db
								.select({ id: users2Table.id, name: users2Table.name })
								.from(users2Table).where(gte(users2Table.id, 5)),
							db
								.select({ name: users2Table.name, id: users2Table.id })
								.from(users2Table).where(eq(users2Table.id, 7)),
						),
						db
							.select().from(cities2Table).where(gt(cities2Table.id, 1)),
					);
				} catch (error) {
					err = error;
				}

				expect(err).toBeInstanceOf(Error);
			}));

		it.effect('custom EffectLogger override - user provided logger takes precedence over default', () =>
			Effect.gen(function*() {
				const loggedQueries: Array<{ query: string; params: unknown[] }> = [];

				const customLogger: EffectLoggerShape = {
					logQuery: (query: string, params: unknown[]) =>
						Effect.sync(() => {
							loggedQueries.push({ query, params });
						}),
				};
				const customLoggerLayer = Layer.succeed(EffectLogger, customLogger);

				const db = yield* MySqlDrizzle.make({ relations }).pipe(
					Effect.provide(customLoggerLayer),
					Effect.provide(MySqlDrizzle.DefaultServices),
				);

				const users = mysqlTable('users_custom_logger', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'John' });
				yield* db.select().from(users);

				expect(loggedQueries.length).toBeGreaterThanOrEqual(2);
				expect(loggedQueries.some((q) => q.query.toLowerCase().includes('insert'))).toBe(true);
				expect(loggedQueries.some((q) => q.query.toLowerCase().includes('select'))).toBe(true);
			}));

		it.effect('makeWithDefaults - convenience function that includes DefaultServices', () =>
			Effect.gen(function*() {
				const db = yield* MySqlDrizzle.makeWithDefaults({ relations });

				const users = mysqlTable('users_make_with_defaults', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
				});

				yield* push(db, { users });
				yield* db.insert(users).values({ name: 'Alice' });
				const result = yield* db.select().from(users);

				expect(result).toEqual([{ id: 1, name: 'Alice' }]);
			}));

		it.effect('Mappers: correct mappers enabled', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const jitDb = yield* createDB({}, () => ({}), true);

				const dialect: MySqlDialect = (<any> db).dialect;
				const jitDialect: MySqlDialect = (<any> jitDb).dialect;

				expect(dialect.mapperGenerators.relationalRows === makeDefaultRqbMapper).toStrictEqual(true);
				expect(dialect.mapperGenerators.rows === makeDefaultQueryMapper).toStrictEqual(true);
				expect(jitDialect.mapperGenerators.relationalRows === makeJitRqbMapper).toStrictEqual(true);
				expect(jitDialect.mapperGenerators.rows === makeJitQueryMapper).toStrictEqual(true);
			}));

		const mappersDate = new Date('2026-04-02T00:00:00.000Z');

		const jsonObjectUsers = [{
			id: 1,
			name: 'First',
			bio: null,
			createdAt: mappersDate,
			meta: { tags: ['a', 'b'] },
		}, {
			id: 2,
			name: 'Second',
			bio: 'About',
			createdAt: mappersDate,
			meta: null,
		}];

		const jsonObjectPosts = [
			{ id: 1, authorId: 1, title: 'P1' },
			{ id: 2, authorId: 1, title: 'P2' },
			{ id: 3, authorId: null, title: 'Orphan' },
		];

		for (const jit of [false, true]) {
			it.effect(`No nullification on non-joined table's all-null object${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'nullify1_users_jit' : 'nullify1_users') as 'nullify1_users', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						city: t.text('city'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users });

					yield* db.insert(users).values({ name: 'John' });

					const res = yield* db.select({ id: users.id, meta: { bio: users.bio, city: users.city } }).from(users);

					expect(res).toStrictEqual([{ id: 1, meta: { bio: null, city: null } }]);
				}));

			it.effect(`Cross-table group never nullified${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const cities = mysqlTable((jit ? 'nullify2_cities_jit' : 'nullify2_cities') as 'nullify2_cities', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
					}));
					const users = mysqlTable((jit ? 'nullify2_users_jit' : 'nullify2_users') as 'nullify2_users', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						cityId: t.int('city_id'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { cities, users });

					yield* db.insert(cities).values([{ name: 'Paris' }]);
					yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

					const res = yield* db
						.select({ id: users.id, g: { user: users.name, cityId: cities.id, cityName: cities.name } })
						.from(users)
						.leftJoin(cities, eq(users.cityId, cities.id))
						.orderBy(users.id);

					expect(res).toStrictEqual([
						{ id: 1, g: { user: 'John', cityId: 1, cityName: 'Paris' } },
						{ id: 2, g: { user: 'Jane', cityId: null, cityName: null } },
					]);

					const onlyJoinedSideNotNull = yield* db
						.select({ id: users.id, g: { bio: users.bio, cityId: cities.id } })
						.from(users)
						.leftJoin(cities, eq(users.cityId, cities.id))
						.orderBy(users.id);

					expect(onlyJoinedSideNotNull).toStrictEqual([
						{ id: 1, g: { bio: null, cityId: 1 } },
						{ id: 2, g: { bio: null, cityId: null } },
					]);
				}));

			it.effect(`SQL field groups are never nullified${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const cities = mysqlTable((jit ? 'nullify3_cities_jit' : 'nullify3_cities') as 'nullify3_cities', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
					}));
					const users = mysqlTable((jit ? 'nullify3_users_jit' : 'nullify3_users') as 'nullify3_users', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
						cityId: t.int('city_id'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { cities, users });

					yield* db.insert(cities).values([{ name: 'Paris' }]);
					yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

					const res = yield* db
						.select({
							id: users.id,
							calc: { user: sql<string>`upper(${users.name})`, city: sql<string | null>`upper(${cities.name})` },
						})
						.from(users)
						.leftJoin(cities, eq(users.cityId, cities.id))
						.orderBy(users.id);

					expect(res).toStrictEqual([
						{ id: 1, calc: { user: 'JOHN', city: 'PARIS' } },
						{ id: 2, calc: { user: 'JANE', city: null } },
					]);
				}));

			it.effect(`Nullify all-null group from from nullable join${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const cities = mysqlTable((jit ? 'nullify4_cities_jit' : 'nullify4_cities') as 'nullify4_cities', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
						state: t.text('state'),
						zip: t.text('zip'),
					}));
					const users = mysqlTable((jit ? 'nullify4_users_jit' : 'nullify4_users') as 'nullify4_users', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
						cityId: t.int('city_id'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { cities, users });

					yield* db.insert(cities).values([
						{ name: 'Paris', state: 'IDF', zip: '75' },
						{ name: 'London' },
					]);
					yield* db.insert(users).values([
						{ name: 'John', cityId: 1 },
						{ name: 'Jane', cityId: 2 },
						{ name: 'Jack' },
					]);

					const res = yield* db
						.select({ name: users.name, c: { state: cities.state, zip: cities.zip } })
						.from(users)
						.leftJoin(cities, eq(users.cityId, cities.id))
						.orderBy(users.id);

					expect(res).toStrictEqual([
						{ name: 'John', c: { state: 'IDF', zip: '75' } },
						{ name: 'Jane', c: null },
						{ name: 'Jack', c: null },
					]);
				}));

			it.effect(`Don't disregard added SQL field during join nullification${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const cities = mysqlTable((jit ? 'nullify5_cities_jit' : 'nullify5_cities') as 'nullify5_cities', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
						state: t.text('state'),
					}));
					const users = mysqlTable((jit ? 'nullify5_users_jit' : 'nullify5_users') as 'nullify5_users', (t) => ({
						id: t.serial('id').primaryKey(),
						name: t.text('name').notNull(),
						cityId: t.int('city_id'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { cities, users });

					yield* db.insert(cities).values([{ name: 'Paris', state: 'IDF' }, { name: 'London' }]);
					yield* db.insert(users).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 2 }]);

					const res = yield* db
						.select({
							name: users.name,
							c: { state: cities.state, cityUpper: sql<string>`upper(${cities.name})` },
						})
						.from(users)
						.leftJoin(cities, eq(users.cityId, cities.id))
						.orderBy(users.id);

					// Jane's city (London) matched but has no `state`; the added `cityUpper` sql field is non-null, so
					// the all-null rule keeps the object rather than nullifying it on the lone column.
					expect(res).toStrictEqual([
						{ name: 'John', c: { state: 'IDF', cityUpper: 'PARIS' } },
						{ name: 'Jane', c: { state: null, cityUpper: 'LONDON' } },
					]);
				}));

			it.effect(`Mappers: deep nullification${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const db = yield* createDB({}, () => ({}), jit);
					yield* resetDeepNullification(db);
					yield* push(db, dnPushSchema);
					yield* runDeepNullification(db);
				}));

			it.effect(`Mappers: simple select - no rows${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jit_mappers_users_1' : 'mappers_users_1') as 'mappers_users_1', (t) => ({
						id: t.bigint('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.timestamp('created_at', {
							mode: 'date',
						}).notNull(),
						isBanned: t.boolean('is_banned'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users });

					const result = yield* db.select().from(users);

					expect(result).toStrictEqual([]);
				}));

			it.effect(`Mappers: select - nothing to decode - text${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jit_mappers_users_2' : 'mappers_users_2') as 'mappers_users_2', (t) => ({
						id: t.bigint('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.timestamp('created_at', {
							mode: 'date',
						}).notNull(),
						isBanned: t.boolean('is_banned'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users });

					const insertedIds = yield* db.insert(users).values([{
						id: 1,
						name: 'First',
						createdAt: mappersDate,
					}]).$returningId();

					expect(insertedIds).toStrictEqual([]);

					const selected = yield* db.select({ name: users.name }).from(users);

					expect(selected).toStrictEqual([{ name: 'First' }]);
				}));

			it.effect(`Mappers: select - nothing to decode - null${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jit_mappers_users_3' : 'mappers_users_3') as 'mappers_users_3', (t) => ({
						id: t.bigint('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.timestamp('created_at', {
							mode: 'date',
						}).notNull(),
						isBanned: t.boolean('is_banned'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users });

					const insertedIds = yield* db.insert(users).values([{
						id: 1,
						name: 'First',
						createdAt: mappersDate,
					}]).$returningId();

					expect(insertedIds).toStrictEqual([]);

					const selected = yield* db.select({ isBanned: users.isBanned }).from(users);

					expect(selected).toStrictEqual([{ isBanned: null }]);
				}));

			it.effect(`Mappers: insert $returningId + select${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jit_mappers_users_4' : 'mappers_users_4') as 'mappers_users_4', (t) => ({
						id: t.bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.timestamp('created_at', {
							mode: 'date',
						}).notNull(),
						isBanned: t.boolean('is_banned'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users });

					const insertedIds = yield* db.insert(users).values([{
						name: 'First',
						createdAt: mappersDate,
					}, {
						name: 'Second',
						createdAt: mappersDate,
						isBanned: true,
					}, {
						name: 'Third',
						createdAt: mappersDate,
					}]).$returningId();

					expect(insertedIds).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

					const selected = yield* db.select().from(users);

					yield* db.update(users).set({
						isBanned: false,
					}).where(eq(users.id, 2));

					expect(selected).toStrictEqual([{
						id: 1,
						name: 'First',
						createdAt: mappersDate,
						isBanned: null,
					}, {
						id: 2,
						name: 'Second',
						createdAt: mappersDate,
						isBanned: true,
					}, {
						id: 3,
						name: 'Third',
						createdAt: mappersDate,
						isBanned: null,
					}]);
				}));

			it.effect(`Mappers: select complex selections${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jit_mappers_users_5' : 'mappers_users_5') as 'mappers_users_5', (t) => ({
						id: t.bigint('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.timestamp('created_at', {
							mode: 'date',
						}).notNull(),
						isBanned: t.boolean('is_banned'),
					}));

					const posts = mysqlTable((jit ? 'jit_mappers_posts_1' : 'mappers_posts_1') as 'mappers_posts_1', (t) => ({
						id: t.int('id').primaryKey(),
						authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
						content: t.text('content'),
					}));

					const db = yield* createDB({}, () => ({}), jit);
					yield* push(db, { users, posts });

					const insertedIds = yield* db.insert(users).values([{
						id: 1,
						name: 'First',
						createdAt: mappersDate,
					}, {
						id: 2,
						name: 'Second',
						createdAt: mappersDate,
						isBanned: true,
					}, {
						id: 3,
						name: 'Third',
						createdAt: mappersDate,
					}]).$returningId();

					expect(insertedIds).toStrictEqual([]);

					yield* db.insert(posts).values({
						id: 1,
						authorId: 1,
						content: 'p1',
					});

					const selected1 = yield* db.select({ user: users, post: posts }).from(users).leftJoin(
						posts,
						eq(users.id, posts.authorId),
					);
					const selected2 = yield* db.select({ user: users, post: posts }).from(users).innerJoin(
						posts,
						eq(users.id, posts.authorId),
					);
					const selected3 = yield* db.select({
						userId: users.id,
						postId: posts.id,
						name: users.name,
						isBanned: users.isBanned,
						content: posts.content,
						createdAt: users.createdAt,
					}).from(users).leftJoin(
						posts,
						eq(users.id, posts.authorId),
					);
					const selected4 = yield* db.select({
						userId: users.id,
						postId: posts.id,
						name: users.name,
						isBanned: users.isBanned,
						content: posts.content,
						createdAt: users.createdAt,
					}).from(users).innerJoin(
						posts,
						eq(users.id, posts.authorId),
					);

					expect(selected1).toStrictEqual([{
						user: {
							id: 1,
							name: 'First',
							createdAt: mappersDate,
							isBanned: null,
						},
						post: {
							id: 1,
							authorId: 1,
							content: 'p1',
						},
					}, {
						user: {
							id: 2,
							name: 'Second',
							createdAt: mappersDate,
							isBanned: true,
						},
						post: null,
					}, {
						user: {
							id: 3,
							name: 'Third',
							createdAt: mappersDate,
							isBanned: null,
						},
						post: null,
					}]);
					expect(selected2).toStrictEqual([{
						user: {
							id: 1,
							name: 'First',
							createdAt: mappersDate,
							isBanned: null,
						},
						post: {
							id: 1,
							authorId: 1,
							content: 'p1',
						},
					}]);
					expect(selected3).toStrictEqual([
						{
							content: 'p1',
							createdAt: mappersDate,
							isBanned: null,
							name: 'First',
							postId: 1,
							userId: 1,
						},
						{
							content: null,
							createdAt: mappersDate,
							isBanned: true,
							name: 'Second',
							postId: null,
							userId: 2,
						},
						{
							content: null,
							createdAt: mappersDate,
							isBanned: null,
							name: 'Third',
							postId: null,
							userId: 3,
						},
					]);
					expect(selected4).toStrictEqual([
						{
							content: 'p1',
							createdAt: mappersDate,
							isBanned: null,
							name: 'First',
							postId: 1,
							userId: 1,
						},
					]);
				}));

			it.effect(`Mappers: relational${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jit_mappers_users_6' : 'mappers_users_6') as 'mappers_users_6', (t) => ({
						id: t.bigint('id', { mode: 'number' }).primaryKey(),
						name: t.text('name').notNull(),
						createdAt: t.timestamp('created_at', {
							mode: 'date',
						}).notNull(),
						isBanned: t.boolean('is_banned'),
					}));

					const posts = mysqlTable((jit ? 'jit_mappers_posts_2' : 'mappers_posts_2') as 'mappers_posts_2', (t) => ({
						id: t.int('id').primaryKey(),
						authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
						content: t.text('content'),
					}));

					const db = yield* createDB(
						{ users, posts },
						(r) => ({
							users: {
								post: r.one.posts({
									from: r.users.id,
									to: r.posts.authorId,
								}),
								posts: r.one.posts({
									from: r.users.id,
									to: r.posts.authorId,
								}),
							},
							posts: {
								author: r.one.users({
									from: r.posts.authorId,
									to: r.users.id,
								}),
								authors: r.many.users({
									from: r.posts.authorId,
									to: r.users.id,
								}),
							},
						}),
						jit,
					);
					yield* push(db, { users, posts });

					const empty1 = yield* db.query.users.findFirst();
					const empty2 = yield* db.query.users.findMany();

					expect(empty1).toStrictEqual(undefined);
					expect(empty2).toStrictEqual([]);

					const insertedIds = yield* db.insert(users).values([{
						id: 1,
						name: 'First',
						createdAt: mappersDate,
					}, {
						id: 2,
						name: 'Second',
						createdAt: mappersDate,
						isBanned: true,
					}, {
						id: 3,
						name: 'Third',
						createdAt: mappersDate,
					}]).$returningId();

					expect(insertedIds).toStrictEqual([]);

					yield* db.insert(posts).values({
						id: 1,
						authorId: 1,
						content: 'p1',
					});

					const simple1 = yield* db.query.users.findFirst();
					const simple2 = yield* db.query.users.findMany();

					expect(simple1).toStrictEqual(
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
						},
					);
					expect(simple2).toStrictEqual([
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
						},
						{
							createdAt: mappersDate,
							id: 2,
							isBanned: true,
							name: 'Second',
						},
						{
							createdAt: mappersDate,
							id: 3,
							isBanned: null,
							name: 'Third',
						},
					]);

					const extra1 = yield* db.query.users.findFirst({
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					});
					const extra2 = yield* db.query.users.findMany({
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					});

					expect(extra1).toStrictEqual(
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
					);
					expect(extra2).toStrictEqual([
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
							sql: 1,
							sqlWrapper: 2,
						},
						{
							createdAt: mappersDate,
							id: 2,
							isBanned: true,
							name: 'Second',
							sql: 1,
							sqlWrapper: 2,
						},
						{
							createdAt: mappersDate,
							id: 3,
							isBanned: null,
							name: 'Third',
							sql: 1,
							sqlWrapper: 2,
						},
					]);

					const nested1 = yield* db.query.users.findFirst({
						with: {
							post: {
								with: {
									author: {
										extras: {
											sql: sql`SELECT 1`.mapWith(Number),
											sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
										},
										where: {
											RAW: sql`false`,
										},
									},
									authors: {
										extras: {
											sql: sql`SELECT 1`.mapWith(Number),
											sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
										},
										where: {
											RAW: sql`false`,
										},
									},
								},
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
							posts: {
								with: {
									author: {
										extras: {
											sql: sql`SELECT 1`.mapWith(Number),
											sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
										},
									},
									authors: {
										extras: {
											sql: sql`SELECT 1`.mapWith(Number),
											sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
										},
									},
								},
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					});
					const nested2 = yield* db.query.users.findMany({
						with: {
							post: {
								with: {
									author: {
										extras: {
											sql: sql`SELECT 1`.mapWith(Number),
											sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
										},
										where: {
											RAW: sql`false`,
										},
									},
									authors: {
										extras: {
											sql: sql`SELECT 1`.mapWith(Number),
											sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
										},
										where: {
											RAW: sql`false`,
										},
									},
								},
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
							posts: {
								with: {
									author: {
										extras: {
											sql: sql`SELECT 1`.mapWith(Number),
											sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
										},
									},
									authors: {
										extras: {
											sql: sql`SELECT 1`.mapWith(Number),
											sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
										},
									},
								},
								extras: {
									sql: sql`SELECT 1`.mapWith(Number),
									sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
								},
							},
						},
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					});

					expect(nested1).toStrictEqual(
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
							post: {
								author: null,
								authorId: 1,
								authors: [],
								content: 'p1',
								id: 1,
								sql: 1,
								sqlWrapper: 2,
							},
							posts: {
								author: {
									createdAt: mappersDate,
									id: 1,
									isBanned: null,
									name: 'First',
									sql: 1,
									sqlWrapper: 2,
								},
								authorId: 1,
								authors: [
									{
										createdAt: mappersDate,
										id: 1,
										isBanned: null,
										name: 'First',
										sql: 1,
										sqlWrapper: 2,
									},
								],
								content: 'p1',
								id: 1,
								sql: 1,
								sqlWrapper: 2,
							},
							sql: 1,
							sqlWrapper: 2,
						},
					);
					expect(nested2).toStrictEqual([
						{
							createdAt: mappersDate,
							id: 1,
							isBanned: null,
							name: 'First',
							post: {
								author: null,
								authorId: 1,
								authors: [],
								content: 'p1',
								id: 1,
								sql: 1,
								sqlWrapper: 2,
							},
							posts: {
								author: {
									createdAt: mappersDate,
									id: 1,
									isBanned: null,
									name: 'First',
									sql: 1,
									sqlWrapper: 2,
								},
								authorId: 1,
								authors: [
									{
										createdAt: mappersDate,
										id: 1,
										isBanned: null,
										name: 'First',
										sql: 1,
										sqlWrapper: 2,
									},
								],
								content: 'p1',
								id: 1,
								sql: 1,
								sqlWrapper: 2,
							},
							sql: 1,
							sqlWrapper: 2,
						},
						{
							createdAt: mappersDate,
							id: 2,
							isBanned: true,
							name: 'Second',
							post: null,
							posts: null,
							sql: 1,
							sqlWrapper: 2,
						},
						{
							createdAt: mappersDate,
							id: 3,
							isBanned: null,
							name: 'Third',
							post: null,
							posts: null,
							sql: 1,
							sqlWrapper: 2,
						},
					]);
				}));

			it.effect(`Mappers - JsonObject: field kinds${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jo_kinds_users_jit' : 'jo_kinds_users') as 'jo_kinds_users', (t) => ({
						id: t.int('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
						meta: t.json('meta').$type<{ tags: string[] }>(),
					}));
					const posts = mysqlTable((jit ? 'jo_kinds_posts_jit' : 'jo_kinds_posts') as 'jo_kinds_posts', (t) => ({
						id: t.int('id').primaryKey(),
						authorId: t.int('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const res = yield* db.select({
						id: users.id,
						object: sql.jsonObject({
							id: users.id,
							name: users.name,
							bio: users.bio,
							createdAt: users.createdAt,
							meta: users.meta,
							upperName: sql<string>`upper(${users.name})`.as('upper_name'),
							doubleId: sql`${users.id} * 2`.mapWith(Number),
							mappedCreatedAt: sql`${users.createdAt}`.mapWith(users.createdAt),
							postCount: db.select({ count: count().as('count') }).from(posts).where(eq(posts.authorId, users.id)).as(
								'post_count',
							),
							nested: sql.jsonObject({
								createdAt: users.createdAt,
								deeper: sql.jsonObject({ name: users.name, meta: users.meta }),
							}),
						}),
						aliased: sql.jsonObject({ name: users.name, createdAt: users.createdAt }).as('aliased'),
						table: sql.jsonObject(users),
					}).from(users).orderBy(users.id);

					expectTypeOf(res).toEqualTypeOf<{
						id: number;
						object: {
							id: number;
							name: string;
							bio: string | null;
							createdAt: Date;
							meta: { tags: string[] } | null;
							upperName: string;
							doubleId: number;
							mappedCreatedAt: Date;
							postCount: number | null;
							nested: {
								createdAt: Date;
								deeper: { name: string; meta: { tags: string[] } | null };
							};
						};
						aliased: { name: string; createdAt: Date };
						table: {
							id: number;
							name: string;
							bio: string | null;
							createdAt: Date;
							meta: { tags: string[] } | null;
						};
					}[]>();

					expect(res).toStrictEqual([{
						id: 1,
						object: {
							id: 1,
							name: 'First',
							bio: null,
							createdAt: mappersDate,
							meta: { tags: ['a', 'b'] },
							upperName: 'FIRST',
							doubleId: 2,
							mappedCreatedAt: mappersDate,
							postCount: 2,
							nested: {
								createdAt: mappersDate,
								deeper: { name: 'First', meta: { tags: ['a', 'b'] } },
							},
						},
						aliased: { name: 'First', createdAt: mappersDate },
						table: jsonObjectUsers[0]!,
					}, {
						id: 2,
						object: {
							id: 2,
							name: 'Second',
							bio: 'About',
							createdAt: mappersDate,
							meta: null,
							upperName: 'SECOND',
							doubleId: 4,
							mappedCreatedAt: mappersDate,
							postCount: 0,
							nested: {
								createdAt: mappersDate,
								deeper: { name: 'Second', meta: null },
							},
						},
						aliased: { name: 'Second', createdAt: mappersDate },
						table: jsonObjectUsers[1]!,
					}]);

					// Legacy custom column JSON api, used both directly and as a decoder of an expression
					const customText = customType<{ data: string; driverData: string; jsonData: string }>({
						dataType: () => 'text',
						forJsonSelect: (identifier, sql) => sql`upper(${identifier})`,
						fromJson: (value) => `json:${value}`,
					});
					const customs = mysqlTable((jit ? 'jo_kinds_custom_jit' : 'jo_kinds_custom') as 'jo_kinds_custom', {
						value: customText('value').notNull(),
					});

					yield* push(db, { customs });
					yield* db.insert(customs).values({ value: 'nick' });

					const customRes = yield* db.select({
						plain: customs.value,
						object: sql.jsonObject({
							direct: customs.value,
							mapped: sql`${customs.value}`.mapWith(customs.value),
						}),
					}).from(customs);

					expectTypeOf(customRes).toEqualTypeOf<{ plain: string; object: { direct: string; mapped: string } }[]>();
					expect(customRes).toStrictEqual([{ plain: 'nick', object: { direct: 'json:NICK', mapped: 'json:NICK' } }]);
				}));

			it.effect(`Mappers - JsonObject: join nullability${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jo_joins_users_jit' : 'jo_joins_users') as 'jo_joins_users', (t) => ({
						id: t.int('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
						meta: t.json('meta').$type<{ tags: string[] }>(),
					}));
					const posts = mysqlTable((jit ? 'jo_joins_posts_jit' : 'jo_joins_posts') as 'jo_joins_posts', (t) => ({
						id: t.int('id').primaryKey(),
						authorId: t.int('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const left = yield* db.select({
						post: sql.jsonObject({ id: posts.id, title: posts.title }),
						author: sql.jsonObject({ id: users.id, name: users.name, bio: users.bio }),
						aliased: sql.jsonObject({ name: users.name, createdAt: users.createdAt }).as('aliased'),
					}).from(posts).leftJoin(users, eq(users.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(left).toEqualTypeOf<{
						post: { id: number; title: string };
						author: { id: number | null; name: string | null; bio: string | null };
						aliased: { name: string | null; createdAt: Date | null };
					}[]>();

					expect(left).toStrictEqual([{
						post: { id: 1, title: 'P1' },
						author: { id: 1, name: 'First', bio: null },
						aliased: { name: 'First', createdAt: mappersDate },
					}, {
						post: { id: 2, title: 'P2' },
						author: { id: 1, name: 'First', bio: null },
						aliased: { name: 'First', createdAt: mappersDate },
					}, {
						post: { id: 3, title: 'Orphan' },
						author: { id: null, name: null, bio: null },
						aliased: { name: null, createdAt: null },
					}]);

					const right = yield* db.select({
						post: sql.jsonObject({ id: posts.id, title: posts.title }),
						author: sql.jsonObject({ id: users.id, name: users.name }),
					}).from(posts).rightJoin(users, eq(users.id, posts.authorId)).orderBy(users.id, posts.id);

					expectTypeOf(right).toEqualTypeOf<{
						post: { id: number | null; title: string | null };
						author: { id: number; name: string };
					}[]>();

					expect(right).toStrictEqual([{
						post: { id: 1, title: 'P1' },
						author: { id: 1, name: 'First' },
					}, {
						post: { id: 2, title: 'P2' },
						author: { id: 1, name: 'First' },
					}, {
						post: { id: null, title: null },
						author: { id: 2, name: 'Second' },
					}]);

					const inner = yield* db.select({
						post: sql.jsonObject({ title: posts.title }),
						author: sql.jsonObject({ name: users.name }),
					}).from(posts).innerJoin(users, eq(users.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(inner).toEqualTypeOf<{
						post: { title: string };
						author: { name: string };
					}[]>();

					expect(inner).toStrictEqual([
						{ post: { title: 'P1' }, author: { name: 'First' } },
						{ post: { title: 'P2' }, author: { name: 'First' } },
					]);
				}));

			it.effect(`Mappers - JsonObject: automatic selection${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jo_auto_users_jit' : 'jo_auto_users') as 'jo_auto_users', (t) => ({
						id: t.int('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
						meta: t.json('meta').$type<{ tags: string[] }>(),
					}));
					const posts = mysqlTable((jit ? 'jo_auto_posts_jit' : 'jo_auto_posts') as 'jo_auto_posts', (t) => ({
						id: t.int('id').primaryKey(),
						authorId: t.int('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const sq = db.select({
						id: users.id,
						profile: sql.jsonObject({ name: users.name, createdAt: users.createdAt, meta: users.meta }).as('profile'),
					}).from(users).as('sq');

					const fromSubquery = yield* db.select().from(sq).orderBy(sq.id);

					expectTypeOf(fromSubquery).toEqualTypeOf<{
						id: number;
						profile: { name: string; createdAt: Date; meta: { tags: string[] } | null };
					}[]>();

					expect(fromSubquery).toStrictEqual([
						{ id: 1, profile: { name: 'First', createdAt: mappersDate, meta: { tags: ['a', 'b'] } } },
						{ id: 2, profile: { name: 'Second', createdAt: mappersDate, meta: null } },
					]);

					const joined = yield* db.select().from(posts).leftJoin(sq, eq(sq.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(joined).toEqualTypeOf<{
						jo_auto_posts: { id: number; authorId: number | null; title: string };
						sq: {
							id: number;
							profile: { name: string; createdAt: Date; meta: { tags: string[] } | null };
						} | null;
					}[]>();

					expect(joined).toStrictEqual([{
						[getTableName(posts)]: jsonObjectPosts[0]!,
						sq: { id: 1, profile: { name: 'First', createdAt: mappersDate, meta: { tags: ['a', 'b'] } } },
					}, {
						[getTableName(posts)]: jsonObjectPosts[1]!,
						sq: { id: 1, profile: { name: 'First', createdAt: mappersDate, meta: { tags: ['a', 'b'] } } },
					}, {
						[getTableName(posts)]: jsonObjectPosts[2]!,
						sq: null,
					}]);
				}));

			it.effect(`Mappers - JsonObject: selection from subquery${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jo_sq_users_jit' : 'jo_sq_users') as 'jo_sq_users', (t) => ({
						id: t.int('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
						meta: t.json('meta').$type<{ tags: string[] }>(),
					}));
					const posts = mysqlTable((jit ? 'jo_sq_posts_jit' : 'jo_sq_posts') as 'jo_sq_posts', (t) => ({
						id: t.int('id').primaryKey(),
						authorId: t.int('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const sq = db.select({
						id: posts.id,
						title: posts.title,
						author: sql.jsonObject({ id: users.id, name: users.name, createdAt: users.createdAt }).as('author'),
					}).from(posts).leftJoin(users, eq(users.id, posts.authorId)).as('sq');

					const res = yield* db.select({
						title: sq.title,
						author: sq.author,
						wrapped: sql.jsonObject({ title: sq.title, author: sq.author }),
					}).from(sq).orderBy(sq.id);

					expectTypeOf(res).toEqualTypeOf<{
						title: string;
						author: { id: number | null; name: string | null; createdAt: Date | null };
						wrapped: {
							title: string;
							author: { id: number | null; name: string | null; createdAt: Date | null };
						};
					}[]>();

					const first = { id: 1, name: 'First', createdAt: mappersDate };
					const none = { id: null, name: null, createdAt: null };
					expect(res).toStrictEqual([
						{ title: 'P1', author: first, wrapped: { title: 'P1', author: first } },
						{ title: 'P2', author: first, wrapped: { title: 'P2', author: first } },
						{ title: 'Orphan', author: none, wrapped: { title: 'Orphan', author: none } },
					]);

					const unaliased = db.select({ object: sql.jsonObject({ id: users.id }) }).from(users).as('unaliased');
					expect(() => unaliased.object).toThrowError(
						'You tried to reference "object" field from a subquery, which is an un-aliased JSON object field. Please add an alias to the field using ".as(\'alias\')" method.',
					);
				}));

			it.effect(`Mappers - JsonObject: selection from $with subquery${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable((jit ? 'jo_with_users_jit' : 'jo_with_users') as 'jo_with_users', (t) => ({
						id: t.int('id').primaryKey(),
						name: t.text('name').notNull(),
						bio: t.text('bio'),
						createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
						meta: t.json('meta').$type<{ tags: string[] }>(),
					}));
					const posts = mysqlTable((jit ? 'jo_with_posts_jit' : 'jo_with_posts') as 'jo_with_posts', (t) => ({
						id: t.int('id').primaryKey(),
						authorId: t.int('author_id'),
						title: t.text('title').notNull(),
					}));

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const w = db.$with('w').as(
						db.select({
							id: users.id,
							profile: sql.jsonObject({ name: users.name, meta: users.meta }).as('profile'),
						}).from(users),
					);

					const all = yield* db.with(w).select().from(w).orderBy(w.id);

					expectTypeOf(all).toEqualTypeOf<{
						id: number;
						profile: { name: string; meta: { tags: string[] } | null };
					}[]>();

					expect(all).toStrictEqual([
						{ id: 1, profile: { name: 'First', meta: { tags: ['a', 'b'] } } },
						{ id: 2, profile: { name: 'Second', meta: null } },
					]);

					const joined = yield* db.with(w).select({
						title: posts.title,
						profile: w.profile,
						wrapped: sql.jsonObject({ title: posts.title, profile: w.profile }),
					}).from(posts).leftJoin(w, eq(w.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(joined).toEqualTypeOf<{
						title: string;
						profile: { name: string; meta: { tags: string[] } | null } | null;
						wrapped: {
							title: string;
							profile: { name: string; meta: { tags: string[] } | null } | null;
						};
					}[]>();

					const first = { name: 'First', meta: { tags: ['a', 'b'] } };
					expect(joined).toStrictEqual([
						{ title: 'P1', profile: first, wrapped: { title: 'P1', profile: first } },
						{ title: 'P2', profile: first, wrapped: { title: 'P2', profile: first } },
						{ title: 'Orphan', profile: null, wrapped: { title: 'Orphan', profile: null } },
					]);
				}));

			it.effect(`Mappers - JsonObject: joined subquery${jit ? ' - Jit mappers' : ''}`, () =>
				Effect.gen(function*() {
					const users = mysqlTable(
						(jit ? 'jo_joined_sq_users_jit' : 'jo_joined_sq_users') as 'jo_joined_sq_users',
						(t) => ({
							id: t.int('id').primaryKey(),
							name: t.text('name').notNull(),
							bio: t.text('bio'),
							createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
							meta: t.json('meta').$type<{ tags: string[] }>(),
						}),
					);
					const posts = mysqlTable(
						(jit ? 'jo_joined_sq_posts_jit' : 'jo_joined_sq_posts') as 'jo_joined_sq_posts',
						(t) => ({
							id: t.int('id').primaryKey(),
							authorId: t.int('author_id'),
							title: t.text('title').notNull(),
						}),
					);

					const db = yield* createDB({ users, posts }, () => ({}), jit);
					yield* push(db, { users, posts });
					yield* db.insert(users).values(jsonObjectUsers);
					yield* db.insert(posts).values(jsonObjectPosts);

					const first = { id: 1, name: 'First', createdAt: mappersDate };

					const sq = db.select({
						id: users.id,
						author: sql.jsonObject({ id: users.id, name: users.name, createdAt: users.createdAt }).as('author'),
					}).from(users).as('sq');

					const left = yield* db.select({
						title: posts.title,
						author: sq.author,
						wrapped: sql.jsonObject({ title: posts.title, author: sq.author }),
					}).from(posts).leftJoin(sq, eq(sq.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(left).toEqualTypeOf<{
						title: string;
						author: { id: number; name: string; createdAt: Date } | null;
						wrapped: { title: string; author: { id: number; name: string; createdAt: Date } | null };
					}[]>();

					expect(left).toStrictEqual([
						{ title: 'P1', author: first, wrapped: { title: 'P1', author: first } },
						{ title: 'P2', author: first, wrapped: { title: 'P2', author: first } },
						{ title: 'Orphan', author: null, wrapped: { title: 'Orphan', author: null } },
					]);

					const inner = yield* db.select({
						title: posts.title,
						author: sq.author,
					}).from(posts).innerJoin(sq, eq(sq.id, posts.authorId)).orderBy(posts.id);

					expectTypeOf(inner).toEqualTypeOf<{
						title: string;
						author: { id: number; name: string; createdAt: Date };
					}[]>();

					expect(inner).toStrictEqual([
						{ title: 'P1', author: first },
						{ title: 'P2', author: first },
					]);

					const lateralSq = db.select({
						author: sql.jsonObject({ id: users.id, name: users.name, createdAt: users.createdAt }).as('author'),
					}).from(users).where(eq(users.id, posts.authorId)).as('lateral_sq');

					const lateral = yield* db.select().from(posts).leftJoinLateral(lateralSq, sql`true`).orderBy(posts.id);

					expectTypeOf(lateral).toEqualTypeOf<{
						jo_joined_sq_posts: { id: number; authorId: number | null; title: string };
						lateral_sq: { author: { id: number; name: string; createdAt: Date } } | null;
					}[]>();

					expect(lateral).toStrictEqual([
						{ [getTableName(posts)]: jsonObjectPosts[0]!, lateral_sq: { author: first } },
						{ [getTableName(posts)]: jsonObjectPosts[1]!, lateral_sq: { author: first } },
						{ [getTableName(posts)]: jsonObjectPosts[2]!, lateral_sq: null },
					]);

					const scalar = yield* db.select({
						title: posts.title,
						author: db.select({
							author: sql.jsonObject({ id: users.id, name: users.name, createdAt: users.createdAt }).as('author'),
						}).from(users).where(eq(users.id, posts.authorId)).as('author'),
					}).from(posts).orderBy(posts.id);

					expectTypeOf(scalar).toEqualTypeOf<{
						title: string;
						author: { id: number; name: string; createdAt: Date } | null;
					}[]>();

					expect(scalar).toStrictEqual([
						{ title: 'P1', author: first },
						{ title: 'P2', author: first },
						{ title: 'Orphan', author: null },
					]);
				}));
		}

		// https://github.com/drizzle-team/drizzle-orm/issues/4464
		it.effect('db.execute modes', () =>
			Effect.gen(function*() {
				const db = yield* DB;

				const users = mysqlTable('users_execute_modes_1', (t) => ({
					id: t.int().primaryKey(),
					name: t.text().notNull(),
				}));

				yield* push(db, { users });

				yield* db.insert(users).values([
					{
						id: 1,
						name: 'First',
					},
					{
						id: 2,
						name: 'Second',
					},
				]);

				const rObj = yield* db.execute<{ id: number; name: string }>(
					sql`select ${users.id}, ${users.name} from ${users} order by ${users.id}`,
					'objects',
				);
				const rArr = yield* db.execute<[number, string]>(
					sql`select ${users.id}, ${users.name} from ${users} order by ${users.id}`,
					'arrays',
				);

				expectTypeOf(rObj).toEqualTypeOf<{ id: number; name: string }[]>();
				expectTypeOf(rArr).toEqualTypeOf<[number, string][]>();

				expect(rObj).toStrictEqual([
					{
						id: 1,
						name: 'First',
					},
					{
						id: 2,
						name: 'Second',
					},
				]);
				expect(rArr).toStrictEqual([[1, 'First'], [2, 'Second']]);
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/5001
		// https://github.com/drizzle-team/drizzle-orm/issues/5309
		it.effect('insert with explicit column list', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = mysqlTable('column_selection', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
					note: text('note'),
				});

				yield* push(db, { table });

				yield* db.insert(table, 'name').values([{ name: 'John' }, { name: 'Jane' }]);
				yield* db.insert(table, 'name', 'note').values({ name: 'Jack' });
				yield* db.insert(table, 'note', 'name').values({ name: 'Jill', note: 'hi' });

				const result = yield* db.select().from(table).orderBy(table.id);
				expect(result).toStrictEqual([
					{ id: 1, name: 'John', verified: false, note: null },
					{ id: 2, name: 'Jane', verified: false, note: null },
					{ id: 3, name: 'Jack', verified: false, note: null },
					{ id: 4, name: 'Jill', verified: false, note: 'hi' },
				]);
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/5001
		// https://github.com/drizzle-team/drizzle-orm/issues/5309
		it.effect('insert with explicit column list - select', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const src = mysqlTable('column_selection_select_src', {
					id: int('id').primaryKey(),
					name: text('name').notNull(),
				});
				const dst = mysqlTable('column_selection_select_dst', {
					id: serial('id').primaryKey(),
					name: text('name').notNull(),
					verified: boolean('verified').notNull().default(false),
				});

				yield* push(db, { src, dst });

				yield* db.insert(src).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);

				yield* db.insert(dst, 'name').select(db.select({ name: src.name }).from(src).orderBy(src.id));

				const result = yield* db.select().from(dst).orderBy(dst.id);
				expect(result).toStrictEqual([
					{ id: 1, name: 'John', verified: false },
					{ id: 2, name: 'Jane', verified: false },
				]);
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/5001
		// https://github.com/drizzle-team/drizzle-orm/issues/5309
		it.effect('insert with explicit column list - on duplicate key update', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const table = mysqlTable('column_selection_conflict', {
					id: int('id').primaryKey(),
					name: text('name').notNull(),
					note: text('note'),
				});

				yield* push(db, { table });

				yield* db.insert(table, 'id', 'name').values({ id: 1, name: 'John' });
				yield* db
					.insert(table, 'id', 'name')
					.values({ id: 1, name: 'Jane' })
					.onDuplicateKeyUpdate({ set: { name: 'Updated' } });

				const result = yield* db.select().from(table);
				expect(result).toStrictEqual([{ id: 1, name: 'Updated', note: null }]);
			}));

		it.effect('Default value priority', () =>
			Effect.gen(function*() {
				const db = yield* DB;
				const exTbl = mysqlTable('no_default_override', (t) => ({
					id: t.int().primaryKey(),
					defSql: t.int('def_sql').default(sql`1`),
					defNum: t.int('def_num').default(1),
					defFn: t.int('def_fn').$defaultFn(() => 1),
					defUpdFn: t.int('def_upd_fn').$onUpdateFn(() => 1),
					defMix1: t.int('def_mix1').default(1).$defaultFn(() => 2).$onUpdateFn(() => 3),
					defMix2: t.int('def_mix2').$defaultFn(() => 2).$onUpdateFn(() => 3),
					defMix3: t.int('def_mix3').default(1).$defaultFn(() => 2),
					defMix4: t.int('def_mix4').default(sql`1`).$onUpdateFn(() => 3),
				}));

				yield* push(db, { exTbl });

				yield* db.insert(exTbl).values({ id: 1 });

				const res = yield* db.select().from(exTbl);

				expect(res).toStrictEqual([{
					id: 1,
					defSql: 1,
					defNum: 1,
					defFn: 1,
					defUpdFn: 1,
					defMix1: 2,
					defMix2: 2,
					defMix3: 2,
					defMix4: 1,
				}]);
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/5939
		it.effect('Query error params', () =>
			Effect.gen(function*() {
				for (const paramsInErrors of [undefined, false, true]) {
					const db = yield* MySqlDrizzle.make({ paramsInErrors }).pipe(Effect.provide(MySqlDrizzle.DefaultServices));

					const error: any = yield* db.execute(sql`select * from params_in_errors_missing where id = ${'S3CRET'}`).pipe(
						Effect.flip,
					);

					expect(error._tag).toBe('EffectDrizzleQueryError');
					expect(error.params).toStrictEqual(paramsInErrors ? ['S3CRET'] : undefined);
					expect(error.message).toBe(
						paramsInErrors ? `Failed query: ${error.query}\nparams: S3CRET` : `Failed query: ${error.query}`,
					);
				}
			}));

		// https://github.com/drizzle-team/drizzle-orm/issues/5939
		it.effect('Query error params - transaction', () =>
			Effect.gen(function*() {
				for (const paramsInErrors of [undefined, false, true]) {
					const db = yield* MySqlDrizzle.make({ paramsInErrors }).pipe(Effect.provide(MySqlDrizzle.DefaultServices));

					const error: any = yield* db.transaction((tx) =>
						tx.execute(sql`select * from params_in_errors_missing where id = ${'S3CRET'}`)
					).pipe(Effect.flip);

					expect(error._tag).toBe('EffectDrizzleQueryError');
					expect(error.params).toStrictEqual(paramsInErrors ? ['S3CRET'] : undefined);
					expect(error.message).toBe(
						paramsInErrors ? `Failed query: ${error.query}\nparams: S3CRET` : `Failed query: ${error.query}`,
					);
				}
			}));

		addTests?.(it);
	});
};

export * as relations from './relations';
export { rqbPost, rqbUser } from './schema';
