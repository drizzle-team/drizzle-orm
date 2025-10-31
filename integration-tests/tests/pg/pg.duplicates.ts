import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm/_relations';
import { index, integer, pgTable, serial, timestamp } from 'drizzle-orm/pg-core';

export const artists = pgTable(
	'artists',
	{
		id: serial('id').primaryKey(),
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp('updated_at')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		companyId: integer('company_id').notNull(),
	},
);

export const members = pgTable('members', {
	id: serial('id').primaryKey(),
	createdAt: timestamp('created_at')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	updatedAt: timestamp('updated_at')
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

export const artistsToMembers = pgTable(
	'artist_to_member',
	{
		id: serial('id').primaryKey(),
		memberId: integer('member_id').notNull(),
		artistId: integer('artist_id').notNull(),
	},
	(table) => [
		index('artist_to_member__artist_id__member_id__idx').on(
			table.memberId,
			table.artistId,
		),
	],
);

export const albums = pgTable(
	'albums',
	{
		id: serial('id').primaryKey(),
		createdAt: timestamp('created_at')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		updatedAt: timestamp('updated_at')
			.notNull()
			.default(sql`CURRENT_TIMESTAMP`),
		artistId: integer('artist_id').notNull(),
	},
	(table) => [index('albums__artist_id__idx').on(table.artistId)],
);

// relations
export const artistRelations = relations(artists, ({ many }) => ({
	albums: many(albums),
	members: many(artistsToMembers),
}));

export const albumRelations = relations(albums, ({ one }) => ({
	artist: one(artists, {
		fields: [albums.artistId],
		references: [artists.id],
	}),
}));

export const memberRelations = relations(members, ({ many }) => ({
	artists: many(artistsToMembers),
}));

export const artistsToMembersRelations = relations(artistsToMembers, ({ one }) => ({
	artist: one(artists, {
		fields: [artistsToMembers.artistId],
		references: [artists.id],
	}),
	member: one(members, {
		fields: [artistsToMembers.memberId],
		references: [members.id],
	}),
}));
