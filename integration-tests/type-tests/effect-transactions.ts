import type { EffectPgDatabase } from 'drizzle-orm/effect-postgres';
import * as Effect from 'effect/Effect';
import { expectTypeOf } from 'vitest';

declare const db: EffectPgDatabase;

// The error must stay typed when consumers use skipLibCheck.
const transaction = db.transaction(() => Effect.succeed('done'));
expectTypeOf<Effect.Error<typeof transaction>>().not.toBeAny();

const handled = transaction.pipe(Effect.catchTag('SqlError', () => Effect.succeed('handled')));
expectTypeOf(handled).toEqualTypeOf<Effect.Effect<string, never, never>>();
