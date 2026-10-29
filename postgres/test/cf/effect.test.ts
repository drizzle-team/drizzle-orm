// The Effect entry point inside real workerd.
import { Effect, Layer, Redacted } from 'effect';
import { SqlClient } from 'effect/sql/SqlClient';
import { expect, it } from 'vitest';
import { createPool } from '../../src/cf.ts';
import { DrizzlePostgresClient, DrizzlePostgresTransport } from '../../src/effect/cf.ts';
import { DrizzlePostgresClient as CoreClient } from '../../src/effect/core.ts';

const CFG = { host: '127.0.0.1', port: 54329, user: 'postgres', password: 'postgres', database: 'testdb' };
const EFFECT_CFG = {
	host: CFG.host,
	port: CFG.port,
	database: CFG.database,
	username: CFG.user,
	password: Redacted.make(CFG.password),
};
const select = Effect.gen(function*() {
	const sql = yield* SqlClient;
	return yield* sql<{ n: number; t: string }>`select 1 as n, ${'hi'}::text as t`;
});

it('builds the layer from a ./cf pool and runs a sql select', async () => {
	const pool = createPool(CFG);
	try {
		const rows = await Effect.runPromise(select.pipe(Effect.provide(CoreClient.layerFromPool(pool))));
		expect(rows).toEqual([{ n: 1, t: 'hi' }]);
	} finally {
		await pool.end();
	}
});

// Only cloudflare:sockets can open a socket in workerd, so the ./effect/cf layer must include the cf transport.
it('the ./effect/cf layer includes its transport and runs a sql select', async () => {
	const rows = await Effect.runPromise(select.pipe(Effect.provide(DrizzlePostgresClient.layer(EFFECT_CFG))));
	expect(rows).toEqual([{ n: 1, t: 'hi' }]);
});

it('the ./effect/core layer runs a sql select with the cf transport layer', async () => {
	const layer = CoreClient.layer(EFFECT_CFG).pipe(Layer.provide(DrizzlePostgresTransport.layer));
	const rows = await Effect.runPromise(select.pipe(Effect.provide(layer)));
	expect(rows).toEqual([{ n: 1, t: 'hi' }]);
});

it('./effect/cf exposes the whole ./effect/core client namespace', () => {
	const missing = Object.keys(CoreClient).filter((k) => !(k in DrizzlePostgresClient));
	expect(missing).toEqual([]);
	expect(DrizzlePostgresClient.layer).not.toBe(CoreClient.layer);
	expect(DrizzlePostgresClient.makeCompiler).toBe(CoreClient.makeCompiler);
});
