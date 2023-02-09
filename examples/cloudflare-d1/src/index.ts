import { drizzle, DrizzleD1Database } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm/expressions';
import { Request as IttyRequest, Route, Router } from 'itty-router';
import { json } from 'itty-router-extras';

import { users } from './schema';

export interface Env {
	DB: D1Database;
}

interface Request extends IttyRequest {
	db: DrizzleD1Database;
}

interface Methods {
	get: Route;
	post: Route;
}

async function injectDB(request: Request, env: Env) {
	const db = drizzle(env.DB);
	request.db = db;

	// db.run(sql`
	// SELECT ${statItemAggregation.userId},
	//   PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY ${statItemAggregation.revenue}) as median_revenue,
	//   PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY ${statItemAggregation.connectTalkbackTime}) as median_talk_time
	// FROM ${statItemAggregation}
	// WHERE ${statItemAggregation.revenue} > 0
	// GROUP BY 1;
	// `);

	// const result = await db.select().from(statItemAggregation)
	//   .fields({
	//     userId: statItemAggregation.userId,
	//     medianRevenue: sql`PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY ${statItemAggregation.revenue})`.as<number>(),
	//     medianTalkTime: sql`PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY ${statItemAggregation.connectTalkbackTime})`.as<number>(),
	//   })
	//   .where(gt(statItemAggregation.revenue, 0))
	//   .groupBy(sql`1`)
	//   .execute();
}

const router = Router<Request, Methods>({ base: '/' });

router.get('/users', injectDB, async (req: Request, env: Env) => {
	const query = req.db.select().from(users);
	console.log(query.toSQL());
	const result = await query.all();
	return json(result);
});

router.get('/users/:id', injectDB, async (req: Request, env: Env) => {
	const result = await req.db
		.select().from(users)
		.where(eq(users.id, Number(req.params!['id'])))
		.get();
	return json(result);
});

router.post('/users', injectDB, async (req: Request, env: Env) => {
	const { name, email } = await req.json!();
	const res = await req.db.insert(users).values({ name, email }).returning().get();
	return json({ res });
});

export default {
	fetch: router.handle,
};
