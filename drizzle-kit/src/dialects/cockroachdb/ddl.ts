import { create } from '../dialect';
import { defaultNameForPK, defaultNameForUnique } from './grammar';
import { defaults } from './grammar';

export const createDDL = () => {
	return create({
		schemas: {},
		tables: { schema: 'required', isRlsEnabled: 'boolean' },
		enums: {
			schema: 'required',
			values: 'string[]',
		},
		columns: {
			schema: 'required',
			table: 'required',
			type: 'string',
			options: 'string?',
			typeSchema: 'string?',
			notNull: 'boolean',
			dimensions: 'number',
			default: {
				value: 'string',
				type: ['null', 'boolean', 'number', 'string', 'bigint', 'json', 'jsonb', 'func', 'unknown'],
			},
			generated: {
				type: ['stored', 'virtual'],
				as: 'string',
			},
			identity: {
				type: ['always', 'byDefault'],
				increment: 'string?',
				minValue: 'string?',
				maxValue: 'string?',
				startWith: 'string?',
				cache: 'number?',
			},
		},
		indexes: {
			schema: 'required',
			table: 'required',
			nameExplicit: 'boolean',
			columns: [
				{
					value: 'string',
					isExpression: 'boolean',
					asc: 'boolean',
				},
			],
			isUnique: 'boolean',
			where: 'string?',
			method: 'string',
			concurrently: 'boolean',
		},
		fks: {
			schema: 'required',
			table: 'required',
			nameExplicit: 'boolean',
			columns: 'string[]',
			schemaTo: 'string',
			tableTo: 'string',
			columnsTo: 'string[]',
			onUpdate: ['NO ACTION', 'RESTRICT', 'SET NULL', 'CASCADE', 'SET DEFAULT', null],
			onDelete: ['NO ACTION', 'RESTRICT', 'SET NULL', 'CASCADE', 'SET DEFAULT', null],
		},
		pks: {
			schema: 'required',
			table: 'required',
			columns: 'string[]',
			nameExplicit: 'boolean',
		},
		checks: {
			schema: 'required',
			table: 'required',
			value: 'string',
		},
		sequences: {
			schema: 'required',
			incrementBy: 'string?',
			minValue: 'string?',
			maxValue: 'string?',
			startWith: 'string?',
			cacheSize: 'number?',
		},
		roles: {
			createDb: 'boolean?',
			createRole: 'boolean?',
		},
		policies: {
			schema: 'required',
			table: 'required',
			as: ['PERMISSIVE', 'RESTRICTIVE'],
			for: ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE'],
			roles: 'string[]', // TO { role_name | PUBLIC | CURRENT_ROLE | SESSION_USER }
			using: 'string?',
			withCheck: 'string?',
		},
		views: {
			schema: 'required',
			definition: 'string?',
			withNoData: 'boolean?',
			materialized: 'boolean',
		},
	});
};

export type CockroachDbDDL = ReturnType<typeof createDDL>;

export type CockroachDbEntities = CockroachDbDDL['_']['types'];
export type CockroachDbEntity = CockroachDbEntities[keyof CockroachDbEntities];

export type DiffEntities = CockroachDbDDL['_']['diffs']['alter'];

export type Schema = CockroachDbEntities['schemas'];
export type Enum = CockroachDbEntities['enums'];
export type Sequence = CockroachDbEntities['sequences'];
export type Column = CockroachDbEntities['columns'];
export type Identity = Column['identity'];
export type Role = CockroachDbEntities['roles'];
export type Index = CockroachDbEntities['indexes'];
export type ForeignKey = CockroachDbEntities['fks'];
export type PrimaryKey = CockroachDbEntities['pks'];
export type CheckConstraint = CockroachDbEntities['checks'];
export type Policy = CockroachDbEntities['policies'];
export type View = CockroachDbEntities['views'];
export type ViewColumn = {
	schema: string;
	view: string;
	type: string;
	typeSchema: string | null;
	notNull: boolean;
	dimensions: number;
	name: string;
};

export type Table = {
	schema: string;
	name: string;
	columns: Column[];
	indexes: Index[];
	pk: PrimaryKey | null;
	fks: ForeignKey[];
	checks: CheckConstraint[];
	policies: Policy[];
	isRlsEnabled: boolean;
};

export type InterimColumn = Omit<Column, 'primaryKey'> & {
	pk: boolean;
	pkName: string | null;
} & {
	unique: boolean;
	uniqueName: string | null;
};

export type InterimIndex = Index & {
	forPK: boolean;
};

export interface InterimSchema {
	schemas: Schema[];
	enums: Enum[];
	tables: CockroachDbEntities['tables'][];
	columns: InterimColumn[];
	indexes: InterimIndex[];
	pks: PrimaryKey[];
	fks: ForeignKey[];
	checks: CheckConstraint[];
	sequences: Sequence[];
	roles: Role[];
	policies: Policy[];
	views: View[];
	viewColumns: ViewColumn[];
}

export const tableFromDDL = (
	table: CockroachDbEntities['tables'],
	ddl: CockroachDbDDL,
): Table => {
	const filter = { schema: table.schema, table: table.name } as const;
	const columns = ddl.columns.list(filter);
	const pk = ddl.pks.one(filter);
	const fks = ddl.fks.list(filter);
	const checks = ddl.checks.list(filter);
	const indexes = ddl.indexes.list(filter);
	const policies = ddl.policies.list(filter);
	return {
		...table,
		columns,
		pk,
		fks,
		checks,
		indexes,
		policies,
	};
};

interface SchemaDuplicate {
	type: 'schema_name_duplicate';
	name: string;
}

