import type { ExtractTablesFromSchema, RelationsBuilder } from 'drizzle-orm';
import type * as schema from '../../lib/big-schema.ts';

export type r = RelationsBuilder<ExtractTablesFromSchema<typeof schema>>;

export type tmp = r['_']['tables']['apiWebhook'];
