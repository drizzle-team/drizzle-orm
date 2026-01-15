import type { SchemaForPull } from 'src/cli/commands/pull-common';
import { create } from '../dialect';
import { defaultNameForPK, defaultNameForUnique } from './grammar';

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
			notNull: 'boolean',
			dimensions: 'number',
			default: 'string?',
			generated: {
				type: ['stored'],
				as: 'string',
			},
			identity: {
				name: 'string',
				type: ['always', 'byDefault'],
				increment: 'string?',
				minValue: 'string?',
				maxValue: 'string?',
				startWith: 'string?',
				cache: 'number?',
				cycle: 'boolean?',
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
					nullsFirst: 'boolean',
					opclass: {
						name: 'string',
						default: 'boolean',
					},
				},
			],
			isUnique: 'boolean',
			where: 'string?',
			with: 'string',
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
		uniques: {
			schema: 'required',
			table: 'required',
			nameExplicit: 'boolean',
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
			cacheSize: 'number?',
			cycle: 'boolean?',
		},
		roles: {
			superuser: 'boolean?',
			createDb: 'boolean?',
			createRole: 'boolean?',
			inherit: 'boolean?',
			canLogin: 'boolean?',
			replication: 'boolean?',
			bypassRls: 'boolean?',
			connLimit: 'number?',
			password: 'string?',
			validUntil: 'string?',
		},
		privileges: {
			grantor: 'string',
			grantee: 'string',
			schema: 'required',
			table: 'required',
			type: ['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'],
			isGrantable: 'boolean',
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
			using: 'string?',
			tablespace: 'string?',
			materialized: 'boolean',
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
export type Privilege = PostgresEntities['privileges'];
export type Index = PostgresEntities['indexes'];
export type IndexColumn = Index['columns'][number];
export type ForeignKey = PostgresEntities['fks'];
export type PrimaryKey = PostgresEntities['pks'];
export type UniqueConstraint = PostgresEntities['uniques'];
export type CheckConstraint = PostgresEntities['checks'];
export type Policy = PostgresEntities['policies'];
export type View = PostgresEntities['views'];

export type ViewColumn = {
	schema: string;
	view: string;
	type: string;
	typeDimensions: number;
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
	uniques: UniqueConstraint[];
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
	uniqueNullsNotDistinct: boolean;
};

export type InterimIndex = Index & {
	forPK: boolean;
	forUnique: boolean;
};

export interface InterimSchema {
	schemas: Schema[];
	enums: Enum[];
	tables: PostgresEntities['tables'][];
	columns: InterimColumn[];
	indexes: InterimIndex[];
	pks: PrimaryKey[];
	fks: ForeignKey[];
	uniques: UniqueConstraint[];
	checks: CheckConstraint[];
	sequences: Sequence[];
	roles: Role[];
	privileges: Privilege[];
	policies: Policy[];
	views: View[];
	viewColumns: ViewColumn[];
}

export function postgresToRelationsPull(schema: PostgresDDL): SchemaForPull {
	return Object.values(schema.tables.list()).map((table) => {
		const rawTable = tableFromDDL(table, schema);
		return {
			schema: rawTable.schema,
			foreignKeys: rawTable.fks,
			columns: rawTable.columns.map((it) => ({ name: it.name })),
			uniques: [
				...Object.values(rawTable.uniques).map((unq) => ({
					columns: unq.columns,
				})),
				...Object.values(rawTable.indexes).map((idx) => ({
					columns: idx.columns.map((idxc) => {
						if (!idxc.isExpression && idx.isUnique) {
							return idxc.value;
						}
					}).filter((item) => item !== undefined),
				})),
			],
		};
	});
}

export const tableFromDDL = (
	table: PostgresEntities['tables'],
	ddl: PostgresDDL,
): Table => {
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

interface PrivilegeDuplicate {
	type: 'privilege_duplicate';
	name: string;
}

interface EnumValuesDuplicate {
	type: 'enum_values_duplicate';
	schema: string;
	name: string;
}

export type SchemaError =
	| EnumValuesDuplicate
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
	| PolicyDuplicate
	| PrivilegeDuplicate;

interface PolicyNotLinked {
	type: 'policy_not_linked';
	policy: string;
}
export type SchemaWarning = PolicyNotLinked;

export const fromEntities = (entities: PostgresEntity[]) => {
	const ddl = createDDL();
	for (const it of entities) {
		ddl.entities.push(it);
	}

	return ddl;
};

export const interimToDDL = (
	schema: InterimSchema,
): { ddl: PostgresDDL; errors: SchemaError[] } => {
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

		const uniqueElements = new Set(it.values);
		if (uniqueElements.size !== it.values.length) {
			errors.push({
				type: 'enum_values_duplicate',
				schema: it.schema,
				name: it.name,
			});
		}

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
		const { pk: _1, pkName: _2, unique: _3, uniqueName: _4, uniqueNullsNotDistinct: _5, ...rest } = column;

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
		const { forPK: _1, forUnique: _2, ...rest } = it;
		// TODO: check within schema, pk =[schema, table, name], we need only [schema, table]
		const res = ddl.indexes.push(rest);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'index_duplicate',
				schema: it.schema,
				table: it.table,
				name: it.name,
			});
		}
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
		const exists = ddl.pks.one({ schema: column.schema, table: column.table }) !== null;
		if (exists) continue;

		ddl.pks.push({
			schema: column.schema,
			table: column.table,
			name,
			nameExplicit: column.pkName !== null,
			columns: [column.name],
		});
	}

	for (const it of schema.uniques) {
		const res = ddl.uniques.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'constraint_name_duplicate',
				schema: it.schema,
				table: it.table,
				name: it.name,
			});
		}
	}

	for (const column of schema.columns.filter((it) => it.unique)) {
		const name = column.uniqueName !== null ? column.uniqueName : defaultNameForUnique(column.table, column.name);
		const exists = ddl.uniques.one({ schema: column.schema, table: column.table, columns: [column.name] }) !== null;
		if (exists) continue;

		ddl.uniques.push({
			schema: column.schema,
			table: column.table,
			name,
			nameExplicit: column.uniqueName !== null,
			nullsNotDistinct: column.uniqueNullsNotDistinct,
			columns: [column.name],
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

	for (const it of schema.privileges) {
		const res = ddl.privileges.push(it);
		if (res.status === 'CONFLICT') {
			errors.push({
				type: 'privilege_duplicate',
				name: it.name,
			});
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
