import { createPool } from 'mysql2/promise';
import { drizzle } from '~/mysql2/driver';

export const db = drizzle(createPool({}));
