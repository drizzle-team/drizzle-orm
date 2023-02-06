import { Client } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm/expressions';
import { drizzle, NeonDatabase } from 'drizzle-orm/neon-serverless';
import { Request as IttyRequest, Route, Router } from 'itty-router';
import { json } from 'itty-router-extras';

import { users } from './schema';

interface Env {
	DATABASE_URL: string;
}

interface Request extends IttyRequest {
	client: Client;
	db: NeonDatabase;
}

interface Methods {
	get: Route;
	post: Route;
}

async function injectDB(request: Request, env: Env) {
	request.client = new Client(env.DATABASE_URL);
	request.db = drizzle(request.client);
}

const router = Router<Request, Methods>({ base: '/' });

router.get('/health', async (req: Request, env: Env, ctx: ExecutionContext) => {
	return json({ status: 'ok' });
});

router.get('/users', injectDB, async (req: Request, env: Env, ctx: ExecutionContext) => {
	req.client.connect();
	const result = await req.db.select(users);
	ctx.waitUntil(req.client.end());
	return json({ status: 'ok', result });
});

router.get('/users/:id', injectDB, async (req: Request, env: Env) => {
	const result = await req.db.select(users).where(eq(users.id, req.params!['id'])).execute();
	return json(result);
});

router.post('/users', injectDB, async (req: Request, env: Env) => {
	const { name, email } = await req.json!();
	const res = await req.db.insert(users).values({ name, email }).returning().execute();
	return json({ res });
});

export default {
	fetch: router.handle,
};
