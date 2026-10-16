import { defineRelations } from 'drizzle-orm';
import * as schema from './dsql.schema';

export default defineRelations(schema, (r) => ({
	usersTable: {
		posts: r.many.postsTable({
			from: r.usersTable.id,
			to: r.postsTable.ownerId,
		}),
		comments: r.many.commentsTable({
			from: r.usersTable.id,
			to: r.commentsTable.authorId,
		}),
		invitee: r.one.usersTable({
			from: r.usersTable.invitedBy,
			to: r.usersTable.id,
		}),
		usersToGroups: r.many.usersToGroupsTable({
			from: r.usersTable.id,
			to: r.usersToGroupsTable.userId,
		}),
		groups: r.many.groupsTable({
			from: r.usersTable.id.through(r.usersToGroupsTable.userId),
			to: r.groupsTable.id.through(r.usersToGroupsTable.groupId),
		}),
	},
	postsTable: {
		author: r.one.usersTable({
			from: r.postsTable.ownerId,
			to: r.usersTable.id,
			optional: false,
		}),
		comments: r.many.commentsTable({
			from: r.postsTable.id,
			to: r.commentsTable.postId,
		}),
	},
	commentsTable: {
		post: r.one.postsTable({
			from: r.commentsTable.postId,
			to: r.postsTable.id,
			optional: false,
		}),
		author: r.one.usersTable({
			from: r.commentsTable.authorId,
			to: r.usersTable.id,
			optional: false,
		}),
	},
	groupsTable: {
		usersToGroups: r.many.usersToGroupsTable({
			from: r.groupsTable.id,
			to: r.usersToGroupsTable.groupId,
		}),
		users: r.many.usersTable({
			from: r.groupsTable.id.through(r.usersToGroupsTable.groupId),
			to: r.usersTable.id.through(r.usersToGroupsTable.userId),
		}),
	},
	usersToGroupsTable: {
		user: r.one.usersTable({
			from: r.usersToGroupsTable.userId,
			to: r.usersTable.id,
			optional: false,
		}),
		group: r.one.groupsTable({
			from: r.usersToGroupsTable.groupId,
			to: r.groupsTable.id,
			optional: false,
		}),
	},
}));
