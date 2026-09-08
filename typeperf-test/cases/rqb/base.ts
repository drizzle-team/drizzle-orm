/* eslint-disable unused-imports/no-unused-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../lib/big-schema.ts';

export const db = drizzle({
	connection: 'postgres:/...',
});
