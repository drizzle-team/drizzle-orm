import * as gel from 'gel';
import { drizzle } from '~/gel/index.ts';

export const db = drizzle(gel.createClient());
