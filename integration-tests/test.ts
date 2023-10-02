import { sql } from 'drizzle-orm';
// import { mysqlTable, serial, text } from 'drizzle-orm/mysql-core';
import { drizzle } from 'drizzle-orm/mysql-proxy';
// import postgres from "pg";
import * as mysql from 'mysql2/promise';
// import Docker from 'dockerode';
// import getPort from 'get-port';
// import { v4 as uuid } from 'uuid';


// const pg = new postgres.Client("postgres://k6:k6@localhost:5432/northwind")

async function createDockerDB(): Promise<string> {
	// const docker = new Docker();
	// const port = await getPort({ port: 3306 });
	// const image = 'mysql:8';

	// const pullStream = await docker.pull(image);
	// await new Promise((resolve, reject) =>
	// 	docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	// );

	// const container = await docker.createContainer({
	// 	Image: image,
	// 	Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
	// 	name: `drizzle-integration-tests-${uuid()}`,
	// 	HostConfig: {
	// 		AutoRemove: true,
	// 		PortBindings: {
	// 			'3306/tcp': [{ HostPort: `${port}` }],
	// 		},
	// 	},
	// });

	// await container.start();

	return `mysql://root:mysql@127.0.0.1:3306/drizzle`;
}

const url = await createDockerDB();

console.log(url)

const client = await mysql.createConnection(url);

// eslint-disable-next-line drizzle/require-entity-kind
class ServerSimulator {
	constructor(private db: mysql.Connection) {}

	async query(sql: string, params: any[], method: 'all' | 'execute') {
		if (method === 'all') {
			try {
				const result = await this.db.query({
                    sql,
                    values: params,
					rowsAsArray: true,
                    typeCast: function(field: any, next: any) {
                        if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
                            return field.string();
                        }
                        return next();
                    },
                });

				return { data: result[0] as any };
			} catch (e: any) {
				return { error: e.message };
			}
		} else if (method === 'execute') {
			try {
				const result = await this.db.query({
                    sql,
                    values: params,
                    typeCast: function(field: any, next: any) {
                        if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
                            return field.string();
                        }
                        return next();
                    },
				});

				return { data: result[0] as any };
			} catch (e: any) {
				return { error: e.message };
			}
		} else {
			return { error: 'Unknown method value' };
		}
	}

	async migrations(queries: string[]) {
		await this.db.query('BEGIN');
		try {
			for (const query of queries) {
				await this.db.query(query);
			}
			await this.db.query('COMMIT');
		} catch {
			await this.db.query('ROLLBACK');
		}

		return {};
	}
}

// const user = pgTable("customers", {
//     id: text("customerid"),
//     companyname: text("companyname")
// })

const serverSimulator = new ServerSimulator(client);

const db = drizzle(async (sql, params, method) => {
    try {
        const response = await serverSimulator.query(sql, params, method);

        if (response.error !== undefined) {
            throw new Error(response.error);
        }

		console.log('response', response)

        return { rows: response.data };
    } catch (e: any) {
        console.error('Error from pg proxy server:', e.message);
        throw e;
    }
})

// const usersMigratorTable = pgTable('users12', {
// 	id: serial('id').primaryKey(),
// 	name: text('name').notNull(),
// 	email: text('email').notNull(),
// });

// const citiesTable = mysqlTable('cities', {
// 	id: serial('id').primaryKey(),
// 	name: text('name').notNull(),
// });

const main = async()=>{
    // await db.execute(
	// 	sql`insert into ${usersTable} (${name(usersTable.name.name)}) values (${'John'})`,
	// );

	// await db.execute(sql`
	// 	create table if not exist \`cities\` (
	// 		\`id\` serial primary key,
	// 		\`name\` text not null
	// 	)
	// `,)

	// await db.insert(citiesTable).values({
	// 	name: 'New York',
	// });

	// const result = await db.execute<{ customerid: string }>(
	// 	sql`select * from cities`,
	// );

    // console.log('result', result)

	// const res = await db.select().from(citiesTable);

	// console.log('res', res)

	await db.execute(sql`drop table if exists \`userstest\``);
	await db.execute(sql`drop table if exists \`users2\``);
	await db.execute(sql`drop table if exists \`cities\``);

	await db.execute(
		sql`
			create table \`userstest\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`verified\` boolean not null default false,
				\`jsonb\` json,
				\`created_at\` timestamp not null default now()
			)
		`,
	);

	await db.execute(
		sql`
			create table \`users2\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`city_id\` int references \`cities\`(\`id\`)
			)
		`,
	);

	await db.execute(
		sql`
			create table \`cities\` (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);
}

main()

