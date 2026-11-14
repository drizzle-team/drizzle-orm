// @drizzle-team/postgres/effect/aurora live: DrizzleAuroraClient against a Data API. Uses the env of aurora.test.ts
// (a real cluster, or koxudaxi/local-data-api from `bash compose/dockers.sh up postgres aws-data-api` with
// AURORA_DATA_API_ENDPOINT=http://localhost:8081), and skips when the ARNs are unset.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Effect, Exit, Redacted } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { connect } from '../../src/aurora.ts';
import { DrizzleAuroraClient } from '../../src/effect/aurora.ts';

const READY = !!(process.env.AURORA_RESOURCE_ARN && process.env.AURORA_SECRET_ARN);
const TBL = 'effect_aurora_test';

const config = (): DrizzleAuroraClient.DrizzleAuroraClientConfig => {
	const hasEnvCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
	return {
		resourceArn: process.env.AURORA_RESOURCE_ARN!,
		secretArn: process.env.AURORA_SECRET_ARN!,
		database: process.env.AURORA_DATABASE || undefined,
		endpoint: process.env.AURORA_DATA_API_ENDPOINT || undefined,
		// real AWS reads AWS_* from env; the emulator ignores signing, so supply dummies when none are set
		credentials: hasEnvCreds
			? undefined
			: { accessKeyId: 'localtest', secretAccessKey: Redacted.make('localtest') },
	};
};
const run = <A, E>(effect: Effect.Effect<A, E, DrizzleAuroraClient.DrizzleAuroraClient | SqlClient>) =>
	Effect.runPromise(Effect.provide(effect, DrizzleAuroraClient.layer(config())));
const ids = () =>
	run(Effect.gen(function*() {
		const sql = yield* SqlClient;
		const rows = yield* sql<{ id: number }>`select id from ${sql(TBL)} order by id`;
		return rows.map((r) => r.id);
	}));

describe.skipIf(!READY)('DrizzleAuroraClient over the Data API', () => {
	beforeAll(async () => {
		const db = await connect({ ...config(), credentials: { accessKeyId: 'localtest', secretAccessKey: 'localtest' } });
		await db.query(`drop table if exists ${TBL}`);
		await db.query(`create table ${TBL} (id int primary key, name text)`);
	}, 30000);
	afterAll(async () => {
		const db = await connect({ ...config(), credentials: { accessKeyId: 'localtest', secretAccessKey: 'localtest' } });
		await db.query(`drop table if exists ${TBL}`).catch(() => {});
	});

	test('withTransaction commits, rolls back, and a nested one rolls back to its savepoint', async () => {
		await run(Effect.gen(function*() {
			const sql = yield* SqlClient;
			yield* sql.withTransaction(sql`insert into ${sql(TBL)} values (1, 'committed')`);
			yield* sql.withTransaction(Effect.andThen(sql`insert into ${sql(TBL)} values (2, 'dropped')`, Effect.fail('no')))
				.pipe(Effect.ignore);
			yield* sql.withTransaction(Effect.gen(function*() {
				yield* sql`insert into ${sql(TBL)} values (3, 'outer')`;
				yield* sql.withTransaction(Effect.andThen(sql`insert into ${sql(TBL)} values (4, 'inner')`, Effect.fail('no')))
					.pipe(Effect.ignore);
			}));
		}));
		expect(await ids()).toEqual([1, 3]);
	}, 30000);

	test('a statement in the transaction sees its uncommitted rows; one outside does not', async () => {
		let seen: unknown;
		const outcome = await run(Effect.gen(function*() {
			const client = yield* DrizzleAuroraClient.DrizzleAuroraClient;
			const sql = yield* SqlClient;
			return yield* sql.withTransaction(Effect.gen(function*() {
				yield* client.query(`insert into ${TBL} values (:p1, :p2)`, [10, 'pending']);
				const inside = yield* client.query(`select count(*)::int as n from ${TBL} where id = 10`, [], {
					mode: 'object',
				});
				const outside = yield* Effect.promise(async () => {
					const db = await connect({
						...config(),
						credentials: { accessKeyId: 'localtest', secretAccessKey: 'localtest' },
					});
					return (await db.query(`select count(*)::int as n from ${TBL} where id = 10`, [], { mode: 'object' })).rows;
				});
				seen = [inside.rows, outside];
				return yield* Effect.fail('roll back' as const);
			})).pipe(Effect.catch((e) => Effect.succeed(e)));
		}));
		expect(outcome).toBe('roll back');
		expect(seen).toEqual([[{ n: 1 }], [{ n: 0 }]]);
		expect(await ids()).not.toContain(10);
	}, 30000);

	test('batch is all or nothing; batchExecute writes every parameter set', async () => {
		const exit = await run(Effect.exit(Effect.gen(function*() {
			const client = yield* DrizzleAuroraClient.DrizzleAuroraClient;
			yield* client.batchExecute(`insert into ${TBL} values (:p1, :p2)`, [[20, 'a'], [21, 'b']]);
			return yield* client.batch([
				client.query(`insert into ${TBL} values (30, 'x')`),
				client.query(`insert into ${TBL} values (20, 'duplicate')`),
			]);
		})));
		expect(Exit.isFailure(exit)).toBe(true);
		const rows = await ids();
		expect(rows).toContain(20);
		expect(rows).toContain(21);
		expect(rows).not.toContain(30);
	}, 30000);
});
