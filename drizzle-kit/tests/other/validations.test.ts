import { cockroachCredentials, warnOnConflictingCredentials as warnCockroach } from 'src/cli/validations/cockroach';
import { mssqlCredentials, warnOnConflictingCredentials as warnMssql } from 'src/cli/validations/mssql';
import { mysqlCredentials, warnOnConflictingCredentials as warnMysql } from 'src/cli/validations/mysql';
import { postgresCredentials, warnOnConflictingCredentials as warnPostgres } from 'src/cli/validations/postgres';
import {
	singlestoreCredentials,
	warnOnConflictingCredentials as warnSinglestore,
} from 'src/cli/validations/singlestore';
import { sqliteCredentials } from 'src/cli/validations/sqlite';
import { expect, test, vi } from 'vitest';

test('turso #1', () => {
	sqliteCredentials.parse({
		dialect: 'sqlite',
		driver: 'turso',
		url: 'https://turso.tech',
	});
});

test('turso #2', () => {
	sqliteCredentials.parse({
		dialect: 'sqlite',
		driver: 'turso',
		url: 'https://turso.tech',
		authToken: 'token',
	});
});

test('turso #3', () => {
	expect(() =>
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'turso',
			url: 'https://turso.tech',
			authToken: '',
		})
	).toThrowError();
});

test('turso #4', () => {
	expect(() => {
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'turso',
			url: '',
			authToken: 'token',
		});
	}).toThrowError();
});

test('turso #5', () => {
	expect(() => {
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'turso',
			url: '',
			authToken: '',
		});
	}).toThrowError();
});

test('d1-http #1', () => {
	sqliteCredentials.parse({
		dialect: 'sqlite',
		driver: 'd1-http',
		accountId: 'accountId',
		databaseId: 'databaseId',
		token: 'token',
	});
});

test('d1-http #2', () => {
	expect(() =>
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'd1-http',
			accountId: 'accountId',
			databaseId: 'databaseId',
			// token: "token",
		})
	).toThrowError();
});

test('d1-http #3', () => {
	expect(() =>
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'd1-http',
			accountId: 'accountId',
			databaseId: 'databaseId',
			token: '',
		})
	).toThrowError();
});

test('d1-http #4', () => {
	expect(() =>
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'd1-http',
			accountId: 'accountId',
			// databaseId: "databaseId",
			token: 'token',
		})
	).toThrowError();
});

test('d1-http #5', () => {
	expect(() =>
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'd1-http',
			accountId: 'accountId',
			databaseId: '',
			token: 'token',
		})
	).toThrowError();
});

test('d1-http #6', () => {
	expect(() =>
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'd1-http',
			// accountId: "accountId",
			databaseId: 'databaseId',
			token: 'token',
		})
	).toThrowError();
});

test('d1-http #7', () => {
	expect(() =>
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: 'd1-http',
			accountId: '',
			databaseId: 'databaseId',
			token: 'token',
		})
	).toThrowError();
});

// omit undefined driver
test('sqlite #1', () => {
	expect(
		sqliteCredentials.parse({
			dialect: 'sqlite',
			driver: undefined,
			url: 'https://turso.tech',
		}),
	).toStrictEqual({
		url: 'https://turso.tech',
	});
});

test('sqlite #2', () => {
	expect(
		sqliteCredentials.parse({
			dialect: 'sqlite',
			url: 'https://turso.tech',
		}),
	).toStrictEqual({
		url: 'https://turso.tech',
	});
});

test('sqlite #3', () => {
	expect(() =>
		sqliteCredentials.parse({
			dialect: 'sqlite',
			url: '',
		})
	).toThrowError();
});

test('AWS Data API #1', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			url: 'https://turso.tech',
		}),
	).toStrictEqual({
		url: 'https://turso.tech',
	});
});

test('AWS Data API #1', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'aws-data-api',
			database: 'database',
			secretArn: 'secretArn',
			resourceArn: 'resourceArn',
		}),
	).toStrictEqual({
		driver: 'aws-data-api',
		database: 'database',
		secretArn: 'secretArn',
		resourceArn: 'resourceArn',
	});
});

test('AWS Data API #2', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'aws-data-api',
			database: 'database',
			secretArn: '',
			resourceArn: 'resourceArn',
		});
	}).toThrowError();
});
test('AWS Data API #3', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'aws-data-api',
			database: 'database',
			secretArn: 'secretArn',
			resourceArn: '',
		});
	}).toThrowError();
});
test('AWS Data API #4', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'aws-data-api',
			database: '',
			secretArn: 'secretArn',
			resourceArn: 'resourceArn',
		});
	}).toThrowError();
});

