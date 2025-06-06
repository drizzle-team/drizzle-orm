import { create } from '../dialect';
import { defaultNameForPK, defaultNameForUnique } from './grammar';

export const createDDL = () => {
	return create({
		schemas: {},
		tables: { schema: 'required' },
		columns: {
			schema: 'required',
			table: 'required',
			type: 'string',
			notNull: 'boolean',
			generated: {
				type: ['persisted', 'virtual'],
				as: 'string',
			},
			identity: {
				increment: 'number',
				seed: 'number',
			},
		},
		pks: {
			schema: 'required',
			table: 'required',
			nameExplicit: 'boolean',
			columns: 'string[]',
		},
		fks: {
			schema: 'required',
			table: 'required',
			columns: 'string[]',
			nameExplicit: 'boolean',
			schemaTo: 'string',
			tableTo: 'string',
			columnsTo: 'string[]',
			onUpdate: ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
			onDelete: ['NO ACTION', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
		},
		indexes: {
			nameExplicit: 'boolean',
			schema: 'required',
			table: 'required',
			columns: 'string[]', // does not supported indexing expressions
			isUnique: 'boolean',
			where: 'string?',
		},
		uniques: {
			schema: 'required',
			table: 'required',
			nameExplicit: 'boolean',
			columns: 'string[]',
		},
		checks: {
			schema: 'required',
			table: 'required',
			nameExplicit: 'boolean',
			value: 'string',
		},
		defaults: {
			schema: 'required',
			table: 'required',
			column: 'string',
			nameExplicit: 'boolean',
			default: {
				value: 'string',
				type: ['string', 'number', 'bigint', 'text', 'unknown', 'buffer', 'boolean'],
			},
		},
		views: {
			schema: 'required',
			definition: 'string',
			encryption: 'boolean?',
			schemaBinding: 'boolean?',
			viewMetadata: 'boolean?',
			checkOption: 'boolean?',
		},
	});
};

export type MssqlDDL = ReturnType<typeof createDDL>;

export type MssqlEntities = MssqlDDL['_']['types'];
export type MssqlEntity = MssqlEntities[keyof MssqlEntities];
export type DiffEntities = MssqlDDL['_']['diffs']['alter'];

export type Schema = MssqlEntities['schemas'];
export type Table = MssqlEntities['tables'];
export type Column = MssqlEntities['columns'];
export type Index = MssqlEntities['indexes'];
export type DefaultConstraint = MssqlEntities['defaults'];
export type UniqueConstraint = MssqlEntities['uniques'];
export type ForeignKey = MssqlEntities['fks'];
export type PrimaryKey = MssqlEntities['pks'];
export type CheckConstraint = MssqlEntities['checks'];
export type View = MssqlEntities['views'];

export type InterimColumn = Column & {
	isPK: boolean;
	pkName: string | null;
	isUnique: boolean;
	uniqueName: string | null;
};

export type ViewColumn = {
	schema: string;
	view: string;
	name: string;
	type: string;
	notNull: boolean;
};

export type InterimSchema = {
	schemas: Schema[];
	tables: Table[];
	columns: InterimColumn[];
	pks: PrimaryKey[];
	fks: ForeignKey[];
	indexes: Index[];
	checks: CheckConstraint[];
	views: View[];
	viewColumns: ViewColumn[];
	uniques: UniqueConstraint[];
	defaults: DefaultConstraint[];
};

export type TableFull = {
	schema: string;
	name: string;
	columns: Column[];
	uniques: UniqueConstraint[];
	pk: PrimaryKey | null;
	fks: ForeignKey[];
	checks: CheckConstraint[];
	indexes: Index[];
	defaults: DefaultConstraint[];
};

export const fullTableFromDDL = (table: Table, ddl: MssqlDDL): TableFull => {
	const filter = { schema: table.schema, table: table.name } as const;
	const columns = ddl.columns.list(filter);
	const pk = ddl.pks.one(filter);
	const fks = ddl.fks.list(filter);
	const uniques = ddl.uniques.list(filter);
	const checks = ddl.checks.list(filter);
	const indexes = ddl.indexes.list(filter);
	const defaults = ddl.defaults.list(filter);

	return {
		...table,
		columns,
		pk,
		fks,
		uniques,
		checks,
		indexes,
		defaults,
	};
};

export type SchemaError = {
	type: 'table_name_conflict';
	name: string;
} | {
	type: 'column_name_conflict';
	table: string;
	name: string;
} | {
	type: 'view_name_conflict';
	schema: string;
	name: string;
} | {
	type: 'schema_name_conflict';
	name: string;
} | {
	type: 'index_name_conflict';
	schema: string;
	table: string;
	name: string;
} | {
	type: 'index_no_name_conflict';
	schema: string;
	table: string;
	sql: string;
} | {
	type: 'constraint_name_conflict';
	schema: string;
	table: string;
	name: string;
};

export const interimToDDL = (interim: InterimSchema): { ddl: MssqlDDL; errors: SchemaError[] } => {
	const errors = [] as SchemaError[];
	const ddl = createDDL();

	for (const it of interim.schemas) {
		const res = ddl.schemas.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'schema_name_conflict', name: it.name });
		}
	}

	for (const table of interim.tables) {
		const res = ddl.tables.push(table);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'table_name_conflict', name: table.name });
		}
	}

	for (const column of interim.columns) {
		const { isPK, isUnique, pkName, uniqueName, ...rest } = column;

		const res = ddl.columns.push(rest);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'column_name_conflict', table: column.table, name: column.name });
		}
	}

	for (const index of interim.indexes) {
		const res = ddl.indexes.push(index);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'index_name_conflict',
				schema: index.schema,
				table: index.table,
				name: index.name,
			});
		}
	}

	for (const unique of interim.uniques) {
		const res = ddl.uniques.push(unique);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'constraint_name_conflict',
				schema: unique.schema,
				table: unique.table,
				name: unique.name,
			});
		}
	}

	for (const fk of interim.fks) {
		const res = ddl.fks.push(fk);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_conflict', name: fk.name, table: fk.table, schema: fk.schema });
		}
	}

	for (const pk of interim.pks) {
		const res = ddl.pks.push(pk);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_conflict', name: pk.name, table: pk.table, schema: pk.schema });
		}
	}

	for (const column of interim.columns.filter((it) => it.isPK)) {
		const name = column.pkName !== null ? column.pkName : defaultNameForPK(column.table);
		const exists = ddl.pks.one({ schema: column.schema, table: column.table, name: name }) !== null;
		if (exists) continue;

		ddl.pks.push({
			table: column.table,
			name,
			nameExplicit: column.pkName !== null,
			columns: [column.name],
			schema: column.schema,
		});
	}

	for (const column of interim.columns.filter((it) => it.isUnique)) {
		const name = column.uniqueName !== null ? column.uniqueName : defaultNameForUnique(column.table, [column.name]);
		const exists = ddl.uniques.one({ schema: column.schema, table: column.table, name: name }) !== null;
		if (exists) continue;

		ddl.uniques.push({
			schema: column.schema,
			table: column.table,
			name,
			nameExplicit: column.uniqueName !== null,
			columns: [column.name],
		});
	}

	for (const columnDefault of interim.defaults) {
		const res = ddl.defaults.push(columnDefault);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'constraint_name_conflict',
				schema: columnDefault.schema,
				table: columnDefault.table,
				name: columnDefault.name,
			});
		}
	}

	for (const check of interim.checks) {
		const res = ddl.checks.push(check);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'constraint_name_conflict',
				schema: check.schema,
				table: check.table,
				name: check.name,
			});
		}
	}

	for (const view of interim.views) {
		const res = ddl.views.push(view);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'view_name_conflict',
				schema: view.schema,
				name: view.name,
			});
		}
	}

	return { ddl, errors };
};
