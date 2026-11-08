import type * as Effect from 'effect/Effect';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { EffectPgDatabase } from '~/effect-postgres/index.ts';
import { bigint, numeric, pgSchema, pgTable, procedure, type text } from '~/pg-core/index.ts';
import { db } from './db.ts';

const accounts = pgTable('accounts', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	balance: numeric('balance', { mode: 'number' }).notNull(),
});

// `numeric` is both the column builder (above) and the annotation type (below).
const transfer = procedure('transfer', { from: 'bigint', amount: 'numeric', memo: { type: 'text', default: null } }, (
	{ args, sql },
) => {
	Expect<Equal<{ readonly from: number; readonly amount: number; readonly memo: string | null }, typeof args>>();
	const row = sql`select ${accounts.balance} from ${accounts} where ${accounts.id} = ${args.from}`.one<
		{ balance: numeric; note: text }
	>();
	return { newBalance: row.balance, note: row.note };
});

const touch = procedure('touch', { id: 'int' }, ({ args, sql }) => {
	sql`update ${accounts} set ${accounts.balance} = 0 where ${accounts.id} = ${args.id}`;
});

const noArgs = procedure('no_args', {}, () => {});

async function calls() {
	// Defaulted parameters are optional; results are raw driver values (no codecs on CALL).
	const result = await db.call(transfer, { from: 1, amount: 30 });
	Expect<Equal<{ newBalance: number | bigint | string; note: string }, typeof result>>();

	const nothing = await db.call(touch, { id: 1 });
	Expect<Equal<void, typeof nothing>>();

	await db.call(noArgs);

	// @ts-expect-error - required argument missing
	await db.call(transfer, { from: 1 });
	// @ts-expect-error - wrong argument type
	await db.call(touch, { id: 'one' });
	// @ts-expect-error - arguments are required when the procedure has required parameters
	await db.call(touch);
}

calls;

// Schema-qualified procedures have the same typing.
const tenant = pgSchema('tenant');
const bump = tenant.procedure('bump', { id: 'bigint' }, ({ args, sql }) => {
	const row = sql`select ${args.id} as n`.one<{ n: number }>();
	return { n: row.n };
});

async function schemaCalls() {
	const result = await db.call(bump, { id: 1 });
	Expect<Equal<{ n: number | bigint | string }, typeof result>>();
}

schemaCalls;

// The Effect database returns an Effect of the same result.
declare const effectDb: EffectPgDatabase<Record<string, never>>;
const called = effectDb.call(transfer, { from: 1, amount: 30 });
Expect<Equal<{ newBalance: number | bigint | string; note: string }, Effect.Success<typeof called>>>();
// @ts-expect-error - required argument missing
effectDb.call(transfer, { from: 1 });

// Procedures drizzle-kit leaves alone: just the definition, never callable.
const legacy = procedure.unsupported('CREATE OR REPLACE PROCEDURE public.legacy() LANGUAGE sql AS $$ SELECT 1 $$');
Expect<Equal<string, typeof legacy.definition>>();
// @ts-expect-error - unsupported procedures are not callable through db.call
db.call(legacy);
