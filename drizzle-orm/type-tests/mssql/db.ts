import mssql from 'mssql';
import { drizzle } from '~/node-mssql/index.ts';

const pool = await mssql.connect({} as mssql.config);

export const db = drizzle({ client: pool });

{
	drizzle({ client: pool });
	drizzle({ client: pool, schema: {} });
}
