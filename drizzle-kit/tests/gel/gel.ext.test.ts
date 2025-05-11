import fs from 'fs';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import 'zx/globals';
import { DB } from 'src/utils';
import { prepareTestDatabase, pull, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}

fs.mkdirSync('tests/gel/tmp', { recursive: true });

$.quiet = true;

const ENABLE_LOGGING = false;
const tlsSecurity = 'insecure';

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase(ENABLE_LOGGING, tlsSecurity);
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
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
  )));' --tls-security=${tlsSecurity} --dsn=${_.url}`;

	const path = await pull(db, 'basic-ext-introspect', ['ext::auth', 'public']);

	const result = await $`pnpm exec tsc --noEmit --skipLibCheck ${path}`.nothrow(true);
	expect(result.exitCode).toBe(0);
	fs.rmSync(path);
});
