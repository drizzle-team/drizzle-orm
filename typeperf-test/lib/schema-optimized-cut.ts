import { pgTable } from './optimized-tables-cut.ts';

export const apiWebhook = pgTable('hook', {
	// id: text(),
	// createdAt: text(),
	// updatedAt: text(),
	// url: text(),
	// createdBy: text(),
	// workspace: text(),
	// data: text(),
	// errors: text(),
	// cfg: text(),
});

export const user = pgTable('user', {
	// id: text(),
	// createdAt: text(),
	// updatedAt: text(),
	// name: text(),
});
