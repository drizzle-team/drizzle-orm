import { createPool } from 'mysql2/promise';
import { drizzle } from '~/mysql2';

export const db = drizzle(createPool({}));
