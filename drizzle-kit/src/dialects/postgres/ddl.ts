import { SchemaError } from '../../utils';
import { create } from '../dialect';

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
			typeSchema: 'string?',
			primaryKey: 'boolean',
			notNull: 'boolean',
			default: {
				value: 'string',
				expression: 'boolean',
			},
			// TODO: remove isunuque, uniquename, nullsnotdistinct
			// these should be in unique constraints ddl and squash
			// in sql convertor when possible ??
			unique: {
				name: 'string?',
				nullsNotDistinct: 'boolean?',
			},
			generated: {
				type: ['stored', 'virtual'],
				as: 'string',
			},
			identity: {
				name: 'string',
				type: ['always', 'byDefault'],
				increment: 'string?',
				minValue: 'string?',
				maxValue: 'string?',
				startWith: 'string?',
				cache: 'string?',
				cycle: 'boolean?',
			},
		},
		indexes: {
			schema: 'required',
			table: 'required',
			columns: [{
				value: 'string',
				isExpression: 'boolean',
				asc: 'boolean',
				nullsFirst: 'boolean',
				opclass: {
					name: 'string',
					default: 'boolean',
				},
			}],
			isUnique: 'boolean',
			where: 'string?',
			with: 'string',
			method: 'string',
			concurrently: 'boolean',
		},
		fks: {
			schema: 'required',
			table: 'required',
			tableFrom: 'string',
			columnsFrom: 'string[]',
			schemaTo: 'string',
			tableTo: 'string',
			columnsTo: 'string[]',
			onUpdate: 'string?',
			onDelete: 'string?',
		},
		pks: {
			schema: 'required',
			table: 'required',
			columns: 'string[]',
			isNameExplicit: 'boolean',
		},
		uniques: {
			schema: 'required',
			table: 'required',
			columns: 'string[]',
			nullsNotDistinct: 'boolean',
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
			cacheSize: 'string?',
			cycle: 'boolean?',
		},
		roles: {
			createDb: 'boolean?',
			createRole: 'boolean?',
			inherit: 'boolean?',
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
			with: {
				checkOption: ['local', 'cascaded', null],
				securityBarrier: 'boolean?',
				securityInvoker: 'boolean?',
				fillfactor: 'number?',
				toastTupleTarget: 'number?',
				parallelWorkers: 'number?',
				autovacuumEnabled: 'boolean?',
				vacuumIndexCleanup: ['auto', 'off', 'on', null],
				vacuumTruncate: 'boolean?',
				autovacuumVacuumThreshold: 'number?',
				autovacuumVacuumScaleFactor: 'number?',
				autovacuumVacuumCostDelay: 'number?',
				autovacuumVacuumCostLimit: 'number?',
				autovacuumFreezeMinAge: 'number?',
				autovacuumFreezeMaxAge: 'number?',
				autovacuumFreezeTableAge: 'number?',
				autovacuumMultixactFreezeMinAge: 'number?',
				autovacuumMultixactFreezeMaxAge: 'number?',
				autovacuumMultixactFreezeTableAge: 'number?',
				logAutovacuumMinDuration: 'number?',
				userCatalogTable: 'boolean?',
			},
			withNoData: 'boolean?',
			using: {
				name: 'string',
				default: 'boolean',
			},
			tablespace: 'string?',
			materialized: 'boolean',
			isExisting: 'boolean',
		},
	});
};

export type PostgresDDL = ReturnType<typeof createDDL>;

export type PostgresEntities = PostgresDDL['_']['types'];
export type PostgresEntity = PostgresEntities[keyof PostgresEntities];

export type DiffEntities = PostgresDDL['_']['diffs']['alter'];

export type Schema = PostgresEntities['schemas'];
export type Enum = PostgresEntities['enums'];
export type Sequence = PostgresEntities['sequences'];
export type Column = PostgresEntities['columns'];
export type Identity = Column['identity'];
export type Role = PostgresEntities['roles'];
export type Index = PostgresEntities['indexes'];
export type ForeignKey = PostgresEntities['fks'];
export type PrimaryKey = PostgresEntities['pks'];
export type UniqueConstraint = PostgresEntities['uniques'];
export type CheckConstraint = PostgresEntities['checks'];
export type Policy = PostgresEntities['policies'];
export type View = PostgresEntities['views'];

export type Table = {
	schema: string;
	name: string;
	columns: Column[];
	indexes: Index[];
	pk: PrimaryKey | null;
	fks: ForeignKey[];
	uniques: UniqueConstraint[];
	checks: CheckConstraint[];
	policies: Policy[];
	isRlsEnabled: boolean;
};

export interface InterimSchema {
	schemas: Schema[];
	enums: Enum[];
	tables: PostgresEntities['tables'][];
	columns: Column[];
	indexes: Index[];
	pks: PrimaryKey[];
	fks: ForeignKey[];
	uniques: UniqueConstraint[];
	checks: CheckConstraint[];
	sequences: Sequence[];
	roles: Role[];
	policies: Policy[];
	views: View[];
}

export const tableFromDDL = (table: PostgresEntities['tables'], ddl: PostgresDDL): Table => {
	const filter = { schema: table.schema, table: table.name } as const;
	const columns = ddl.columns.list(filter);
	const pk = ddl.pks.one(filter);
	const fks = ddl.fks.list(filter);
	const uniques = ddl.uniques.list(filter);
	const checks = ddl.checks.list(filter);
	const indexes = ddl.indexes.list(filter);
	const policies = ddl.policies.list(filter);
	return {
		...table,
		columns,
		pk,
		fks,
		uniques,
		checks,
		indexes,
		policies,
	};
};

export const interimToDDL = (schema: InterimSchema): { ddl: PostgresDDL; errors: SchemaError[] } => {
	const ddl = createDDL();
	const errors: SchemaError[] = [];

	for (const it of schema.schemas) {
		const res = ddl.schemas.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'schema_name_duplicate', name: it.name });
		}
	}

	for (const it of schema.enums) {
		const res = ddl.enums.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'enum_name_duplicate', schema: it.schema, name: it.name });
		}
	}

	for (const it of schema.tables) {
		const res = ddl.tables.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'table_name_duplicate', schema: it.schema, name: it.name });
		}
	}

	for (const column of schema.columns) {
		const res = ddl.columns.insert(column);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'column_name_duplicate', schema: column.schema, table: column.table, name: column.name });
		}
	}

	for (const it of schema.indexes) {
		const res = ddl.indexes.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'index_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}
	for (const it of schema.fks) {
		const res = ddl.fks.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}
	for (const it of schema.pks) {
		const res = ddl.pks.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}
	for (const it of schema.uniques) {
		const res = ddl.uniques.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}
	for (const it of schema.checks) {
		const res = ddl.checks.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}

	for (const it of schema.sequences) {
		const res = ddl.sequences.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'sequence_name_duplicate', schema: it.schema, name: it.name });
		}
	}

	for (const it of schema.roles) {
		const res = ddl.roles.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'role_duplicate', name: it.name });
		}
	}
	for (const it of schema.policies) {
		const res = ddl.policies.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'policy_duplicate', schema: it.schema, table: it.table, policy: it.name });
		}
	}
	for (const it of schema.views) {
		const res = ddl.views.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'view_name_duplicate', schema: it.schema, name: it.name });
		}
	}

	return { ddl, errors };
};
