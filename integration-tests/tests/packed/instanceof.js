// Checks that classes from two installed copies of Drizzle Postgres pass `instanceof` against each other.
// A project can hold two copies, so an object from one copy must also work with the other copy.
// `packed-package.test.ts` runs this script in a consumer project and compares the JSON that it prints.
//
// Usage: PG_CONNECTION_STRING=postgres://... node instanceof.js @drizzle-team/postgres postgres-copy
const [firstName, secondName] = process.argv.slice(2);
const [first, second] = await Promise.all([import(firstName), import(secondName)]);

const url = process.env.PG_CONNECTION_STRING;

async function createInstances(postgres) {
	const pool = postgres.createPool(url);
	const connection = await postgres.connect(url);
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

// ./cf and ./deno need another runtime, and the Effect entries need the Effect peer dependency.
const entries = ['', '/core', '/replication', '/cdc', '/neon-ws', '/neon-http', '/http', '/aurora', '/buffer-polyfill'];
const isClass = (value) => typeof value === 'function' && /^class\b/.test(value.toString());

const exportedClasses = new Set();
const unbranded = new Set();
for (const entry of entries) {
	const [firstEntry, secondEntry] = await Promise.all([import(firstName + entry), import(secondName + entry)]);
	for (const [name, value] of Object.entries(firstEntry)) {
		if (!isClass(value)) continue;
		exportedClasses.add(name);
		const isBranded = Object.create(value.prototype) instanceof secondEntry[name]
			&& Object.create(secondEntry[name].prototype) instanceof value;
		if (!isBranded) unbranded.add(name);
	}
}
result.exportedClasses = exportedClasses.size;
result.unbranded = [...unbranded];

console.log(JSON.stringify(result));
