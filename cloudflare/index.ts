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
	// const db = new SQLiteD1Connector(env.DB).connect();
	// request.db = db;
}

const router = Router<Request, Methods>({ base: '/' });

router.get('/all', injectDB, async (req: Request, env: Env) => {
	const rows = await env.DB.prepare('select id as z, email as y, name as x, lower(name), upper(email) from users').all();
	console.log(rows);
	return json(rows);
});

router.get('/raw', injectDB, async (req: Request, env: Env) => {
	const rows = await env.DB.prepare('select id as z, email as y, name as x, lower(name), upper(email) from users').raw();
	console.log(rows);
	return json(rows);
});

router.post('/1', injectDB, async (req: Request, env: Env) => {
	const { name, email } = await req.json!();
	const res = await env.DB.prepare('insert into users (name, email) values (?, ?) returning *')
		.bind(name, email)
		.run();
	
	return json({ res });
});

router.post('/2', injectDB, async (req: Request, env: Env) => {
	const { name, email } = await req.json!();
	const res = await env.DB.prepare('insert into users (name, email) values (?, ?) returning *')
		.bind(name, email)
		.all();
	return json({ res });
});

router.post('/3', injectDB, async (req: Request, env: Env) => {
	const { name, email } = await req.json!();
	const res = await env.DB.prepare('insert into users (name, email) values (?, ?) returning *')
		.bind(name, email)
		.first();
	return json({ res });
});

router.post('/4', injectDB, async (req: Request, env: Env) => {
	const { name, email } = await req.json!();
	const res = await env.DB.prepare('insert into users (name, email) values (?, ?) returning *')
		.bind(name, email)
		.raw();
	return json({ res });
});

export default {
	fetch: router.handle,
};
