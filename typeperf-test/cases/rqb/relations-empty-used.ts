/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable unused-imports/no-unused-imports */
import { defineRelations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../lib/big-schema.ts';

export const relations = defineRelations(schema);

export const db = drizzle({ connection: 'postgres:/...', relations });
