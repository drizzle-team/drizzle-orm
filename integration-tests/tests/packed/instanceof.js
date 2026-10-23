// Usage: node instanceof.js <first minipg module> <second minipg module>
const [first, second] = await Promise.all(process.argv.slice(2).map((name) => import(name)));

const url = process.env.PG_CONNECTION_STRING;

async function createInstances(minipg) {
	const pool = minipg.createPool(url);
	const connection = await minipg.connect(url);
	const error = await connection.query('select 1/0').catch((error) => error);
	await connection.end();
	await pool.end();
	return { Pool: pool, Connection: connection, PgError: error };
}

const fromFirst = await createInstances(first);
const fromSecond = await createInstances(second);

class MyPool extends first.Pool {}
const myPool = new MyPool(url);
await myPool.end();

const result = { isSameClass: first.Pool === second.Pool };
for (const name of Object.keys(fromFirst)) {
	result[name] = {
		firstIsSecond: fromFirst[name] instanceof second[name],
		secondIsFirst: fromSecond[name] instanceof first[name],
	};
}
result.MyPool = {
	isFirstPool: myPool instanceof first.Pool,
	isSecondPool: myPool instanceof second.Pool,
	poolIsMyPool: fromFirst.Pool instanceof MyPool,
};

console.log(JSON.stringify(result));
