import { defineRelations } from 'drizzle-orm';
import * as schema from './sqlite.schema';

export default defineRelations(schema, (r) => ({
	usersView: {
		posts: r.many.postsTable(),
		groups: r.many.groupsTable(),
	},
	usersTable: {
		alltypes: r.many.allTypesTable({
			from: r.usersTable.id,
			to: r.allTypesTable.int,
		}),
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
			from: r.usersTable.id,
			to: r.postsTable.ownerId,
			where: {
				ownerId: 2,
			},
			alias: 'author-filtered',
		}),
		postsAltFiltered: r.many.postsTable({
			from: r.usersTable.id,
			to: r.postsTable.ownerId,
			where: {
				content: {
					like: '%.1',
				},
			},
			alias: 'author-alt-filtered',
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
			from: r.groupsTable.id.through(r.usersToGroupsTable.groupId),
			to: r.usersTable.id.through(r.usersToGroupsTable.userId),
			where: {
				id: {
					gte: 2,
				},
			},
			alias: 'users-groups-direct-filtered',
		}),
		usersView: r.many.usersView({
			from: r.groupsTable.id.through(r.usersToGroupsTable.groupId),
			to: r.usersView.id.through(r.usersToGroupsTable.userId),
			where: {
				id: {
					gt: 1,
				},
			},
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
		viewAuthor: r.one.usersView({
			from: r.postsTable.ownerId,
			to: r.usersView.id,
			optional: false,
			where: {
				id: {
					gt: 1,
				},
			},
		}),
		authorFiltered: r.one.usersTable({
			optional: false,
			alias: 'author-filtered',
		}),
		authorAltFiltered: r.one.usersTable({
			optional: false,
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
	students: {
		courseOfferings: r.many.courseOfferings({
			from: r.students.studentId.through(r.studentGrades.studentId),
			to: [
				r.courseOfferings.courseId.through(r.studentGrades.courseId),
				r.courseOfferings.semester.through(r.studentGrades.semester),
			],
		}),
	},
	courseOfferings: {
		students: r.many.students(),
	},
	customTypesTable: {
		self: r.many.customTypesTable({
			from: r.customTypesTable.id,
			to: r.customTypesTable.id,
		}),
	},
}));
