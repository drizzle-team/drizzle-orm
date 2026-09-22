import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

export const relations = defineRelations(schema, (r) => ({
	rqbUser: {
		posts: r.many.rqbPost(),
	},
	rqbPost: {
		author: r.one.rqbUser({
			from: r.rqbPost.userId,
			to: r.rqbUser.id,
		}),
	},
}));