test('AWS Data API #5', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'aws-data-api',
			database: 'database',
			resourceArn: 'resourceArn',
		});
	}).toThrowError();
});
test('AWS Data API #6', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'aws-data-api',
			secretArn: 'secretArn',
			resourceArn: 'resourceArn',
		});
	}).toThrowError();
});
test('AWS Data API #7', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'aws-data-api',
			database: 'database',
			secretArn: 'secretArn',
		});
	}).toThrowError();
});

test('AWS Data API #8', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'aws-data-api',
		});
	}).toThrowError();
});

test('PGlite #1', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'pglite',
			url: './my.db',
		}),
	).toStrictEqual({
		driver: 'pglite',
		url: './my.db',
	});
});

test('PGlite #2', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'pglite',
			url: '',
		});
	}).toThrowError();
});

test('PGlite #3', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'pglite',
		});
	}).toThrowError();
});

test('PGlite #4', () => {
	const client = { waitReady: Promise.resolve(), query: () => {} };
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'pglite',
			client,
		}),
	).toStrictEqual({
		driver: 'pglite',
		client,
	});
});

test('PGlite #5', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'pglite',
			client: './my.db',
		});
	}).toThrowError();
});

test('PGlite #6', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'pglite',
			client: undefined,
		});
	}).toThrowError();
});

test('PGlite #7', () => {
	const client = { waitReady: Promise.resolve(), query: () => {} };
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: 'pglite',
			url: './my.db',
			client,
		}),
	).toStrictEqual({
		driver: 'pglite',
		url: './my.db',
	});
});

test('postgres #1', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			url: 'https://turso.tech',
		}),
	).toStrictEqual({
		url: 'https://turso.tech',
	});
});

test('postgres #2', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			driver: undefined,
			url: 'https://turso.tech',
		}),
	).toStrictEqual({
		url: 'https://turso.tech',
	});
});

test('postgres #3', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			database: 'database',
			host: 'host',
		}),
	).toStrictEqual({
		database: 'database',
		host: 'host',
	});
});

test('postgres #4', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			database: 'database',
			host: 'host',
		}),
	).toStrictEqual({
		database: 'database',
		host: 'host',
	});
});

test('postgres #5', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			host: 'host',
			port: 1234,
			user: 'user',
			password: 'password',
			database: 'database',
			ssl: 'require',
		}),
	).toStrictEqual({
		host: 'host',
		port: 1234,
		user: 'user',
		password: 'password',
		database: 'database',
		ssl: 'require',
	});
});

test('postgres #6', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			host: 'host',
			database: 'database',
			ssl: true,
		}),
	).toStrictEqual({
		host: 'host',
		database: 'database',
		ssl: true,
	});
});

test('postgres #7', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			host: 'host',
			database: 'database',
			ssl: 'allow',
		}),
	).toStrictEqual({
		host: 'host',
		database: 'database',
		ssl: 'allow',
	});
});

test('postgres #8', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			host: 'host',
			database: 'database',
			ssl: {
				ca: 'ca',
				cert: 'cert',
			},
		}),
	).toStrictEqual({
		host: 'host',
		database: 'database',
		ssl: {
			ca: 'ca',
			cert: 'cert',
		},
	});
});

test('postgres #9', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
		});
	}).toThrowError();
});

test('postgres #10', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			url: undefined,
		});
	}).toThrowError();
});

test('postgres #11', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			url: '',
		});
	}).toThrowError();
});

test('postgres #12', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			host: '',
			database: '',
		});
	}).toThrowError();
});

test('postgres #13', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			database: '',
		});
	}).toThrowError();
});

test('postgres #14', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			host: '',
		});
	}).toThrowError();
});

test('postgres #15', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			database: ' ',
			host: '',
		});
	}).toThrowError();
});

test('postgres #16', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			database: '',
			host: ' ',
		});
	}).toThrowError();
});

test('postgres #17', () => {
	expect(() => {
		postgresCredentials.parse({
			dialect: 'postgres',
			database: ' ',
			host: ' ',
			port: '',
		});
	}).toThrowError();
});

