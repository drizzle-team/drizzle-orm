import { defineRelations } from 'drizzle-orm';
import * as schema from './sqlite.schema.ts';

export default defineRelations(schema, (r) => ({
	usersTable: {
		invitee: r.one.usersTable({
			from: r.usersTable.invitedBy,
			to: r.usersTable.id,
			optional: true,
		}),
		inviteeRequired: r.one.usersTable({
			from: r.usersTable.invitedBy,
			to: r.usersTable.id,
		}),
		usersToGroups: r.many.usersToGroupsTable(),
		posts: r.many.postsTable(),
	},
	groupsTable: {
		usersToGroups: r.many.usersToGroupsTable(),
	},
	usersToGroupsTable: {
		group: r.one.groupsTable({
			from: r.usersToGroupsTable.groupId,
			to: r.groupsTable.id,
		}),
		user: r.one.usersTable({
			from: r.usersToGroupsTable.userId,
			to: r.usersTable.id,
		}),
	},
	postsTable: {
		author: r.one.usersTable({
			from: r.postsTable.ownerId,
			to: r.usersTable.id,
		}),
		comments: r.many.commentsTable(),
	},
	commentsTable: {
		post: r.one.postsTable({
			from: r.commentsTable.postId,
			to: r.postsTable.id,
		}),
		author: r.one.usersTable({
			from: r.commentsTable.creator,
			to: r.usersTable.id,
		}),
		likes: r.many.commentLikesTable(),
	},
	commentLikesTable: {
		comment: r.one.commentsTable({
			from: r.commentLikesTable.commentId,
			to: r.commentsTable.id,
		}),
		author: r.one.usersTable({
			from: r.commentLikesTable.creator,
			to: r.usersTable.id,
		}),
	},
}));
