// import type { ExtractTablesFromSchema } from 'drizzle-orm';
import type { Table, View } from 'drizzle-orm';
import type * as schema from '../../lib/big-schema.ts';

type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];

// 2. Pick only those keys
type PickByValue<T, V> = Pick<T, KeysOfType<T, V>>;

// 3. Your TrimSchema is then
type TrimSchema<U> = PickByValue<U, Table | View>;

export type Tables = TrimSchema<typeof schema>;

export type A = Tables['apiWebhook']['_'];
