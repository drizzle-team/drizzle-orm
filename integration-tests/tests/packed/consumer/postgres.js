import { connect, PgError } from 'drizzle-orm/postgres/client';
import { parseEwkbHex } from 'drizzle-orm/postgres/client/geometry';

const connection = await connect(process.env.PG_CONNECTION_STRING);
try {
	const error = await connection.query('select 1/0').catch((error) => error);
	const point = parseEwkbHex('0101000000000000000000f03f0000000000000040');
	console.log(JSON.stringify({ isPgError: error instanceof PgError, code: error.code, point }));
} finally {
	await connection.end();
}
