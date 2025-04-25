import mssql from 'mssql';
import { drizzle } from '~/node-mssql/index.ts';

const pool = await mssql.connect({} as mssql.config);

export const db = drizzle(pool);

{
	drizzle(pool);
	drizzle(pool, { schema: {} });
}