interface EnumDuplicate {
	type: 'enum_name_duplicate';
	name: string;
	schema: string;
}

interface TableDuplicate {
	type: 'table_name_duplicate';
	name: string;
	schema: string;
}
interface ColumnDuplicate {
	type: 'column_name_duplicate';
	schema: string;
	table: string;
	name: string;
}

interface ConstraintDuplicate {
	type: 'constraint_name_duplicate';
	schema: string;
	table: string;
	name: string;
}
interface SequenceDuplicate {
	type: 'sequence_name_duplicate';
	schema: string;
	name: string;
}

interface ViewDuplicate {
	type: 'view_name_duplicate';
	schema: string;
	name: string;
}

interface IndexWithoutName {
	type: 'index_no_name';
	schema: string;
	table: string;
	sql: string;
}

interface IndexDuplicate {
	type: 'index_duplicate';
	schema: string;
	table: string;
	name: string;
}

interface PgVectorIndexNoOp {
	type: 'pgvector_index_noop';
	table: string;
	column: string;
	indexName: string;
	method: string;
}

interface PolicyDuplicate {
	type: 'policy_duplicate';
	schema: string;
	table: string;
	policy: string;
}

interface RoleDuplicate {
	type: 'role_duplicate';
	name: string;
}

export type SchemaError =
	| SchemaDuplicate
	| EnumDuplicate
	| TableDuplicate
	| ColumnDuplicate
	| ViewDuplicate
	| ConstraintDuplicate
	| SequenceDuplicate
	| IndexWithoutName
	| IndexDuplicate
	| PgVectorIndexNoOp
	| RoleDuplicate
	| PolicyDuplicate;

interface PolicyNotLinked {
	type: 'policy_not_linked';
	policy: string;
}
export type SchemaWarning = PolicyNotLinked;

export const fromEntities = (entities: CockroachDbEntity[]) => {
	const ddl = createDDL();
	for (const it of entities) {
		ddl.entities.push(it);
	}

	return ddl;
};
export const interimToDDL = (
	schema: InterimSchema,
): { ddl: CockroachDbDDL; errors: SchemaError[] } => {
	const ddl = createDDL();
	const errors: SchemaError[] = [];

	for (const it of schema.schemas) {
		const res = ddl.schemas.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'schema_name_duplicate', name: it.name });
		}
	}

	for (const it of schema.enums) {
		const res = ddl.enums.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'enum_name_duplicate',
				schema: it.schema,
				name: it.name,
			});
		}
	}

	for (const it of schema.tables) {
		const res = ddl.tables.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'table_name_duplicate',
				schema: it.schema,
				name: it.name,
			});
		}
	}

	for (const column of schema.columns) {
		const { pk, pkName, unique, uniqueName, ...rest } = column;
		const res = ddl.columns.push(rest);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'column_name_duplicate',
				schema: column.schema,
				table: column.table,
				name: column.name,
			});
		}
	}

	for (const it of schema.indexes) {
		const { forPK, ...rest } = it;
		const res = ddl.indexes.push(rest);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'index_duplicate',
				schema: it.schema,
				table: it.table,
				name: it.name,
			});
		}

		// TODO: check within schema
	}

	for (const it of schema.fks) {
		const res = ddl.fks.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'constraint_name_duplicate',
				schema: it.schema,
				table: it.table,
				name: it.name,
			});
		}
	}

	for (const it of schema.pks) {
		const res = ddl.pks.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'constraint_name_duplicate',
				schema: it.schema,
				table: it.table,
				name: it.name,
			});
		}
	}

	for (const column of schema.columns.filter((it) => it.pk)) {
		const name = column.pkName !== null ? column.pkName : defaultNameForPK(column.table);
		const exists = ddl.pks.one({ schema: column.schema, table: column.table, name: name }) !== null;
		if (exists) continue;

		ddl.pks.push({
			schema: column.schema,
			table: column.table,
			name,
			nameExplicit: column.pkName !== null,
			columns: [column.name],
		});
	}

	for (const column of schema.columns.filter((it) => it.unique)) {
		const name = column.uniqueName !== null ? column.uniqueName : defaultNameForUnique(column.table, column.name);
		const exists = ddl.indexes.one({ schema: column.schema, table: column.table, name: name }) !== null;
		if (exists) continue;

		ddl.indexes.push({
			table: column.table,
			name,
			concurrently: false,
			isUnique: true,
			method: defaults.index.method,
			nameExplicit: !!column.uniqueName,
			where: null,
			schema: column.schema,
			columns: [{ asc: true, isExpression: false, value: column.name }],
		});
	}

	for (const it of schema.checks) {
		const res = ddl.checks.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'constraint_name_duplicate',
				schema: it.schema,
				table: it.table,
				name: it.name,
			});
		}
	}

	for (const it of schema.sequences) {
		const res = ddl.sequences.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'sequence_name_duplicate',
				schema: it.schema,
				name: it.name,
			});
		}
	}

	for (const it of schema.roles) {
		const res = ddl.roles.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'role_duplicate', name: it.name });
		}
	}
	for (const it of schema.policies) {
		const res = ddl.policies.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'policy_duplicate',
				schema: it.schema,
				table: it.table,
				policy: it.name,
			});
		}
	}
	for (const it of schema.views) {
		const res = ddl.views.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'view_name_duplicate',
				schema: it.schema,
				name: it.name,
			});
		}
	}

	for (const it of ddl.entities.list()) {
		let err = false;

		if (!ddl.entities.validate(it)) {
			console.log('invalid entity:', it);
			err = true;
		}
		if (err) throw new Error();
	}

	return { ddl, errors };
};
