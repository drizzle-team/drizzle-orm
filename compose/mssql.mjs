// SQL Server chores for compose/dockers.sh, which the image cannot do itself (it ships no sqlcmd):
//   node compose/mssql.mjs ready                 wait until the server on DRIZZLE_PORT_MSSQL answers a query
//   node compose/mssql.mjs drop-prefixed <p>     drop every database whose name starts with <p>
// Uses the mssql package that integration-tests installs.
import { createRequire } from 'node:module';

const mssql = createRequire(new URL('../integration-tests/package.json', import.meta.url))('mssql');

const config = {
	user: 'SA',
	password: 'drizzle123PASSWORD!',
	server: 'localhost', // not an IP: TLS warns about one as its server name
	port: Number(process.env.DRIZZLE_PORT_MSSQL ?? 1433),
	options: { encrypt: true, trustServerCertificate: true },
	connectionTimeout: 5_000,
};

const [command, argument] = process.argv.slice(2);

if (command === 'ready') {
	const deadline = Date.now() + 180_000;
	for (;;) {
		try {
			const pool = await new mssql.ConnectionPool(config).connect();
			await pool.query('select 1');
			await pool.close();
			console.log(`mssql answers on localhost:${config.port}`);
			break;
		} catch (error) {
			if (Date.now() > deadline) throw error;
			await new Promise((resolve) => setTimeout(resolve, 1_000));
		}
	}
} else if (command === 'drop-prefixed' && argument) {
	const pool = await new mssql.ConnectionPool(config).connect();
	const { recordset } = await pool.request().input('prefix', argument).query(
		`select name from sys.databases where database_id > 4 and left(name, len(@prefix)) = @prefix`,
	);
	for (const { name } of recordset) {
		const quoted = `[${name.replaceAll(']', ']]')}]`;
		// Rolls back and closes whatever a crashed test file left connected.
		await pool.query(`alter database ${quoted} set single_user with rollback immediate; drop database ${quoted};`);
		console.log(`mssql: dropped ${name}`);
	}
	await pool.close();
} else {
	console.error('usage: node compose/mssql.mjs ready | drop-prefixed <prefix>');
	process.exit(2);
}
