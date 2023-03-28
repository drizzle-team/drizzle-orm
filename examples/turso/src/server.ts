import 'dotenv/config';

import { Database } from '@libsql/sqlite3';
import { drizzle } from 'drizzle-orm/libsql';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { DATABASE_URL } from './env';
import { users } from './schema';

const client = new Database(DATABASE_URL);
const db = drizzle(client);

export const app = new Hono();

app.use('*', cors());

app.get('/users', async (ctx) => {
	const allUsers = await db.select().from(users).all();
	return ctx.json(allUsers);
});

app.post('/users', async (ctx) => {
	const user = await db.insert(users).values(ctx.body).returning('*').one();
	return ctx.json(user);
});
