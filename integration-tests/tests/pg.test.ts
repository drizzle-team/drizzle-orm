import anyTest, { TestFn } from 'ava';
import Docker from 'dockerode';
import { DefaultLogger, sql } from 'drizzle-orm';
import { jsonb, PgConnector, PgDatabase, pgTable, serial, text } from 'drizzle-orm-pg';
import { eq } from 'drizzle-orm/expressions';
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
	db: PgDatabase;
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
	ctx.db = await new PgConnector(ctx.client /* , { logger: new DefaultLogger() } */).connect();
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.execute(sql`drop schema public cascade`);
	await ctx.db.execute(sql`create schema public`);
	await ctx.db.execute(sql`create table users (id serial primary key, name text not null, jsonb jsonb)`);
});

test.serial('update with returning', async (t) => {
	const ctx = t.context;
	const { db } = ctx;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning();
	t.deepEqual(users, [{ id: 1, name: 'Jane', jsonb: null }]);
});

test.serial('delete with returning', async (t) => {
	const ctx = t.context;
	const { db } = ctx;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning();
	t.deepEqual(users, [{ id: 1, name: 'John', jsonb: null }]);
});

test.serial('insert + select', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name });
	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	await db.insert(usersTable).values({ name: 'Jane' });
	const result2 = await db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name });
	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.serial('json insert', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db.select(usersTable).fields({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
	});

	t.deepEqual(result, [{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test.serial('insert many', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' });
	const result = await db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name });
	t.deepEqual(result, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.client?.end().catch(console.error);
	await ctx.pgContainer?.stop().catch(console.error);
});
