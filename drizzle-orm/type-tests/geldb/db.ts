import * as edgedb from 'edgedb';
import { drizzle } from '~/gel/index.ts';

export const db = drizzle(edgedb.createClient());
