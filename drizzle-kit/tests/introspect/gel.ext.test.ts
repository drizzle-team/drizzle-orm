import Docker from 'dockerode';
import { drizzle, GelJsDatabase } from 'drizzle-orm/gel';
import fs from 'fs';
import createClient, { type Client } from 'gel';
import getPort from 'get-port';
import { introspectGelToFile } from 'tests/schemaDiffer';
import { v4 as uuidV4 } from 'uuid';
import { afterAll, beforeAll, expect, test } from 'vitest';
import 'zx/globals';

if (!fs.existsSync('tests/introspect/gel')) {
	fs.mkdirSync('tests/introspect/gel');
}

$.quiet = true;

const ENABLE_LOGGING = false;

let client: Client;
let db: GelJsDatabase;
const tlsSecurity: string = 'insecure';
let dsn: string;
let container: Docker.Container | undefined;

async function createDockerDB(): Promise<{ connectionString: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 5656 });
	const image = 'geldata/gel:6';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	const gelContainer = await docker.createContainer({
		Image: image,
		Env: [
			'GEL_CLIENT_SECURITY=insecure_dev_mode',
			'GEL_SERVER_SECURITY=insecure_dev_mode',
			'GEL_CLIENT_TLS_SECURITY=no_host_verification',
			'GEL_SERVER_PASSWORD=password',
		],
		name: `drizzle-integration-tests-${uuidV4()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5656/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await gelContainer.start();

	return { connectionString: `gel://admin:password@localhost:${port}/main`, container: gelContainer };
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
	let connectionString;
	if (process.env['GEL_CONNECTION_STRING']) {
		connectionString = process.env['GEL_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr, container: contrainerObj } = await createDockerDB();
		connectionString = conStr;
		container = contrainerObj;
	}

	await sleep(15 * 1000);
	client = createClient({ dsn: connectionString, tlsSecurity: 'insecure' });

	db = drizzle(client, { logger: ENABLE_LOGGING });

	dsn = connectionString;
});

afterAll(async () => {
	await client?.close().catch(console.error);
	await container?.stop().catch(console.error);
});

test('basic introspect test', async () => {
	await $`pnpm gel query 'CREATE EXTENSION pgcrypto VERSION "1.3";
  CREATE EXTENSION auth VERSION "1.0";
  CREATE TYPE default::User {
      CREATE REQUIRED LINK identity: ext::auth::Identity;
      CREATE REQUIRED PROPERTY email: std::str;
      CREATE REQUIRED PROPERTY username: std::str;
  };
  CREATE GLOBAL default::current_user := (std::assert_single((SELECT
      default::User {
          id,
          username,
          email
      }
  FILTER
      (.identity = GLOBAL ext::auth::ClientTokenIdentity)
  )));' --tls-security=${tlsSecurity} --dsn=${dsn}`;

	const path = await introspectGelToFile(
		client,
		'basic-ext-introspect',
		['ext::auth', 'public'],
	);

	const result = await $`pnpm exec tsc --noEmit --skipLibCheck ${path}`.nothrow(true);
	expect(result.exitCode).toBe(0);
	fs.rmSync(path);
});
