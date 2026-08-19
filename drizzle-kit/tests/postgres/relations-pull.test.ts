import { createDDL, postgresToRelationsPull } from 'src/dialects/postgres/ddl';
import { expect, test } from 'vitest';

function usersDocumentsDdl(unique: { isUnique: boolean; where: string | null }) {
	const ddl = createDDL();
	ddl.tables.push({ schema: 'public', isRlsEnabled: false, name: 'users' });
	ddl.tables.push({ schema: 'public', isRlsEnabled: false, name: 'documents' });
	ddl.columns.push(
		{
			schema: 'public',
			table: 'users',
			name: 'id',
			type: 'serial',
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any,
		{
			schema: 'public',
			table: 'documents',
			name: 'id',
			type: 'serial',
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any,
		{
			schema: 'public',
			table: 'documents',
			name: 'user_id',
			type: 'integer',
			typeSchema: 'pg_catalog',
			notNull: true,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any,
		{
			schema: 'public',
			table: 'documents',
			name: 'archived_at',
			type: 'timestamp',
			typeSchema: 'pg_catalog',
			notNull: false,
			dimensions: 0,
			default: null,
			generated: null,
			identity: null,
		} as any,
	);
	ddl.fks.push({
		schema: 'public',
		table: 'documents',
		name: 'documents_user_id_users_id_fk',
		nameExplicit: false,
		columns: ['user_id'],
		schemaTo: 'public',
		tableTo: 'users',
		columnsTo: ['id'],
		onUpdate: 'NO ACTION',
		onDelete: 'NO ACTION',
	} as any);
	ddl.indexes.push({
		schema: 'public',
		table: 'documents',
		name: 'documents_one_active_per_user',
		columns: [{ value: 'user_id', isExpression: false, opclass: null, nullsFirst: false, asc: true }],
		isUnique: unique.isUnique,
		where: unique.where,
		with: '',
		concurrently: false,
		method: 'btree',
		nameExplicit: true,
	} as any);
	return ddl;
}

function uniqueColumnSets(ddl: ReturnType<typeof createDDL>) {
	const pull = postgresToRelationsPull(ddl);
	const documents = pull.find((table) => table.foreignKeys.some((fk) => fk.table === 'documents'));
	return documents?.uniques.map((unique) => unique.columns) ?? [];
}

test('pull ignores a partial unique index when collecting uniques for 1-1 inference (#6145)', () => {
	const uniques = uniqueColumnSets(usersDocumentsDdl({
		isUnique: true,
		where: '(archived_at IS NULL)',
	}));
	expect(uniques).not.toContainEqual(['user_id']);
});

test('pull keeps a full unique index for 1-1 inference', () => {
	const uniques = uniqueColumnSets(usersDocumentsDdl({
		isUnique: true,
		where: null,
	}));
	expect(uniques).toContainEqual(['user_id']);
});

test('pull ignores a non-unique index when collecting uniques', () => {
	const uniques = uniqueColumnSets(usersDocumentsDdl({
		isUnique: false,
		where: null,
	}));
	expect(uniques).not.toContainEqual(['user_id']);
});
