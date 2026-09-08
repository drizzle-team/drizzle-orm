import { text } from 'drizzle-orm/pg-core';
import { pgTable } from '../../lib/optimized-tables.ts';

export const apiWebhook = pgTable('ApiWebhook', {
	id: text(),
	createdTime: text(),
	updatedTime: text(),
	url: text(),
	createdByUserId: text(),
	workspaceId: text(),
	disabled: text(),
	failures: text(),
	configuration: text(),
});

export const user = pgTable('user', {
	id: text(),
	createdTime: text(),
	updatedTime: text(),
	name: text(),
});
