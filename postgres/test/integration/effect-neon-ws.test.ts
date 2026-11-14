// @drizzle-team/postgres/effect/neon-ws: DrizzlePostgresClient over Neon's WebSocket proxy. Needs NEON_WS_URL, as
// neon-ws.test.ts does (Neon's cloud, or the local proxy from `bash compose/dockers.sh up neon`).
import { describe, expect, test } from 'bun:test';
import { Effect, Redacted } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { DrizzlePostgresClient } from '../../src/effect/neon-ws.ts';
import { neonWsConfig } from '../helpers/neon.ts';

const URL = process.env.NEON_WS_URL;

describe.skipIf(!URL)('DrizzlePostgresClient over Neon WebSocket', () => {
	const layer = () => {
		const { url, ...rest } = neonWsConfig(URL!);
		return DrizzlePostgresClient.layer({ url: Redacted.make(url), ...rest });
	};

	test('queries, a transaction and a pipeline', async () => {
		const result = await Effect.runPromise(Effect.provide(
			Effect.gen(function*() {
				const sql = yield* SqlClient;
				const client = yield* DrizzlePostgresClient.DrizzlePostgresClient;
				const [one] = yield* sql<{ one: number }>`select 1 as one`;
				const inTx = yield* sql.withTransaction(sql<{ tx: boolean }>`select txid_current_if_assigned() is null as tx`);
				const piped = yield* client.pipeline([client.query('select 2'), client.query('select 3')]);
				return [one!.one, inTx[0]!.tx, piped.map((r) => r.rows[0]![0])];
			}),
			layer(),
		));
		expect(result).toEqual([1, true, [2, 3]]);
	});
});
