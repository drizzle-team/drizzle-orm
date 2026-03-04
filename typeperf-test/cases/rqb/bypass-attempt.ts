import type { ExtractTablesFromSchema, RelationsBuilder, RelationsBuilderConfig } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import type * as schema from '../../lib/big-schema.ts';

export const db = drizzle({ connection: 'postgres:/...' });

// This works without flooding instances
export type Tables = ExtractTablesFromSchema<typeof schema.tables>;
export type Config = RelationsBuilderConfig<typeof schema.tables>;
export type Builder = RelationsBuilder<typeof schema.tables>;

// However this doesn't - extracting tables from schema is a mandatory step
// export type Tables = ExtractTablesFromSchema<typeof schema>;
// export type Config = RelationsBuilderConfig<Tables>;
// export type Builder = RelationsBuilder<Tables>;
