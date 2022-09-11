import anyTest, { TestFn } from 'ava';
import Docker from 'dockerode';
import { connect, DefaultLogger, sql } from 'drizzle-orm';
import { json, MySqlConnector, MySqlDatabase, mysqlTable, serial, varchar } from 'drizzle-orm-mysql';
import getPort from 'get-port';
import mysql, { Connection } from 'mysql2/promise';
import { v4 as uuid } from 'uuid';

const usersTable = mysqlTable('users', {
	id: serial('id').primaryKey(),
	name: varchar('name').notNull(),
	json: json<string[]>('json'),
});

const schema = { usersTable };

interface Context {
	docker: Docker;
	pgContainer: Docker.Container;
	db: MySqlDatabase<typeof schema>;
	conn: Connection;
}

const test = anyTest as TestFn<Context>;

async function createDockerDB(ctx: Context): Promise<string> {
	const docker = (ctx.docker = new Docker());
	const port = await getPort({ port: 5432 });
	const image = 'mysql:8';

	await docker.pull(image);

	const mysqlContainer = (ctx.pgContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=drizzle', 'MYSQL_USER=drizzle', 'MYSQL_PASSWORD=drizzle', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	}));

	await mysqlContainer.start();

	return `mysql://drizzle:drizzle@localhost:${port}/drizzle`;
}

test.before(async (t) => {
	const ctx = t.context;
	const connectionString = process.env['MYSQL_CONNECTION_STRING'] ?? await createDockerDB(ctx);

	let sleep = 250;
	let timeLeft = 5000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			ctx.conn = await mysql.createConnection(connectionString);
			await ctx.conn.connect();
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to Postgres');
		throw lastError;
	}
	ctx.db = await connect(new MySqlConnector(ctx.conn, schema, { logger: new DefaultLogger() }));
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop table if exists ${usersTable}`);
	await ctx.db.execute(
		sql`create table ${usersTable} (id int not null auto_increment primary key, name varchar(255) not null, json json not null)`,
	);
});

test.serial('insert + select', async (t) => {
	const { db } = t.context;

	await db.usersTable.insert({ name: 'John' }).execute();
	const result = await db.usersTable.select({ id: usersTable.id, name: usersTable.name }).execute();
	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	await db.usersTable.insert({ name: 'Jane' }).execute();
	const result2 = await db.usersTable.select({ id: usersTable.id, name: usersTable.name }).execute();
	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.serial('json insert', async (t) => {
	const { db } = t.context;

	await db.usersTable.insert({ name: 'John', jsonb: ['foo', 'bar'] }).execute();
	const result = await db.usersTable.select({ id: usersTable.id, name: usersTable.name, jsonb: usersTable.jsonb })
		.execute();
	t.deepEqual(result, [{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.client?.end().catch(console.error);
	await ctx.pgContainer?.stop().catch(console.error);
});
