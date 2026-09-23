import 'dotenv/config';
import Docker from 'dockerode';
import { desc, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import getPort from 'get-port';
import pg from 'pg';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, expect, expectTypeOf, test } from 'vitest';
import * as schema from './pg.schema.ts';

const { Client } = pg;

const ENABLE_LOGGING = false;

const VALUE_STRING = '130237967670177794';
const VALUE_BIGINT = 130237967670177794n;

/*
	Test cases:
	- querying with relation containing bigint values, with no precision loss
*/

let pgContainer: Docker.Container;
let db: NodePgDatabase<typeof schema>;
let client: pg.Client;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 5432 });
	const image = 'postgres:14';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	pgContainer = await docker.createContainer({
		Image: image,
		Env: [
			'POSTGRES_PASSWORD=postgres',
			'POSTGRES_USER=postgres',
			'POSTGRES_DB=postgres',
		],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5432/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await pgContainer.start();

	return `postgres://postgres:postgres@localhost:${port}/postgres`;
}

beforeAll(async () => {
	const connectionString = process.env['PG_CONNECTION_STRING'] ?? (await createDockerDB());

	const sleep = 250;
	let timeLeft = 5000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = new Client(connectionString);
			await client.connect();
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
		await client?.end().catch(console.error);
		await pgContainer?.stop().catch(console.error);
		throw lastError;
	}
	db = drizzle(client, { schema, logger: ENABLE_LOGGING, casing: 'snake_case' });
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await pgContainer?.stop().catch(console.error);
});

beforeEach(async () => {
	await db.execute(sql`drop schema public cascade`);
	await db.execute(sql`create schema public`);

	await db.execute(
		sql`
			CREATE TABLE public.test_bigint (
        serial_bigint_id bigserial NOT NULL,
        non_serial_bigint int8 NOT NULL,
        CONSTRAINT test_bigint_pkey PRIMARY KEY (serial_bigint_id)
      );

			CREATE TABLE public.test_bigint_child (
        child_serial_bigint_id bigserial NOT NULL,
        child_non_serial_bigint int8 NOT NULL,
        parent_bigint_id int8 NOT NULL,
        CONSTRAINT test_bigint_child_pkey PRIMARY KEY (child_serial_bigint_id)
      );

      CREATE TABLE public.test_custom_bigint (
        serial_bigint_id bigserial NOT NULL,
        custom_bigint int8 NOT NULL,
        CONSTRAINT test_custom_bigint_pkey PRIMARY KEY (serial_bigint_id)
      );

			CREATE TABLE public.test_custom_bigint_child (
        child_serial_bigint_id bigserial NOT NULL,
        child_custom_bigint int8 NOT NULL,
        parent_bigint_id int8 NOT NULL,
        CONSTRAINT test_custom_bigint_child_pkey PRIMARY KEY (child_serial_bigint_id)
      );
		`,
	);
});

test('bigint and bigserial should not loose precisision even in relation', async () => {
	await db.insert(schema.TestBigint).values({
		serialBigintId: VALUE_BIGINT,
		nonSerialBigint: VALUE_BIGINT,
	});

	await db.insert(schema.TestBigintChild).values({
		childSerialBigintId: VALUE_BIGINT,
		childNonSerialBigint: VALUE_BIGINT,
		parentBigintId: VALUE_BIGINT,
	});

	const query = db.query.TestBigint.findFirst({
		with: {
			children: {
				with: {
					parent: true,
				},
			},
		},
	});

	const querySql = query.toSQL();

	console.log(querySql);

	const res = await query;

	if (!res) throw new Error('Type guard');

	expect(res.serialBigintId).toEqual(VALUE_BIGINT);
	expect(res.nonSerialBigint).toEqual(VALUE_BIGINT);

	const child = res.children[0];

	if (!child) throw new Error('Type guard');

	expect(child.childSerialBigintId).toEqual(VALUE_BIGINT);
	expect(child.childNonSerialBigint).toEqual(VALUE_BIGINT);
	expect(child.parentBigintId).toEqual(VALUE_BIGINT);

	if (!child.parent) throw new Error('Type guard');

	expect(child.parent.serialBigintId).toEqual(VALUE_BIGINT);
	expect(child.parent.nonSerialBigint).toEqual(VALUE_BIGINT);
});

test('custom bigint and bigserial should not loose precisision even in relation', async () => {
	await db.insert(schema.TestCustomBigint).values({
		serialBigintId: VALUE_BIGINT,
		customBigint: VALUE_BIGINT,
	});

	await db.insert(schema.TestCustomBigintChild).values({
		childSerialBigintId: VALUE_BIGINT,
		childCustomBigint: VALUE_BIGINT,
		parentBigintId: VALUE_BIGINT,
	});

	const query = db.query.TestCustomBigint.findFirst({
		with: {
			children: {
				with: {
					parent: true,
				},
			},
		},
	});

	const querySql = query.toSQL();

	console.log(querySql);

	const res = await query;

	if (!res) throw new Error('Type guard');

	expect(res.serialBigintId).toEqual(VALUE_BIGINT);
	expect(res.customBigint).toEqual(VALUE_BIGINT);

	const child = res.children[0];

	if (!child) throw new Error('Type guard');

	expect(child.childSerialBigintId).toEqual(VALUE_BIGINT);
	expect(child.childCustomBigint).toEqual(VALUE_BIGINT);
	expect(child.parentBigintId).toEqual(VALUE_BIGINT);

	if (!child.parent) throw new Error('Type guard');

	expect(child.parent.serialBigintId).toEqual(VALUE_BIGINT);
	expect(child.parent.customBigint).toEqual(VALUE_BIGINT);
});
