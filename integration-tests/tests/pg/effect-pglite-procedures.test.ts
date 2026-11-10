import { PgliteClient } from '@effect/sql-pglite';
import { sql } from 'drizzle-orm';
import * as PgDrizzle from 'drizzle-orm/effect-pglite';
import { pgSchema, procedure } from 'drizzle-orm/pg-core';
import * as Effect from 'effect/Effect';
import { expect, test } from 'vitest';

// The procedure bodies never run in JS; drizzle-kit compiles them. The SQL below is that compiled
// shape (schema-qualified, result as a quoted INOUT parameter defaulting to NULL).
const billing = pgSchema('billing');

const charge = billing.procedure('charge', { amount: 'int', fee: { type: 'int', default: 1 } }, ({ args }) => {
	return { total: args.amount + args.fee };
});

const noop = procedure('noop', {}, () => {});

const run = <A, E>(effect: Effect.Effect<A, E, PgliteClient.PgliteClient>) =>
	Effect.runPromise(effect.pipe(Effect.provide(PgliteClient.layer({ dataDir: 'memory://' }))) as Effect.Effect<A, E>);

test('effect db.call: schema-qualified procedure with a defaulted argument', async () => {
	const result = await run(Effect.gen(function*() {
		const db = yield* PgDrizzle.make().pipe(Effect.provide(PgDrizzle.DefaultServices));
		yield* db.execute(sql`create schema "billing"`);
		yield* db.execute(sql.raw(`
			CREATE OR REPLACE PROCEDURE "billing".charge(p_amount integer, p_fee integer DEFAULT 1, INOUT "total" integer DEFAULT NULL)
			LANGUAGE plpgsql
			AS $$
			#variable_conflict use_column
			BEGIN
			  "total" := p_amount + p_fee;
			  RETURN;
			END;
			$$
		`));
		yield* db.execute(sql`create procedure noop() language plpgsql as $$ begin end $$`);

		return {
			defaulted: yield* db.call(charge, { amount: 10 }),
			explicit: yield* db.call(charge, { amount: 10, fee: 5 }),
			nothing: yield* db.call(noop),
		};
	}));

	expect(result).toStrictEqual({ defaulted: { total: 11 }, explicit: { total: 15 }, nothing: undefined });
});
