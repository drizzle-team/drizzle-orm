import { drizzle } from 'drizzle-orm/postgres-js';
import { relations } from '../../lib/big-schema-rels.ts';

export const db = drizzle({
	connection: 'postgres:/...',
	relations,
});

export const q1 = await db.query.user.findMany({
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
	where: {
		apiDisabled: true,
		createdTime: {
			lt: new Date().toISOString(),
		},
		bookingLinksViaInviteeBooking: true,
		bookingLinksCreatedByUserId: false,
		emailAccounts: {
			email: 'somemail@example.com',
			users: true,
		},
		RAW: (t, { sql }) => sql`${t} = 5`,
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

export const q2 = await db.query.user.findFirst({
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
	where: {
		apiDisabled: true,
		createdTime: {
			lt: new Date().toISOString(),
		},
		bookingLinksViaInviteeBooking: true,
		bookingLinksCreatedByUserId: false,
		emailAccounts: {
			email: 'somemail@example.com',
			users: true,
		},
		RAW: (t, { sql }) => sql`${t} = 5`,
	},
	columns: {
		createdTime: false,
	},
	extras: {
		count: (t, { sql }) => sql`SELECT COUNT(*) FROM ${t}`,
	},
	offset: 3,
	orderBy: {
		id: 'desc',
		name: 'asc',
	},
});

export const q3 = await db.query.calendarEventExtensions.findMany({
	columns: {
		bookingLinkId: false,
	},
	where: {
		bookingLinkId: '10',
		AND: [
			{
				createdTime: {
					lte: new Date(Date.now() - 1500000).toISOString(),
				},
			},
			{
				createdTime: {
					gt: new Date(1500000).toISOString(),
				},
			},
		],
	},
	orderBy: {
		id: 'asc',
		bookingLinkId: 'desc',
	},
	limit: 20,
	offset: 35,
	extras: {
		count: (t) => db.$count(t),
	},
	with: {
		calendar: {
			with: {
				calendarEventExtensions: true,
			},
			columns: {
				accessRole: true,
				status: true,
				colorId: false,
			},
		},
	},
});
