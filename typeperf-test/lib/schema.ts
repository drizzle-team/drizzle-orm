import { pgTable, text } from 'drizzle-orm/pg-core';

export const apiWebhook = pgTable('hook', {
	id: text(),
	createdAt: text(),
	updatedAt: text(),
	url: text(),
	createdBy: text(),
	workspace: text(),
	data: text(),
	errors: text(),
	cfg: text(),
});

export const user = pgTable('user', {
	id: text(),
	createdTime: text(),
	updatedTime: text(),
	name: text(),
});

export const schema = {
	apiWebhook,
	user,
};
