// import { boolean, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

// export const ApprovalTypes = [
//   'preparation',
//   'post_deployment',
//   'approval_gate',
// ] as const;

// export const approval_types = pgEnum('gate_types', ApprovalTypes);

// const TIME_COLUMNS = {
//   createdAt: timestamp('created_at').defaultNow().notNull(),
//   modifiedAt: timestamp('modified_at').defaultNow().notNull(),
// };

// export const approvals = pgTable('approvals', {
//   releaseStepId: varchar('release_step_id').notNull(),
//   type: approval_types('type').notNull(),
//   approved: boolean('approved').notNull().default(false),
//   comments: text('comments'),
//   ...TIME_COLUMNS,
// });

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id'),
	name: text('name'),
});
