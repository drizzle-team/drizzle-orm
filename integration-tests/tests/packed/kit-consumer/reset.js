import { connect } from 'drizzle-orm/postgres';

const connection = await connect(process.env.PG_CONNECTION_STRING);
try {
	await connection.query('drop schema if exists packed_kit cascade');
} finally {
	await connection.end();
}
