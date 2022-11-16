import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm-sqlite';
import { SQLiteD1Connector, SQLiteD1Database } from 'drizzle-orm-sqlite/d1';
import { Request as IttyRequest, Route, Router } from 'itty-router';
import { json } from 'itty-router-extras';

export interface Env {
	DB: D1Database;
}

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

interface Request extends IttyRequest {
	db: SQLiteD1Database;
}

interface Methods {
	get: Route;
	post: Route;
}

function injectDB(request: Request, env: Env) {
	const db = new SQLiteD1Connector(env.DB).connect();
	request.db = db;
}

const router = Router<Request, Methods>({ base: '/users' });

router.get('/', injectDB, async (req: Request, env: Env) => {
	const { db } = req;
	// const rows = await db.select(users).execute();
	const rows = await env.DB.prepare('select * from users').all();
	return json(rows);
});

router.post('/', injectDB, async (req: Request, env: Env) => {
	const { db } = req;
	const { name, email } = await req.json!();
	// await db.insert(users).values({ name, email }).execute();
	await env.DB.prepare('insert into users (name, email) values (?, ?)').bind(name, email).run();
	return json({ status: 'ok' });
});

export default {
	fetch: router.handle,
};
