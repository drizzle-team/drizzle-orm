import mssql from 'mssql';
import { drizzle } from '~/node-mssql/index.ts';

const pool = new mssql.ConnectionPool({} as any);

export const db = drizzle(pool);

{
	drizzle(pool);
	drizzle(pool, { schema: {} });
}
