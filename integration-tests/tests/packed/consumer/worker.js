import { query } from './query.js';

export default {
	async fetch(_request, env) {
		return Response.json(await query(env.PG_CONNECTION_STRING));
	},
};
