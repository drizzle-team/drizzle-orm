import { index, int, mssqlTable, mssqlView, uniqueIndex } from '~/mssql-core/index.ts';
import { sql } from '~/sql/sql.ts';

const users = mssqlTable('users', {
	id: int('id').notNull().primaryKey(),
});

export const usersView = mssqlView('users_view', {
	id: int('id').notNull(),
}, (view) => [
	uniqueIndex('users_view_clustered_idx').on(view.id).clustered(),
	index('users_view_id_idx').on(view.id).nonClustered(),
]).with({ schemaBinding: true }).as(sql`select ${users.id} from ${users}`);
