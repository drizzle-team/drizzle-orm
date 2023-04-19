import 'dotenv/config';

import { once } from 'events';
import { type Connection } from 'mysql2';
import { type Connection as PromiseConnection, createConnection } from 'mysql2/promise';

async function* iterator(query: string, conn: PromiseConnection) {
	const stream = (conn as {} as { connection: Connection }).connection.query({
		sql: query,
		rowsAsArray: true,
	}).stream();

	function dataListener() {
		stream.pause();
	}

	stream.on('data', dataListener);

	try {
		const onEnd = once(stream, 'end');
		const onError = once(stream, 'error');

		while (true) {
			stream.resume();
			const result = await Promise.race([onEnd, onError, new Promise((resolve) => stream.once('data', resolve))]);
			if (result === undefined || (Array.isArray(result) && result.length === 0)) {
				break;
			} else if (result instanceof Error) {
				throw result;
			} else {
				yield result;
			}
		}
	} finally {
		stream.off('data', dataListener);
	}
}

async function main() {
	const conn = await createConnection(process.env['MYSQL_CONNECTION_STRING']!);

	await conn.execute('drop table if exists test');
	await conn.execute('create table test (id int not null primary key)');

	for await (const row of iterator('insert into test values (1), (2), (3)', conn)) {
		console.log('row', row);
	}

	console.log('done');

	await conn.execute('drop table test');

	await conn.end();
}

main();
