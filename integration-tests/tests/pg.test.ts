import anyTest, { TestFn } from 'ava';
import Docker from 'dockerode';
import { connect, DefaultLogger, sql } from 'drizzle-orm';
import { jsonb, PgConnector, PGDatabase, pgTable, serial, text } from 'drizzle-orm-pg';
import getPort from 'get-port';
import { Client } from 'pg';
import { v4 as uuid } from 'uuid';

const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	jsonb: jsonb<string[]>('jsonb'),
});

const schema = { usersTable };

interface Context {
	docker: Docker;
	pgContainer: Docker.Container;
	db: PGDatabase<typeof schema>;
	client: Client;
}

const test = anyTest as TestFn<Context>;

async function createDockerDB(ctx: Context): Promise<string> {
	const docker = (ctx.docker = new Docker());
	const port = await getPort({ port: 5432 });
	const image = 'postgres:14';

	await docker.pull(image);

	const pgContainer = (ctx.pgContainer = await docker.createContainer({
		Image: image,
		Env: ['POSTGRES_PASSWORD=postgres', 'POSTGRES_USER=postgres', 'POSTGRES_DB=postgres'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5432/tcp': [{ HostPort: `${port}` }],
			},
		},
	}));

	await pgContainer.start();

	return `postgres://postgres:postgres@localhost:${port}/postgres`;
}

test.before(async (t) => {
	const ctx = t.context;
	const connectionString = process.env['PG_CONNECTION_STRING'] ?? await createDockerDB(ctx);

	let sleep = 250;
	let timeLeft = 5000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			ctx.client = new Client(connectionString);
			await ctx.client.connect();
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
	ctx.db = await connect(new PgConnector(ctx.client, schema, { logger: new DefaultLogger() }));
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop schema public cascade`);
	await ctx.db.execute(sql`create schema public`);
	await ctx.db.execute(sql`create table users (id serial primary key, name text not null, jsonb jsonb)`);
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
