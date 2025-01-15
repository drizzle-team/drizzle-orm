import { defineRelations } from 'drizzle-orm';
import * as schema from './mysql.schema.ts';

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
	},
	groupsTable: {
		usersToGroups: r.many.usersToGroupsTable(),
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
