import { defineRelations } from 'drizzle-orm';
import * as schema from './pg.schema.ts';

export default defineRelations(schema, (r) => ({
	usersTable: {
		invitee: r.one.usersTable({
			from: r.usersTable.invitedBy,
			to: r.usersTable.id,
		}),
		inviteeRequired: r.one.usersTable({
			from: r.usersTable.invitedBy,
			to: r.usersTable.id,
			optional: false,
		}),
		usersToGroups: r.many.usersToGroupsTable(),
		posts: r.many.postsTable(),
		postsFiltered: r.many.postsTable({
			alias: 'author-filtered',
		}),
		group: r.one.groupsTable({
			from: r.usersTable.id.through(r.usersToGroupsTable.userId),
			to: r.groupsTable.id.through(r.usersToGroupsTable.groupId),
		}),
		groups: r.many.groupsTable({
			from: r.usersTable.id.through(r.usersToGroupsTable.userId),
			to: r.groupsTable.id.through(r.usersToGroupsTable.groupId),
			alias: 'users-groups-direct',
		}),
		groupsFiltered: r.many.groupsTable({
			from: r.usersTable.id.through(r.usersToGroupsTable.userId),
			to: r.groupsTable.id.through(r.usersToGroupsTable.groupId),
			where: {
				id: {
					gte: 2,
				},
			},
			alias: 'users-groups-direct-filtered',
		}),
	},
	groupsTable: {
		usersToGroups: r.many.usersToGroupsTable(),
		user: r.one.usersTable(),
		users: r.many.usersTable({
			alias: 'users-groups-direct',
		}),
		usersFiltered: r.many.usersTable({
			alias: 'users-groups-direct-filtered',
		}),
	},
	usersToGroupsTable: {
		group: r.one.groupsTable({
			from: r.usersToGroupsTable.groupId,
			to: r.groupsTable.id,
			optional: false,
		}),
		user: r.one.usersTable({
			from: r.usersToGroupsTable.userId,
			to: r.usersTable.id,
			optional: false,
		}),
	},
	postsTable: {
		author: r.one.usersTable({
			from: r.postsTable.ownerId,
			to: r.usersTable.id,
			optional: false,
		}),
		authorFiltered: r.one.usersTable({
			from: r.postsTable.ownerId,
			to: r.usersTable.id,
			optional: false,
			where: {
				ownerId: 2,
			},
			alias: 'author-filtered',
		}),
		authorAltFiltered: r.one.usersTable({
			from: r.postsTable.ownerId,
			to: r.usersTable.id,
			optional: false,
			where: {
				content: {
					like: '%.1',
				},
			},
			alias: 'author-alt-filtered',
		}),
		comments: r.many.commentsTable(),
	},
	commentsTable: {
		post: r.one.postsTable({
			from: r.commentsTable.postId,
			to: r.postsTable.id,
			optional: false,
		}),
		author: r.one.usersTable({
			from: r.commentsTable.creator,
			to: r.usersTable.id,
			optional: false,
		}),
		likes: r.many.commentLikesTable(),
	},
	commentLikesTable: {
		comment: r.one.commentsTable({
			from: r.commentLikesTable.commentId,
			to: r.commentsTable.id,
			optional: false,
		}),
		author: r.one.usersTable({
			from: r.commentLikesTable.creator,
			to: r.usersTable.id,
			optional: false,
		}),
	},
}));