test('postgres #18', () => {
	expect(
		postgresCredentials.parse({
			dialect: 'postgres',
			host: 'host',
			database: 'database',
			target_session_attrs: 'primary',
		}),
	).toStrictEqual({
		host: 'host',
		database: 'database',
		target_session_attrs: 'primary',
	});
});

test('postgres #19', () => {
	expect(() =>
		postgresCredentials.parse({
			dialect: 'postgres',
			host: 'host',
			database: 'database',
			target_session_attrs: 'nope',
		})
	).toThrowError();
});

test('mysql #1', () => {
	expect(
		mysqlCredentials.parse({
			dialect: 'mysql',
			url: 'https://turso.tech',
		}),
	).toStrictEqual({
		url: 'https://turso.tech',
	});
});

test('mysql #2', () => {
	expect(
		mysqlCredentials.parse({
			dialect: 'mysql',
			driver: undefined,
			url: 'https://turso.tech',
		}),
	).toStrictEqual({
		url: 'https://turso.tech',
	});
});

test('mysql #3', () => {
	expect(
		mysqlCredentials.parse({
			dialect: 'mysql',
			database: 'database',
			host: 'host',
		}),
	).toStrictEqual({
		database: 'database',
		host: 'host',
	});
});

test('mysql #4', () => {
	expect(
		mysqlCredentials.parse({
			dialect: 'mysql',
			database: 'database',
			host: 'host',
		}),
	).toStrictEqual({
		database: 'database',
		host: 'host',
	});
});

test('mysql #5', () => {
	expect(
		mysqlCredentials.parse({
			dialect: 'mysql',
			host: 'host',
			port: 1234,
			user: 'user',
			password: 'password',
			database: 'database',
			ssl: 'require',
		}),
	).toStrictEqual({
		host: 'host',
		port: 1234,
		user: 'user',
		password: 'password',
		database: 'database',
		ssl: 'require',
	});
});

test('mysql #7', () => {
	expect(
		mysqlCredentials.parse({
			dialect: 'mysql',
			host: 'host',
			database: 'database',
			ssl: 'allow',
		}),
	).toStrictEqual({
		host: 'host',
		database: 'database',
		ssl: 'allow',
	});
});

test('mysql #8', () => {
	expect(
		mysqlCredentials.parse({
			dialect: 'mysql',
			host: 'host',
			database: 'database',
			ssl: {
				ca: 'ca',
				cert: 'cert',
			},
		}),
	).toStrictEqual({
		host: 'host',
		database: 'database',
		ssl: {
			ca: 'ca',
			cert: 'cert',
		},
	});
});

test('mysql #9', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
		});
	}).toThrowError();
});

test('mysql #10', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
			url: undefined,
		});
	}).toThrowError();
});

test('mysql #11', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
			url: '',
		});
	}).toThrowError();
});

test('mysql #12', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
			host: '',
			database: '',
		});
	}).toThrowError();
});

test('mysql #13', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
			database: '',
		});
	}).toThrowError();
});

test('mysql #14', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
			host: '',
		});
	}).toThrowError();
});

test('mysql #15', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
			database: ' ',
			host: '',
		});
	}).toThrowError();
});

test('mysql #16', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
			database: '',
			host: ' ',
		});
	}).toThrowError();
});

test('mysql #17', () => {
	expect(() => {
		mysqlCredentials.parse({
			dialect: 'mysql',
			database: ' ',
			host: ' ',
			port: '',
		});
	}).toThrowError();
});

test('singlestore #1', () => {
	expect(
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			database: 'database',
			host: 'host',
		}),
	).toStrictEqual({
		database: 'database',
		host: 'host',
	});
});

test('singlestore #2', () => {
	expect(
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			database: 'database',
			host: 'host',
		}),
	).toStrictEqual({
		database: 'database',
		host: 'host',
	});
});

test('singlestore #3', () => {
	expect(
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			host: 'host',
			port: 1234,
			user: 'user',
			password: 'password',
			database: 'database',
			ssl: 'require',
		}),
	).toStrictEqual({
		host: 'host',
		port: 1234,
		user: 'user',
		password: 'password',
		database: 'database',
		ssl: 'require',
	});
});

test('singlestore #4', () => {
	expect(
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			host: 'host',
			database: 'database',
			ssl: 'allow',
		}),
	).toStrictEqual({
		host: 'host',
		database: 'database',
		ssl: 'allow',
	});
});

