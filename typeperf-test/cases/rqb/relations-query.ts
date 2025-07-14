import { drizzle } from 'drizzle-orm/postgres-js';
import { relations } from '../../lib/big-schema-rels.ts';

export const db = drizzle({
	connection: 'postgres:/...',
	relations,
});

export const usersWithPosts = await db.query.user.findMany({
	with: {
		featurePermissionTiers: true,
		referrals: {
			columns: {
				id: true,
				inviteeEmail: true,
				isLegacyReferral: true,
				skipReferrerCredit: false,
			},
		},
	},
	columns: {
		createdTime: false,
	},
	extras: {
		count: (t, { sql }) => sql`SELECT COUNT(*) FROM ${t}`,
	},
	limit: 5,
	offset: 3,
	orderBy: {
		id: 'desc',
		name: 'asc',
	},
});
