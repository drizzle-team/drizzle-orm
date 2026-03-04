import * as gel from 'gel';
import { drizzle } from '~/gel/index.ts';

export const db = drizzle({ client: gel.createClient() });
