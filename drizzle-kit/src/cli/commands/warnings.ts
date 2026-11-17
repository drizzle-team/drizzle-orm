type TableName = { schema?: string; name: string };

export const nameWithRename = (before: string, after: string) => {
	return before === after ? before : `${before} (would become ${after})`;
};

// Statements name a table as it is after the diff. A data loss check runs before any statement,
// so it must query the table by the name that the database still has.
// `'dropped'` applies only the schema rename, because a table can be renamed or moved to the name
// of a dropped view.
export const tableNamesBeforeRenames = (
	renames: {
		schemas?: readonly { from: { name: string }; to: { name: string } }[];
		tables: readonly { schema?: string; from: string; to: string }[];
		moves?: readonly { name: string; from: string; to: string }[];
	},
	quoteTable: (table: TableName) => string,
) => {
	const identifier = (table: TableName, diffResult: 'kept' | 'dropped'): string => {
		let { schema, name } = table;
		if (diffResult === 'kept') {
			schema = renames.moves?.find((it) => it.name === name && it.to === schema)?.from ?? schema;
			name = renames.tables.find((it) => it.to === name && it.schema === schema)?.from ?? name;
		}
		schema = renames.schemas?.find((it) => it.to.name === schema)?.from.name ?? schema;

		return quoteTable({ schema, name });
	};

	const label = (table: TableName) => nameWithRename(identifier(table, 'kept'), quoteTable(table));

	return { identifier, label };
};

export const dropTableWarning = (table: string) => `You're about to delete non-empty ${table} table`;

export const dropViewWarning = (view: string) => `You're about to delete non-empty ${view} materialized view`;

export const dropColumnWarning = (column: string, table: string) => {
	return `You're about to delete non-empty ${column} column in ${table} table`;
};

export const dropSchemaWarning = (schema: string, tableCount: number) => {
	return `You're about to delete ${schema} schema with ${tableCount} ${tableCount === 1 ? 'table' : 'tables'}`;
};

export const dropPrimaryKeyWarning = (table: string) => {
	return `You're about to drop the primary key of ${table} table. The statements may fail, and the table may lose its primary key`;
};

export const addNotNullColumnWarning = (column: string, table: string) => {
	return `You're about to add not-null ${column} column without default value to non-empty ${table} table`;
};

export const changeColumnTypeWarning = (column: string, table: string, from: string, to: string) => {
	return `You're about to change ${column} column type in ${table} table from ${from} to ${to}`;
};

export const dropReferencedPrimaryKeyWarning = (table: string, columns: string[]) => {
	const columnNames = columns.join(', ');
	return `You are trying to drop primary key from ${table} (${columnNames}), but there is an existing reference on this column. You must either add a UNIQUE constraint to (${columnNames}) or drop the foreign key constraint that references this column.`;
};