test('singlestore #5', () => {
	expect(
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			host: 'host',
			database: 'database',
			ssl: {
				ca: 'ca',
				cert: 'cert',
			},
		}),
	).toStrictEqual({
		host: 'host',
		database: 'database',
		ssl: {
			ca: 'ca',
			cert: 'cert',
		},
	});
});

test('singlestore #6', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
		});
	}).toThrowError();
});

test('singlestore #7', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			url: undefined,
		});
	}).toThrowError();
});

test('singlestore #8', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			url: '',
		});
	}).toThrowError();
});

test('singlestore #9', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			host: '',
			database: '',
		});
	}).toThrowError();
});

test('singlestore #10', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			database: '',
		});
	}).toThrowError();
});

test('singlestore #11', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			host: '',
		});
	}).toThrowError();
});

test('singlestore #12', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			database: ' ',
			host: '',
		});
	}).toThrowError();
});

test('singlestore #13', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			database: '',
			host: ' ',
		});
	}).toThrowError();
});

test('singlestore #14', () => {
	expect(() => {
		singlestoreCredentials.parse({
			dialect: 'singlestore',
			database: ' ',
			host: ' ',
			port: '',
		});
	}).toThrowError();
});

const captureWarning = (
	warn: (options: Record<string, unknown>) => void,
	options: Record<string, unknown>,
) => {
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	warn(options);
	const output = log.mock.calls.map((call) => call.join(' ')).join('\n');
	log.mockRestore();
	// strip chalk colors
	// oxlint-disable-next-line no-control-regex
	return output.replace(/\u001B\[\d+m/g, '');
};

test('postgres url + params #1', () => {
	const options = { url: 'postgres://u@h/db', host: 'h2', database: 'db2', port: 5433 };

	expect(captureWarning(warnPostgres, options)).toContain('Both "url" and "host", "port", "database" are provided');
	expect(postgresCredentials.parse(options)).toStrictEqual({ url: 'postgres://u@h/db' });
});

test('postgres url + params #2', () => {
	const options = { url: 'postgres://u@h/db', port: 5433, ssl: 'require' };

	expect(captureWarning(warnPostgres, options)).toContain('Both "url" and "port", "ssl" are provided');
	expect(postgresCredentials.parse(options)).toStrictEqual({ url: 'postgres://u@h/db' });
});

test('postgres url + params #3', () => {
	expect(captureWarning(warnPostgres, { url: 'postgres://u@h/db' })).toStrictEqual('');
	expect(captureWarning(warnPostgres, { host: 'h', database: 'db', port: 5432 })).toStrictEqual('');
	expect(captureWarning(warnPostgres, { driver: 'pglite', url: './db' })).toStrictEqual('');
});

test('mysql url + params', () => {
	const options = { url: 'mysql://u@h/db', host: 'h2', database: 'db2' };

	expect(captureWarning(warnMysql, options)).toContain('Both "url" and "host", "database" are provided');
	expect(mysqlCredentials.parse(options)).toStrictEqual({ url: 'mysql://u@h/db' });
	expect(captureWarning(warnMysql, { host: 'h', database: 'db' })).toStrictEqual('');
});

test('singlestore url + params', () => {
	const options = { url: 'singlestore://u@h/db', host: 'h2', database: 'db2' };

	expect(captureWarning(warnSinglestore, options)).toContain('Both "url" and "host", "database" are provided');
	expect(singlestoreCredentials.parse(options)).toStrictEqual({ url: 'singlestore://u@h/db' });
	expect(captureWarning(warnSinglestore, { host: 'h', database: 'db' })).toStrictEqual('');
});

test('cockroach url + params', () => {
	const options = { url: 'postgres://u@h/db', host: 'h2', database: 'db2', ssl: 'require' };

	expect(captureWarning(warnCockroach, options)).toContain('Both "url" and "host", "database", "ssl" are provided');
	expect(cockroachCredentials.parse(options)).toStrictEqual({ url: 'postgres://u@h/db' });
	expect(captureWarning(warnCockroach, { host: 'h', database: 'db' })).toStrictEqual('');
});

test('mssql url + params', () => {
	const options = { url: 'mssql://u:p@s/db', server: 's2', user: 'u2', password: 'p2' };

	expect(captureWarning(warnMssql, options)).toContain('Both "url" and "server", "user", "password" are provided');
	expect(mssqlCredentials.parse(options)).toStrictEqual({ url: 'mssql://u:p@s/db' });
	expect(captureWarning(warnMssql, { server: 's', user: 'u', password: 'p' })).toStrictEqual('');
});
