Example project for [Drizzle ORM Postgres Proxy package](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm/src/pg-proxy)

Subscribe to our updates on [Twitter](https://twitter.com/DrizzleOrm) and [Discord](https://discord.gg/MdXYZk5QtH)

---

**Postgres Proxy Driver** was designed to easily define custom drivers, https clients, rpc and much more. No need to wait until Drizzle ORM will create support for specific drivers you need. Just create it yourself! 🚀

Postgres Proxy driver will do all the work except of 2 things, that you will be responsible for:

1. Calls to database, http servers or any other way to communicate with database
2. Mapping data from database to `{rows: any[], ...additional db response params}` format. Only `rows` field is required. Rows should be a row array from database for `all` method and a objects for `execute`

</br>
This project has simple example of defining http proxy server, that will proxy all calls from drizzle orm to database and back. This example could perfectly fit for serverless applications

---

## Project structure

1. `schema.ts` - drizzle orm schema file
2. `index.ts` - basic script, that uses drizzle orm pg proxy driver to define logic for server to server communication over http
3. `server.ts` - server implementation example

### Database calls

---

#### All you need to do - is to setup drizzle database instance with http call implementation

</br>

> **Warning**:
> You will be responsible for proper error handling in this part. Drizzle always waits for `{rows: string[][] | object[]}` so if any error was on http call(or any other call) - be sure, that you return at least empty array back
>
> For `all` method you should return `{rows: string[][]}`
> For `execute` method you should return `{rows: object[]}`

</br>

```typescript
import axios from 'axios';
import { drizzle } from 'drizzle-orm/pg-proxy';

const db = drizzle(async (sql, params, method) => {
  try {
    const rows = await axios.post('http://localhost:3000/query', {
      sql,
      params,
      method,
    });

    return { rows: rows.data };
  } catch (e: any) {
    console.error('Error from pg proxy server: ', e.response.data);
    return { rows: [] };
  }
});
```

We have 3 params, that will be sent to server. It's your decision which of them and in which way should be used

1. `sql` - SQL query (`SELECT * FROM users WHERE id = ?`)
2. `params` - params, that should be sent on database call (For query above it could be: `[1]`)
3. `method` - Method, that was executed (`all` | `execute`). Hint for proxy server on which pg method to invoke

### Migrations using Postgres Proxy

---

In current Postgres Proxy version - drizzle don't handle transactions for migrations. As for now we are sending an array of queries, that should be executed by user and user should do `commit` or `rollback` logic

</br>

> **Warning**:
> You will be responsible for proper error handling in this part. Drizzle just finds migrations, that need to be executed on this iteration and if finds some -> provide `queries` array to callback

</br>

```typescript
import axios from 'axios';
import { migrate } from 'drizzle-orm/pg-proxy/migrator';

await migrate(db, async (queries) => {
  try {
    await axios.post('http://localhost:3000/migrate', { queries });
  } catch (e) {
    console.log(e);
    throw Error('Proxy server cannot run migrations');
  }
}, { migrationsFolder: 'drizzle' });
```

1. `queries` - array of sql statements, that should be run on migration

### Proxy Server implementation example

---

> **Note**:
> It's just a suggestion on how proxy server could be set up and a simple example of params handling on `query` and `migration` calls

```typescript
import { Client } from 'pg';
import express from 'express';

const app = express();
app.use(express.json());
const port = 3000;

const client = new Client('postgres://postgres:postgres@localhost:5432/postgres');

app.post('/query', async (req, res) => {
	const { sql: sqlBody, params, method } = req.body;

	if (method === 'all') {
		try {
            const result = await client.query({
                text: sqlBody,
                values: params,
                rowMode: 'array',
            });
			res.send(result.rows);
		} catch (e: any) {
			res.status(500).json({ error: e });
		}
	} else if (method === 'execute') {
		try {
            const result = await client.query({
                text: sqlBody,
                values: params,
            });

			res.send(result.rows);
		} catch (e: any) {
			res.status(500).json({ error: e });
		}
	} else {
		res.status(500).json({ error: 'Unknown method value' });
	}
});

app.post('/migrate', async (req, res) => {
	const { queries } = req.body;

    await client.query('BEGIN');
    try {
        for (const query of queries) {
            await client.query(query);
        }
        await client.query('COMMIT');
    } catch {
        await client.query('ROLLBACK');
    }

	res.send({});
});

app.listen(port, () => {
	console.log(`Example app listening on port ${port}`);
});
```
