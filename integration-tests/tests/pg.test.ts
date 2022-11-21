import anyTest, { TestFn } from 'ava';
import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import { alias, jsonb, PgConnector, PgDatabase, pgTable, serial, text } from 'drizzle-orm-pg';
import { asc, eq } from 'drizzle-orm/expressions';
import getPort from 'get-port';
import { Client } from 'pg';
import { v4 as uuid } from 'uuid';

const usersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	jsonb: jsonb<string[]>('jsonb'),
});

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

test.serial('select sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select(usersTable).fields({
		name: sql`upper(${usersTable.name})`,
	});

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select typed sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select(usersTable).fields({
		name: sql`upper(${usersTable.name})`.as<string>(),
	});

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('insert returning sql', async (t) => {
	const { db } = t.context;

	const users = await db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	});

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('delete returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	});

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('update returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	});

	t.deepEqual(users, [{ name: 'JANE' }]);
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

test.serial('select with group by as field', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' });

	const result = await db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(usersTable.name);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' });

	const result = await db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql + column', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' });

	const result = await db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as column + sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' });

	const result = await db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'Jane' }, { name: 'John' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db.select(usersTable)
		.fields({ id: usersTable.id, name: usersTable.name })
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
	});
});

test.serial('insert sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name });
	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('join with alias', async (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	await db.insert(usersTable).values({ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' });
	const result = await db
		.select(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10));

	t.deepEqual(result, [{
		users: { id: 10, name: 'Ivan', jsonb: null },
		customer: { id: 11, name: 'Hans', jsonb: null },
	}]);
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.client?.end().catch(console.error);
	await ctx.pgContainer?.stop().catch(console.error);
});
