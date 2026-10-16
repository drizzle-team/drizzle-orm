import { escapeSingleQuotes, type Simplify, wrapWith } from '../../utils';
import { createDDL } from './ddl';
import type { PostgresEntities } from './ddl';
import {
	builtinPolicyRoles,
	defaultNameForPK,
	defaults,
	defaultToSQL,
	isDefaultAction,
	isSerialType,
	mapSerialToInt,
} from './grammar';
import type { SnapshotStatement, StoredRow } from './snapshot-statements';
import type { JsonStatement } from './statements';

type StatementType = JsonStatement['type'];
type StoredOf<TType extends StatementType> = Simplify<Omit<Extract<SnapshotStatement, { type: TType }>, 'type'>>;

// Defines how a snapshot stores one statement kind and how that kind becomes SQL. `store` picks the fields
// that the snapshot keeps. `convert` gets only these fields, so the SQL of a migration can be built again
// from its snapshot, and a field that `store` does not keep is a type error in `convert`.
export const convertor = <TType extends StatementType>(
	type: TType,
	store: (statement: Extract<JsonStatement, { type: TType }>) => StoredOf<TType>,
	convert: (statement: StoredOf<TType>) => string | string[],
) => {
	return { type, store, convert };
};

const rowFields = Object.fromEntries(
	Object.entries(createDDL()._.defs).map(([type, def]) => [type, Object.keys(def)]),
) as Record<keyof PostgresEntities, string[]>;

// Copies a row into a stored statement. The copy keeps only the fields that the DDL defines for `type`, so
// the snapshot does not store `entityType` or the fields that the diff adds.
const row = <K extends keyof PostgresEntities>(type: K, source: StoredRow<K>): StoredRow<K> =>
	Object.fromEntries(rowFields[type].map((name) => [name, (source as Record<string, unknown>)[name]])) as StoredRow<K>;

const inTable = ({ schema, table, name }: { schema: string; table: string; name: string }) => ({ schema, table, name });

const inSchema = ({ schema, name }: { schema: string; name: string }) => ({ schema, name });
const viewName = ({ schema, name, materialized }: StoredRow<'views'>) => ({ schema, name, materialized });

const constraint = (it: { schema: string; table: string; name: string; columns: string[] }) => ({
	...inTable(it),
	columns: it.columns,
});

const uniqueness = ({ columns, isUnique, where }: StoredRow<'indexes'>) => ({
	columns: columns.map(({ value, isExpression }) => ({ value, isExpression })),
	isUnique,
	where,
});

const createSchemaConvertor = convertor('create_schema', ({ name }) => ({ name }), (st) => {
	return `CREATE SCHEMA "${st.name}";\n`;
});

const dropSchemaConvertor = convertor('drop_schema', ({ name }) => ({ name }), (st) => {
	return `DROP SCHEMA "${st.name}";\n`;
});

const renameSchemaConvertor = convertor('rename_schema', ({ from, to }) => ({
	from: { name: from.name },
	to: { name: to.name },
}), (st) => {
	return `ALTER SCHEMA "${st.from.name}" RENAME TO "${st.to.name}";\n`;
});

const createViewConvertor = convertor('create_view', ({ view }) => ({ view: row('views', view) }), (st) => {
	const { definition, name: viewName, schema, with: withOption, materialized, withNoData, tablespace, using } = st.view;

	const name = schema !== 'public' ? `"${schema}"."${viewName}"` : `"${viewName}"`;
	let statement = materialized ? `CREATE MATERIALIZED VIEW ${name}` : `CREATE VIEW ${name}`;
	if (using) statement += ` USING "${using}"`;

	const options: string[] = [];
	if (withOption) {
		statement += ` WITH (`;
		for (const [key, value] of Object.entries(withOption)) {
			if (value === null) continue;
			options.push(`${key.snake_case()} = ${value}`);
		}
		statement += options.join(', ');
		statement += `)`;
	}

	if (tablespace) statement += ` TABLESPACE ${tablespace}`;
	statement += ` AS (${definition})`;
	if (withNoData) statement += ` WITH NO DATA`;
	statement += `;`;

	return statement;
});

const dropViewConvertor = convertor('drop_view', ({ view }) => ({ view: viewName(view) }), (st) => {
	const { name: viewName, schema, materialized } = st.view;
	const name = schema !== 'public' ? `"${schema}"."${viewName}"` : `"${viewName}"`;
	return `DROP${materialized ? ' MATERIALIZED' : ''} VIEW ${name};`;
});

const renameViewConvertor = convertor(
	'rename_view',
	({ from, to }) => ({ from: viewName(from), to: inSchema(to) }),
	(st) => {
		const materialized = st.from.materialized;
		const nameFrom = st.from.schema !== 'public' ? `"${st.from.schema}"."${st.from.name}"` : `"${st.from.name}"`;

		return `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW ${nameFrom} RENAME TO "${st.to.name}";`;
	},
);

const moveViewConvertor = convertor('move_view', ({ fromSchema, toSchema, view }) => ({
	fromSchema,
	toSchema,
	view: { name: view.name, materialized: view.materialized },
}), (st) => {
	const { fromSchema, toSchema, view } = st;
	const from = fromSchema === 'public' ? `"${view.name}"` : `"${fromSchema}"."${view.name}"`;
	return `ALTER${view.materialized ? ' MATERIALIZED' : ''} VIEW ${from} SET SCHEMA "${toSchema}";`;
});

const alterViewConvertor = convertor('alter_view', ({ view, diff }) => ({
	view: viewName(view),
	diff: { with: diff.with, tablespace: diff.tablespace, using: diff.using },
}), (st) => {
	const diff = st.diff;

	const statements = [] as string[];
	const key = st.view.schema !== 'public' ? `"${st.view.schema}"."${st.view.name}"` : `"${st.view.name}"`;
	const viewClause = st.view.materialized ? `MATERIALIZED VIEW ${key}` : `VIEW ${key}`;

	const withFrom = diff.with?.from || {};
	const withTo = diff.with?.to || {};

	const resetOptions = Object.entries(withFrom).filter(([key, val]) => {
		return val !== null && (key in withTo ? withTo[key as keyof typeof withTo] === null : true);
	}).map((it) => it[0].snake_case());

	const setOptions = Object.entries(withTo).filter(([key, val]) => {
		const from = key in withFrom ? withFrom[key as keyof typeof withFrom] : null;
		return val !== null && from !== val;
	}).map((it) => `${it[0].snake_case()} = ${it[1]}`).join(', ');

	if (setOptions.length > 0) statements.push(`ALTER ${viewClause} SET (${setOptions});`);
	if (resetOptions.length > 0) statements.push(`ALTER ${viewClause} RESET (${resetOptions.join(', ')});`);
	// TODO: reset missing options, set changed options and new options?

	if (diff.tablespace) {
		const to = diff.tablespace.to || defaults.tablespace;
		statements.push(`ALTER ${viewClause} SET TABLESPACE "${to}";`);
	}

	if (diff.using) {
		const toUsing = diff.using.to ?? defaults.accessMethod;
		statements.push(`ALTER ${viewClause} SET ACCESS METHOD "${toUsing}";`);
	}

	return statements;
});

const dropPolicySql = (policy: { schema: string; table: string; name: string }) => {
	const tableNameWithSchema = policy.schema !== 'public'
		? `"${policy.schema}"."${policy.table}"`
		: `"${policy.table}"`;

	return `DROP POLICY "${policy.name}" ON ${tableNameWithSchema};`;
};

const createTableConvertor = convertor('create_table', ({ table }) => ({
	table: {
		schema: table.schema,
		name: table.name,
		enablesRls: table.isRlsEnabled || table.policies.length > 0,
		columns: table.columns.map((it) => row('columns', it)),
		pk: table.pk && row('pks', table.pk),
		uniques: table.uniques.map((it) => row('uniques', it)),
		checks: table.checks.map((it) => row('checks', it)),
	},
}), (st) => {
	const { schema, name, columns, pk, uniques, checks, enablesRls } = st.table;

	const statements = [] as string[];
	let statement = '';
	const key = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	statement += `CREATE TABLE ${key} (\n`;
	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === column.name
			&& pk.name === defaultNameForPK(column.table);
		const isSerial = isSerialType(column.type);

		const primaryKeyStatement = isPK ? ' PRIMARY KEY' : '';
		const notNullStatement = pk?.columns.includes(column.name) || isSerial
			? ''
			: column.notNull && !column.identity
			? ' NOT NULL'
			: '';
		const defaultStatement = column.default ? ` DEFAULT ${defaultToSQL(column)}` : '';

		const unique = uniques.find((u) => u.columns.length === 1 && u.columns[0] === column.name);

		const unqiueConstraintPrefix = unique
			? unique.nameExplicit ? `CONSTRAINT "${unique.name}" UNIQUE` : 'UNIQUE'
			: '';

		const uniqueConstraintStatement = unique
			? ` ${unqiueConstraintPrefix}${unique.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''}`
			: '';

		const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
			? `"${column.typeSchema}".`
			: '';

		const colType = column.typeSchema
			? `"${column.type}"`
			: column.type;
		const type = `${schemaPrefix}${colType}${'[]'.repeat(column.dimensions)}`;

		const generated = column.generated;

		const generatedStatement = generated ? ` GENERATED ALWAYS AS (${generated?.as}) STORED` : '';

		const identityWithSchema = schema !== 'public'
			? `"${schema}"."${column.identity?.name}"`
			: `"${column.identity?.name}"`;

		const identity = column.identity
			? ` GENERATED ${
				column.identity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'
			} AS IDENTITY (sequence name ${identityWithSchema}${
				column.identity.increment
					? ` INCREMENT BY ${column.identity.increment}`
					: ''
			}${
				column.identity.minValue
					? ` MINVALUE ${column.identity.minValue}`
					: ''
			}${
				column.identity.maxValue
					? ` MAXVALUE ${column.identity.maxValue}`
					: ''
			}${
				column.identity.startWith
					? ` START WITH ${column.identity.startWith}`
					: ''
			}${column.identity.cache ? ` CACHE ${column.identity.cache}` : ''}${column.identity.cycle ? ` CYCLE` : ''})`
			: '';

		statement += '\t'
			+ `"${column.name}" ${type}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${uniqueConstraintStatement}${identity}`;
		statement += i === columns.length - 1 ? '' : ',\n';
	}

	if (pk && (pk.columns.length > 1 || pk.name !== defaultNameForPK(st.table.name))) {
		statement += ',\n';
		statement += `\tCONSTRAINT "${pk.name}" PRIMARY KEY("${pk.columns.join(`","`)}")`;
	}

	for (const it of uniques.filter((u) => u.columns.length > 1)) {
		statement += ',\n';
		statement += `\tCONSTRAINT "${it.name}" UNIQUE${it.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''}("${
			it.columns.join(`","`)
		}")`;
	}

	for (const check of checks) {
		statement += ',\n';
		statement += `\tCONSTRAINT "${check.name}" CHECK (${check.value})`;
	}

	statement += `\n);`;
	statement += `\n`;
	statements.push(statement);

	if (enablesRls) {
		statements.push(toggleRlsConvertor.convert({
			isRlsEnabled: true,
			name: st.table.name,
			schema: st.table.schema,
		}) as string);
	}

	return statements;
});

const dropTableConvertor = convertor('drop_table', ({ table }) => ({
	table: { schema: table.schema, name: table.name, policies: table.policies.map(inTable) },
}), (st) => {
	const { name, schema, policies } = st.table;

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${name}"`
		: `"${name}"`;

	const droppedPolicies = policies.map(dropPolicySql);

	return [
		...droppedPolicies,
		`DROP TABLE ${tableNameWithSchema};`,
	];
});

const renameTableConvertor = convertor('rename_table', ({ schema, from, to }) => ({ schema, from, to }), (st) => {
	const schemaPrefix = st.schema !== 'public'
		? `"${st.schema}".`
		: '';

	return `ALTER TABLE ${schemaPrefix}"${st.from}" RENAME TO "${st.to}";`;
});

const moveTableConvertor = convertor('move_table', ({ name, from, to, indexNames }) => ({
	name,
	from,
	to,
	indexNames,
}), (st) => {
	const from = st.from !== 'public' ? `"${st.from}"."${st.name}"` : `"${st.name}"`;

	return `ALTER TABLE ${from} SET SCHEMA "${st.to}";\n`;
});

const addColumnSql = (st: { column: StoredRow<'columns'>; isPK: boolean; isCompositePK: boolean }) => {
	const { schema, table, name, identity, generated } = st.column;
	const column = st.column;

	const primaryKeyStatement = st.isPK ? ' PRIMARY KEY' : '';

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	const defaultStatement = column.default ? ` DEFAULT ${defaultToSQL(column)}` : '';

	const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
		? `"${column.typeSchema}".`
		: '';

	const type = column.typeSchema
		? `"${column.type}"`
		: column.type;
	let fixedType = `${schemaPrefix}${type}${'[]'.repeat(column.dimensions)}`;

	const isSerial = isSerialType(column.type);

	const notNullStatement = column.notNull && !identity && !generated && !isSerial && !st.isCompositePK
		? ' NOT NULL'
		: '';

	const identityWithSchema = schema !== 'public'
		? `"${schema}"."${identity?.name}"`
		: `"${identity?.name}"`;

	const identityStatement = identity
		? ` GENERATED ${
			identity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'
		} AS IDENTITY (sequence name ${identityWithSchema}${
			identity.increment
				? ` INCREMENT BY ${identity.increment}`
				: ''
		}${
			identity.minValue
				? ` MINVALUE ${identity.minValue}`
				: ''
		}${
			identity.maxValue
				? ` MAXVALUE ${identity.maxValue}`
				: ''
		}${
			identity.startWith
				? ` START WITH ${identity.startWith}`
				: ''
		}${identity.cache ? ` CACHE ${identity.cache}` : ''}${identity.cycle ? ` CYCLE` : ''})`
		: '';

	const generatedStatement = column.generated ? ` GENERATED ALWAYS AS (${column.generated.as}) STORED` : '';

	return `ALTER TABLE ${tableNameWithSchema} ADD COLUMN "${name}" ${fixedType}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${identityStatement};`;
};

// Writes ADD COLUMN without PRIMARY KEY (`isPK: false`), because the primary key of a new column has its own
// statement, `add_pk` or `alter_pk`.
const addColumnConvertor = convertor('add_column', ({ column, isCompositePK }) => ({
	column: row('columns', column),
	isCompositePK,
}), (st) => addColumnSql({ ...st, isPK: false }));

const dropColumnConvertor = convertor('drop_column', ({ column }) => ({ column: inTable(column) }), (st) => {
	const { schema, table, name } = st.column;

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP COLUMN "${name}";`;
});

const renameColumnConvertor = convertor(
	'rename_column',
	({ from, to }) => ({ from: inTable(from), to: inTable(to) }),
	(st) => {
		const { table, schema } = st.from;
		const tableNameWithSchema = schema !== 'public'
			? `"${schema}"."${table}"`
			: `"${table}"`;

		return `ALTER TABLE ${tableNameWithSchema} RENAME COLUMN "${st.from.name}" TO "${st.to.name}";`;
	},
);

const recreateColumnConvertor = convertor('recreate_column', ({ diff, isPK }) => ({
	column: row('columns', diff.$right),
	isPK,
}), (st) => {
	// AlterTableAlterColumnSetExpressionConvertor
	// AlterTableAlterColumnAlterGeneratedConvertor

	const drop = dropColumnConvertor.convert({ column: st.column }) as string;
	const add = addColumnSql({ column: st.column, isPK: st.isPK, isCompositePK: false });

	return [drop, add];
});

const recreateIndexConvertor = convertor('recreate_index', ({ index, diff, shouldDrop }) => ({
	index: row('indexes', index),
	shouldDrop,
	old: uniqueness(diff.$left),
}), (st) => {
	// AlterTableAlterColumnSetExpressionConvertor
	// AlterTableAlterColumnAlterGeneratedConvertor

	const res: string[] = [];
	if (st.shouldDrop) res.push(dropIndexConvertor.convert({ index: st.index }) as string);
	res.push(createIndexConvertor.convert({ index: st.index }) as string);

	return res;
});

const alterColumnConvertor = convertor('alter_column', ({ diff, to, isEnum, wasEnum, wasSerial, toSerial }) => ({
	to: row('columns', to),
	oldDefault: diff.$left.default,
	isEnum,
	wasEnum,
	wasSerial,
	toSerial,
	diff: {
		type: diff.type,
		typeSchema: diff.typeSchema,
		dimensions: diff.dimensions,
		default: diff.default,
		notNull: diff.notNull,
		generated: diff.generated,
		identity: diff.identity,
	},
}), (st) => {
	const { diff, to: column, isEnum, wasEnum, wasSerial, toSerial } = st;
	const statements = [] as string[];

	const key = column.schema !== 'public'
		? `"${column.schema}"."${column.table}"`
		: `"${column.table}"`;

	// `hasNewType` decides if SET DATA TYPE runs. It counts a new `typeSchema`, because an enum with the same
	// name in another schema is another type. A new count of `dimensions` gets a plain cast. Postgres has no
	// cast between most scalar types and their array types, so the user edits that USING clause.
	const hasNewType = !!(diff.type || diff.typeSchema || diff.dimensions);
	const recreateDefault = hasNewType && (isEnum || wasEnum || diff.dimensions) && st.oldDefault;
	if (recreateDefault) {
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
	}

	if (hasNewType) {
		const typeSchema = column.typeSchema && column.typeSchema !== 'public' ? `"${column.typeSchema}".` : '';
		const textProxy = wasEnum && isEnum ? 'text::' : ''; // using enum1::text::enum2
		// SERIAL is valid only in a new column, so SET DATA TYPE writes the integer type of a serial type
		// (`isSerial`). A column that stays serial keeps its sequence and its default. The sequence keeps its
		// integer type too, so a change from serial to bigserial does not change the maximum of the sequence.
		const isSerial = isSerialType(column.type);
		const suffix = isEnum
			? ` USING "${column.name}"::${textProxy}${typeSchema}"${column.type}"${'[]'.repeat(column.dimensions)}`
			: ` USING "${column.name}"::${isSerial ? mapSerialToInt(column.type) : column.type}${
				'[]'.repeat(column.dimensions)
			}`;

		const type = typeSchema
			? `${typeSchema}"${column.type}"`
			: isEnum
			? `"${column.type}"`
			: isSerial
			? mapSerialToInt(column.type)
			: column.type;

		if (wasSerial && !isSerial) {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
			const sequenceKey = column.schema !== 'public'
				? `"${column.schema}"."${column.table}_${column.name}_seq"`
				: `"${column.table}_${column.name}_seq"`;
			statements.push(`DROP SEQUENCE ${sequenceKey};`);
		}

		if (toSerial) {
			const sequenceKey = column.schema !== 'public'
				? `"${column.schema}"."${column.table}_${column.name}_seq"`
				: `"${column.table}_${column.name}_seq"`;
			const sequenceName = column.schema !== 'public'
				? `${column.schema}.${column.table}_${column.name}_seq`
				: `${column.table}_${column.name}_seq`;

			statements.push(`CREATE SEQUENCE ${sequenceKey};`);
			statements.push(
				`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT nextval('${sequenceName}')`,
			);
			statements.push(`ALTER SEQUENCE ${sequenceKey} OWNED BY "${column.schema}"."${column.table}"."${column.name}";`);
		}

		statements.push(
			`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE ${type}${
				'[]'.repeat(column.dimensions)
			}${suffix};`,
		);

		if (recreateDefault && column.default) {
			statements.push(
				`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${defaultToSQL(column)};`,
			);
		}
	}

	if (diff.default && !recreateDefault) {
		if (diff.default.to) {
			statements.push(
				`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${defaultToSQL(column)};`,
			);
		} else {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
		}
	}

	if (diff.generated && diff.generated.to === null) {
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP EXPRESSION;`);
	}

	if (diff.identity) {
		if (diff.identity.from === null) {
			const identity = column.identity!;
			const identityWithSchema = column.schema !== 'public'
				? `"${column.schema}"."${identity.name}"`
				: `"${identity.name}"`;
			const typeClause = identity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT';
			const incrementClause = identity.increment ? ` INCREMENT BY ${identity.increment}` : '';
			const minClause = identity.minValue ? ` MINVALUE ${identity.minValue}` : '';
			const maxClause = identity.maxValue ? ` MAXVALUE ${identity.maxValue}` : '';
			const startWith = identity.startWith ? ` START WITH ${identity.startWith}` : '';
			const cache = identity.cache ? ` CACHE ${identity.cache}` : '';
			const cycle = identity.cycle ? ` CYCLE` : '';
			const identityStatement =
				`GENERATED ${typeClause} AS IDENTITY (sequence name ${identityWithSchema}${incrementClause}${minClause}${maxClause}${startWith}${cache}${cycle})`;
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" ADD ${identityStatement};`);

			if (wasSerial && column.identity) {
				statements.push(
					`SELECT setval('${column.identity.name}'::regclass, (SELECT COALESCE(MAX(id), 1) FROM ${key}), false);`,
				);
			}
		} else if (diff.identity.to === null) {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP IDENTITY;`);
		} else {
			const { from, to } = diff.identity;

			if (from.type !== to.type) {
				const typeClause = to.type === 'always' ? 'ALWAYS' : 'BY DEFAULT';
				statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET GENERATED ${typeClause};`);
			}
			if (from.minValue !== to.minValue) {
				statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET MINVALUE ${to.minValue};`);
			}

			if (from.maxValue !== to.maxValue) {
				statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET MAXVALUE ${to.maxValue};`);
			}

			if (from.increment !== to.increment) {
				statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET INCREMENT BY ${to.increment};`);
			}

			if (from.startWith !== to.startWith) {
				statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET START WITH ${to.startWith};`);
			}

			if (from.cache !== to.cache) {
				statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET CACHE ${to.cache};`);
			}

			if (from.cycle !== to.cycle) {
				statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET ${to.cycle ? `CYCLE` : 'NO CYCLE'};`);
			}
		}
	}

	if (diff.notNull && !(diff.notNull.to && diff.identity && diff.identity.to)) {
		const clause = diff.notNull.to ? 'SET NOT NULL' : 'DROP NOT NULL';
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" ${clause};`);
	}

	return statements;
});

const createIndexConvertor = convertor('create_index', ({ index }) => ({ index: row('indexes', index) }), (st) => {
	const {
		schema,
		table,
		name,
		columns,
		isUnique,
		concurrently,
		with: w,
		method,
		where,
	} = st.index;
	const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';
	const value = columns
		.map((it) => {
			const expr = it.isExpression ? it.value : `"${it.value}"`;
			const opcl = it.opclass && !it.opclass.default ? ` ${it.opclass.name}` : '';

			// ASC - default
			const ord = it.asc ? '' : ' DESC';

			// skip if asc+nulls last or desc+nulls first
			const nulls = (it.asc && !it.nullsFirst) || (!it.asc && it.nullsFirst)
				? ''
				: it.nullsFirst
				? ' NULLS FIRST'
				: ' NULLS LAST';

			return `${expr}${opcl}${ord}${nulls}`;
		}).join(',');

	const key = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	const concur = concurrently ? ' CONCURRENTLY' : '';
	const withClause = w ? ` WITH (${w})` : '';
	const whereClause = where ? ` WHERE ${where}` : '';
	const using = method !== defaults.index.method ? ` USING ${method}` : '';
	return `CREATE ${indexPart}${concur} "${name}" ON ${key}${using} (${value})${withClause}${whereClause};`;
});

const dropIndexConvertor = convertor('drop_index', ({ index }) => ({
	index: { ...inTable(index), ...uniqueness(index) },
}), (st) => {
	const { schema } = st.index;

	const key = schema !== 'public'
		? `"${schema}".`
		: '';

	return `DROP INDEX ${key}"${st.index.name}";`;
});

const renameIndexConvertor = convertor('rename_index', ({ schema, table, from, to, columns }) => ({
	schema,
	table,
	from,
	to,
	columns,
}), (st) => {
	const key = st.schema !== 'public' ? `"${st.schema}"."${st.from}"` : `"${st.from}"`;

	return `ALTER INDEX ${key} RENAME TO "${st.to}";`;
});

const addPrimaryKeyConvertor = convertor('add_pk', ({ pk }) => ({ pk: row('pks', pk) }), (st) => {
	const { pk } = st;
	const key = pk.schema !== 'public'
		? `"${pk.schema}"."${pk.table}"`
		: `"${pk.table}"`;

	if (!pk.nameExplicit) {
		return `ALTER TABLE ${key} ADD PRIMARY KEY ("${pk.columns.join('","')}");`;
	}
	return `ALTER TABLE ${key} ADD CONSTRAINT "${pk.name}" PRIMARY KEY("${pk.columns.join('","')}");`;
});

const dropPrimaryKeyConvertor = convertor('drop_pk', ({ pk }) => ({ pk: constraint(pk) }), (st) => {
	const pk = st.pk;
	const key = pk.schema !== 'public'
		? `"${pk.schema}"."${pk.table}"`
		: `"${pk.table}"`;

	return `ALTER TABLE ${key} DROP CONSTRAINT "${pk.name}";`;
});

const recreatePrimaryKeyConvertor = convertor('alter_pk', ({ pk, diff, deleted }) => ({
	pk: row('pks', pk),
	shouldDrop: !deleted,
	oldColumns: diff.columns?.from ?? pk.columns,
}), (it) => {
	const st: string[] = [];
	if (it.shouldDrop) st.push(dropPrimaryKeyConvertor.convert({ pk: it.pk }) as string);
	st.push(addPrimaryKeyConvertor.convert({ pk: it.pk }) as string);
	return st;
});

const renameConstraintConvertor = convertor(
	'rename_constraint',
	({ entityType, schema, table, from, to, columns }) => ({
		entityType,
		schema,
		table,
		from,
		to,
		columns,
	}),
	(st) => {
		const key = st.schema !== 'public'
			? `"${st.schema}"."${st.table}"`
			: `"${st.table}"`;

		return `ALTER TABLE ${key} RENAME CONSTRAINT "${st.from}" TO "${st.to}";`;
	},
);

const createForeignKeyConvertor = convertor('create_fk', ({ fk }) => ({ fk: row('fks', fk) }), (st) => {
	const { schema, table, name, tableTo, columns, columnsTo, onDelete, onUpdate, schemaTo } = st.fk;

	const onDeleteStatement = onDelete && !isDefaultAction(onDelete) ? ` ON DELETE ${onDelete}` : '';
	const onUpdateStatement = onUpdate && !isDefaultAction(onUpdate) ? ` ON UPDATE ${onUpdate}` : '';
	const fromColumnsString = columns.map((it) => `"${it}"`).join(',');
	const toColumnsString = columnsTo.map((it) => `"${it}"`).join(',');

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	const tableToNameWithSchema = schemaTo !== 'public'
		? `"${schemaTo}"."${tableTo}"`
		: `"${tableTo}"`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
});

const recreateFKConvertor = convertor('recreate_fk', ({ fk }) => ({ fk: row('fks', fk) }), (st) => {
	const { fk } = st;

	const key = fk.schema !== 'public'
		? `"${fk.schema}"."${fk.table}"`
		: `"${fk.table}"`;

	const onDeleteStatement = fk.onDelete !== 'NO ACTION'
		? ` ON DELETE ${fk.onDelete}`
		: '';
	const onUpdateStatement = fk.onUpdate !== 'NO ACTION'
		? ` ON UPDATE ${fk.onUpdate}`
		: '';

	const fromColumnsString = fk.columns
		.map((it) => `"${it}"`)
		.join(',');
	const toColumnsString = fk.columnsTo.map((it) => `"${it}"`).join(',');

	const tableToNameWithSchema = fk.schemaTo !== 'public'
		? `"${fk.schemaTo}"."${fk.tableTo}"`
		: `"${fk.tableTo}"`;

	let sql = `ALTER TABLE ${key} DROP CONSTRAINT "${fk.name}", `;
	sql += `ADD CONSTRAINT "${fk.name}" FOREIGN KEY (${fromColumnsString}) `;
	sql += `REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;

	return sql;
});

const dropForeignKeyConvertor = convertor('drop_fk', ({ fk }) => ({ fk: constraint(fk) }), (st) => {
	const { schema, table, name } = st.fk;

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${name}";`;
});

const addCheckConvertor = convertor('add_check', ({ check, columns }) => ({
	check: row('checks', check),
	columns,
}), (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'public'
		? `"${check.schema}"."${check.table}"`
		: `"${check.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${check.name}" CHECK (${check.value});`;
});

const dropCheckConvertor = convertor('drop_check', ({ check, columns }) => ({
	check: inTable(check),
	columns,
}), (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'public'
		? `"${check.schema}"."${check.table}"`
		: `"${check.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${check.name}";`;
});

const recreateCheckConvertor = convertor('alter_check', ({ diff, newColumns, oldColumns }) => ({
	check: row('checks', diff.$right),
	newColumns,
	oldColumns,
}), (st) => {
	const { check } = st;

	const key = check.schema !== 'public'
		? `"${check.schema}"."${check.table}"`
		: `"${check.table}"`;

	let sql = `ALTER TABLE ${key} DROP CONSTRAINT "${check.name}", `;
	sql += `ADD CONSTRAINT "${check.name}" CHECK (${check.value});`;

	return sql;
});

const addUniqueConvertor = convertor('add_unique', ({ unique }) => ({ unique: row('uniques', unique) }), (st) => {
	const { unique } = st;
	const tableNameWithSchema = unique.schema !== 'public'
		? `"${unique.schema}"."${unique.table}"`
		: `"${unique.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${unique.name}" UNIQUE${
		unique.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''
	}("${unique.columns.join('","')}");`;
});

const dropUniqueConvertor = convertor('drop_unique', ({ unique }) => ({ unique: constraint(unique) }), (st) => {
	const { unique } = st;
	const tableNameWithSchema = unique.schema !== 'public'
		? `"${unique.schema}"."${unique.table}"`
		: `"${unique.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${unique.name}";`;
});

const alterUniqueConvertor = convertor('alter_unique', ({ diff }) => ({
	from: constraint(diff.$left),
	to: row('uniques', diff.$right),
}), (st) => {
	const statements: string[] = [];

	statements.push(dropUniqueConvertor.convert({ unique: st.from }) as string);
	statements.push(addUniqueConvertor.convert({ unique: st.to }) as string);

	return statements;
});

const createEnumConvertor = convertor('create_enum', (st) => ({ enum: row('enums', st.enum) }), (st) => {
	const { name, schema, values } = st.enum;
	const enumNameWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	let valuesStatement = '(';
	valuesStatement += values.map((it) => wrapWith(it.replaceAll("'", "''"), "'")).join(', ');
	valuesStatement += ')';

	return `CREATE TYPE ${enumNameWithSchema} AS ENUM${valuesStatement};`;
});

const dropEnumConvertor = convertor('drop_enum', (st) => ({ enum: inSchema(st.enum) }), (st) => {
	const { name, schema } = st.enum;
	const enumNameWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;
	return `DROP TYPE ${enumNameWithSchema};`;
});

const renameEnumConvertor = convertor('rename_enum', ({ schema, from, to }) => ({ schema, from, to }), (st) => {
	const from = st.schema !== 'public' ? `"${st.schema}"."${st.from}"` : `"${st.from}"`;
	return `ALTER TYPE ${from} RENAME TO "${st.to}";`;
});

const moveEnumConvertor = convertor('move_enum', ({ from, to }) => ({
	from: inSchema(from),
	to: inSchema(to),
}), (st) => {
	const { from, to } = st;

	const enumNameWithSchema = from.schema !== 'public' ? `"${from.schema}"."${from.name}"` : `"${from.name}"`;
	return `ALTER TYPE ${enumNameWithSchema} SET SCHEMA "${to.schema}";`;
});

const alterEnumConvertor = convertor('alter_enum', ({ to, diff }) => ({
	to: inSchema(to),
	added: diff.filter((it) => it.type === 'added').map(({ value, beforeValue }) => ({
		value,
		beforeValue: beforeValue ?? null,
	})),
}), (st) => {
	const { added, to: e } = st;
	const key = e.schema !== 'public' ? `"${e.schema}"."${e.name}"` : `"${e.name}"`;

	const statements = [] as string[];
	for (const d of added) {
		if (d.beforeValue) {
			statements.push(`ALTER TYPE ${key} ADD VALUE '${d.value}' BEFORE '${d.beforeValue}';`);
		} else {
			statements.push(`ALTER TYPE ${key} ADD VALUE '${d.value}';`);
		}
	}
	return statements;
});

const recreateEnumConvertor = convertor('recreate_enum', ({ to, columns }) => ({
	to: row('enums', to),
	columns: columns.map(({ schema, table, name, type, typeSchema, dimensions, default: { left, right } }) => ({
		schema,
		table,
		name,
		type,
		typeSchema,
		dimensions,
		default: { left, right },
	})),
}), (st) => {
	const { to, columns } = st;
	const statements: string[] = [];
	for (const column of columns) {
		const key = column.schema !== 'public' ? `"${column.schema}"."${column.table}"` : `"${column.table}"`;
		statements.push(
			`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE text${'[]'.repeat(column.dimensions)};`,
		);
		if (column.default.left) statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
	}
	statements.push(dropEnumConvertor.convert({ enum: to }) as string);
	statements.push(createEnumConvertor.convert({ enum: to }) as string);

	for (const column of columns) {
		const key = column.schema !== 'public' ? `"${column.schema}"."${column.table}"` : `"${column.table}"`;
		const enumType = to.schema !== 'public' ? `"${to.schema}"."${to.name}"` : `"${to.name}"`;
		statements.push(
			`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE ${enumType}${
				'[]'.repeat(column.dimensions)
			} USING "${column.name}"::${enumType}${'[]'.repeat(column.dimensions)};`,
		);
		if (column.default.right) {
			statements.push(
				`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${
					defaultToSQL({
						default: column.default.right,
						dimensions: column.dimensions,
						type: column.type,
						typeSchema: column.typeSchema,
					})
				};`,
			);
		}
	}

	return statements;
});

const createSequenceConvertor = convertor('create_sequence', ({ sequence }) => ({
	sequence: row('sequences', sequence),
}), (st) => {
	const { name, schema, minValue, maxValue, incrementBy, startWith, cacheSize, cycle } = st.sequence;
	const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

	return `CREATE SEQUENCE ${sequenceWithSchema}${incrementBy ? ` INCREMENT BY ${incrementBy}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
		cacheSize ? ` CACHE ${cacheSize}` : ''
	}${cycle ? ` CYCLE` : ''};`;
});

const dropSequenceConvertor = convertor('drop_sequence', ({ sequence }) => ({ sequence: inSchema(sequence) }), (st) => {
	const { name, schema } = st.sequence;
	const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;
	return `DROP SEQUENCE ${sequenceWithSchema};`;
});

const renameSequenceConvertor = convertor('rename_sequence', ({ from, to }) => ({
	from: inSchema(from),
	to: inSchema(to),
}), (st) => {
	const sequenceWithSchemaFrom = st.from.schema !== 'public'
		? `"${st.from.schema}"."${st.from.name}"`
		: `"${st.from.name}"`;
	return `ALTER SEQUENCE ${sequenceWithSchemaFrom} RENAME TO "${st.to.name}";`;
});

const moveSequenceConvertor = convertor('move_sequence', ({ from, to }) => ({
	from: inSchema(from),
	to: inSchema(to),
}), (st) => {
	const { from, to } = st;
	const sequenceWithSchema = from.schema !== 'public'
		? `"${from.schema}"."${from.name}"`
		: `"${from.name}"`;
	const seqSchemaTo = `"${to.schema}"`;
	return `ALTER SEQUENCE ${sequenceWithSchema} SET SCHEMA ${seqSchemaTo};`;
});

const alterSequenceConvertor = convertor('alter_sequence', ({ sequence }) => ({
	sequence: row('sequences', sequence),
}), (st) => {
	const { schema, name, incrementBy, minValue, maxValue, startWith, cacheSize, cycle } = st.sequence;

	const sequenceWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	return `ALTER SEQUENCE ${sequenceWithSchema}${incrementBy ? ` INCREMENT BY ${incrementBy}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
		cacheSize ? ` CACHE ${cacheSize}` : ''
	}${cycle ? ` CYCLE` : ''};`;
});

const createRoleConvertor = convertor('create_role', ({ role }) => ({ role: row('roles', role) }), (st) => {
	const {
		name,
		superuser,
		createDb,
		createRole,
		inherit,
		canLogin,
		replication,
		bypassRls,
		connLimit,
		password,
		validUntil,
	} = st.role;
	const withClause =
		superuser || createDb || createRole || !inherit || canLogin || replication || bypassRls || validUntil
			|| (typeof connLimit === 'number' && connLimit !== -1) || password
			? ` WITH${superuser ? ' SUPERUSER' : ''}${createDb ? ' CREATEDB' : ''}${createRole ? ' CREATEROLE' : ''}${
				inherit ? '' : ' NOINHERIT'
			}${canLogin ? ' LOGIN' : ''}${replication ? ' REPLICATION' : ''}${bypassRls ? ' BYPASSRLS' : ''}${
				typeof connLimit === 'number' && connLimit !== -1 ? ` CONNECTION LIMIT ${connLimit}` : ''
			}${password ? ` PASSWORD '${escapeSingleQuotes(password)}'` : ''}${
				validUntil ? ` VALID UNTIL '${validUntil}'` : ''
			}`
			: '';

	return `CREATE ROLE "${name}"${withClause};`;
});

const dropRoleConvertor = convertor('drop_role', ({ role }) => ({ role: { name: role.name } }), (st) => {
	return `DROP ROLE "${st.role.name}";`;
});

const renameRoleConvertor = convertor('rename_role', ({ from, to }) => ({
	from: { name: from.name },
	to: { name: to.name },
}), (st) => {
	return `ALTER ROLE "${st.from.name}" RENAME TO "${st.to.name}";`;
});

const alterRoleConvertor = convertor('alter_role', ({ diff, role }) => ({
	role: { name: role.name },
	diff: {
		superuser: diff.superuser,
		createDb: diff.createDb,
		createRole: diff.createRole,
		inherit: diff.inherit,
		canLogin: diff.canLogin,
		replication: diff.replication,
		bypassRls: diff.bypassRls,
		connLimit: diff.connLimit,
		password: diff.password,
		validUntil: diff.validUntil,
	},
}), ({ diff, role }) => {
	const {
		name,
	} = role;
	const st1 = diff.superuser
		? diff.superuser.to
			? ' SUPERUSER'
			: ' NOSUPERUSER'
		: '';
	const st2 = diff.createDb
		? diff.createDb.to
			? ' CREATEDB'
			: ' NOCREATEDB'
		: '';
	const st3 = diff.createRole
		? diff.createRole.to
			? ' CREATEROLE'
			: ' NOCREATEROLE'
		: '';
	const st4 = diff.inherit
		? diff.inherit.to
			? ' INHERIT'
			: ' NOINHERIT'
		: '';
	const st5 = diff.canLogin
		? diff.canLogin.to
			? ' LOGIN'
			: ' NOLOGIN'
		: '';
	const st6 = diff.replication
		? diff.replication.to
			? ' REPLICATION'
			: ' NOREPLICATION'
		: '';
	const st7 = diff.bypassRls
		? diff.bypassRls.to
			? ' BYPASSRLS'
			: ' NOBYPASSRLS'
		: '';
	const st8 = diff.connLimit
		? typeof diff.connLimit.to === 'number'
			? ` CONNECTION LIMIT ${diff.connLimit.to}`
			: ' CONNECTION LIMIT -1'
		: '';
	const st9 = diff.password
		? diff.password.to
			? ` PASSWORD '${escapeSingleQuotes(diff.password.to)}'`
			: ' PASSWORD NULL'
		: '';
	const st10 = diff.validUntil
		? diff.validUntil.to
			? ` VALID UNTIL '${diff.validUntil.to}'`
			: ` VALID UNTIL 'infinity'`
		: '';

	return `ALTER ROLE "${name}" WITH${st1}${st2}${st3}${st4}${st5}${st6}${st7}${st8}${st9}${st10};`;

	// return `ALTER ROLE "${name}"${` WITH${diff.superuser ? ' SUPERUSER' : ' NOSUPERUSER'}${
	// 	createDb ? ' CREATEDB' : ' NOCREATEDB'
	// }${createRole ? ' CREATEROLE' : ' NOCREATEROLE'}${inherit ? ' INHERIT' : ' NOINHERIT'}${
	// 	canLogin ? ' LOGIN' : ' NOLOGIN'
	// }${replication ? ' REPLICATION' : ' NOREPLICATION'}${bypassRls ? ' BYPASSRLS' : ' NOBYPASSRLS'}${
	// 	typeof connLimit === 'number' ? ` CONNECTION LIMIT ${connLimit}` : ' CONNECTION LIMIT -1'
	// }${password ? ` PASSWORD '${escapeSingleQuotes(password)}'` : ' PASSWORD NULL'}${
	// 	validUntil ? ` VALID UNTIL '${validUntil}'` : ` VALID UNTIL 'infinity'`
	// }`};`;
});

const grantPrivilegeConvertor = convertor('grant_privilege', ({ privilege }) => ({
	privilege: row('privileges', privilege),
}), (st) => {
	const { schema, table } = st.privilege;
	const privilege = st.privilege;

	return `GRANT ${privilege.type} ON ${
		schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`
	} TO "${privilege.grantee}"${privilege.isGrantable ? ' WITH GRANT OPTION' : ''} GRANTED BY "${privilege.grantor}";`;
});

const revokePrivilegeConvertor = convertor(
	'revoke_privilege',
	({ privilege: { schema, table, grantor, grantee, type } }) => ({
		privilege: { schema, table, grantor, grantee, type },
	}),
	(st) => {
		const { schema, table } = st.privilege;
		const privilege = st.privilege;

		return `REVOKE ${privilege.type} ON ${
			schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`
		} FROM "${privilege.grantee}";`;
	},
);

const regrantPrivilegeConvertor = convertor('regrant_privilege', ({ privilege }) => ({
	privilege: row('privileges', privilege),
}), (st) => {
	const privilege = st.privilege;
	const revokeStatement = revokePrivilegeConvertor.convert({ privilege }) as string;
	const grantStatement = grantPrivilegeConvertor.convert({ privilege }) as string;
	return [revokeStatement, grantStatement];
});

const createPolicyConvertor = convertor(
	'create_policy',
	({ policy }) => ({ policy: row('policies', policy) }),
	(st) => {
		const { schema, table } = st.policy;
		const policy = st.policy;

		const tableNameWithSchema = schema !== 'public'
			? `"${schema}"."${table}"`
			: `"${table}"`;

		const usingPart = policy.using ? ` USING (${policy.using})` : '';

		const withCheckPart = policy.withCheck ? ` WITH CHECK (${policy.withCheck})` : '';

		const policyToPart = policy.roles?.map((v) => builtinPolicyRoles.includes(v) ? v : `"${v}"`).join(', ');

		return `CREATE POLICY "${policy.name}" ON ${tableNameWithSchema} AS ${policy.as?.toUpperCase()} FOR ${policy.for?.toUpperCase()} TO ${policyToPart}${usingPart}${withCheckPart};`;
	},
);

const dropPolicyConvertor = convertor(
	'drop_policy',
	({ policy }) => ({ policy: inTable(policy) }),
	(st) => dropPolicySql(st.policy),
);

const renamePolicyConvertor = convertor('rename_policy', ({ from, to }) => ({
	from: inTable(from),
	to: inTable(to),
}), (st) => {
	const { from, to } = st;

	const tableNameWithSchema = to.schema !== 'public'
		? `"${to.schema}"."${to.table}"`
		: `"${to.table}"`;

	return `ALTER POLICY "${from.name}" ON ${tableNameWithSchema} RENAME TO "${to.name}";`;
});

const alterPolicyConvertor = convertor(
	'alter_policy',
	({ policy: { schema, table, name, roles, using, withCheck } }) => ({
		policy: { schema, table, name, roles, using, withCheck },
	}),
	(st) => {
		const { policy } = st;

		const tableNameWithSchema = policy.schema !== 'public'
			? `"${policy.schema}"."${policy.table}"`
			: `"${policy.table}"`;

		const usingPart = policy.using
			? ` USING (${policy.using})`
			: '';

		const withCheckPart = policy.withCheck
			? ` WITH CHECK (${policy.withCheck})`
			: '';

		const toClause = policy.roles?.map((v) => builtinPolicyRoles.includes(v) ? v : `"${v}"`).join(', ');

		return `ALTER POLICY "${policy.name}" ON ${tableNameWithSchema} TO ${toClause}${usingPart}${withCheckPart};`;
	},
);

const recreatePolicy = convertor('recreate_policy', ({ policy }) => ({ policy: row('policies', policy) }), (st) => {
	return [
		dropPolicyConvertor.convert({ policy: st.policy }) as string,
		createPolicyConvertor.convert({ policy: st.policy }) as string,
	];
});

const toggleRlsConvertor = convertor('alter_rls', ({ schema, name, isRlsEnabled }) => ({
	schema,
	name,
	isRlsEnabled,
}), (st) => {
	const { schema, name, isRlsEnabled } = st;

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${name}"`
		: `"${name}"`;

	return `ALTER TABLE ${tableNameWithSchema} ${isRlsEnabled ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY;`;
});

// Finds the convertor of a statement by its `type`. The mapped type requires one entry for every statement
// kind, so a new kind without a convertor is a type error.
const convertors: { [TType in StatementType]: ReturnType<typeof convertor<TType>> } = {
	create_schema: createSchemaConvertor,
	drop_schema: dropSchemaConvertor,
	rename_schema: renameSchemaConvertor,
	create_view: createViewConvertor,
	drop_view: dropViewConvertor,
	rename_view: renameViewConvertor,
	move_view: moveViewConvertor,
	alter_view: alterViewConvertor,
	create_table: createTableConvertor,
	drop_table: dropTableConvertor,
	rename_table: renameTableConvertor,
	move_table: moveTableConvertor,
	add_column: addColumnConvertor,
	drop_column: dropColumnConvertor,
	rename_column: renameColumnConvertor,
	recreate_column: recreateColumnConvertor,
	alter_column: alterColumnConvertor,
	create_index: createIndexConvertor,
	drop_index: dropIndexConvertor,
	recreate_index: recreateIndexConvertor,
	rename_index: renameIndexConvertor,
	add_pk: addPrimaryKeyConvertor,
	drop_pk: dropPrimaryKeyConvertor,
	alter_pk: recreatePrimaryKeyConvertor,
	create_fk: createForeignKeyConvertor,
	recreate_fk: recreateFKConvertor,
	drop_fk: dropForeignKeyConvertor,
	add_check: addCheckConvertor,
	drop_check: dropCheckConvertor,
	alter_check: recreateCheckConvertor,
	add_unique: addUniqueConvertor,
	drop_unique: dropUniqueConvertor,
	alter_unique: alterUniqueConvertor,
	rename_constraint: renameConstraintConvertor,
	create_enum: createEnumConvertor,
	drop_enum: dropEnumConvertor,
	rename_enum: renameEnumConvertor,
	move_enum: moveEnumConvertor,
	alter_enum: alterEnumConvertor,
	recreate_enum: recreateEnumConvertor,
	create_sequence: createSequenceConvertor,
	drop_sequence: dropSequenceConvertor,
	rename_sequence: renameSequenceConvertor,
	move_sequence: moveSequenceConvertor,
	alter_sequence: alterSequenceConvertor,
	create_role: createRoleConvertor,
	drop_role: dropRoleConvertor,
	rename_role: renameRoleConvertor,
	alter_role: alterRoleConvertor,
	grant_privilege: grantPrivilegeConvertor,
	revoke_privilege: revokePrivilegeConvertor,
	regrant_privilege: regrantPrivilegeConvertor,
	create_policy: createPolicyConvertor,
	drop_policy: dropPolicyConvertor,
	rename_policy: renamePolicyConvertor,
	alter_policy: alterPolicyConvertor,
	recreate_policy: recreatePolicy,
	alter_rls: toggleRlsConvertor,
};

export const toSnapshotStatement = <TType extends StatementType>(
	statement: Extract<JsonStatement, { type: TType }>,
): Extract<SnapshotStatement, { type: TType }> => {
	const stored = convertors[statement.type as TType].store(statement);
	return { type: statement.type, ...stored } as unknown as Extract<SnapshotStatement, { type: TType }>;
};

export const toSnapshotStatements = (statements: JsonStatement[]): SnapshotStatement[] =>
	statements.map((it) => toSnapshotStatement(it));

const sqlOf = <TType extends StatementType>(statement: Extract<SnapshotStatement, { type: TType }>): string[] => {
	const sql = convertors[statement.type as TType].convert(statement as unknown as StoredOf<TType>);
	return typeof sql === 'string' ? [sql] : sql;
};

// Builds the SQL of a migration from the statements that its snapshot stores.
export const fromSnapshotStatements = (statements: SnapshotStatement[]): string[] =>
	statements.flatMap((it) => sqlOf(it));

export function fromJson(
	statements: JsonStatement[],
) {
	const snapshotStatements = toSnapshotStatements(statements);
	const grouped = statements.map((statement, idx) => ({
		jsonStatement: statement,
		sqlStatements: sqlOf(snapshotStatements[idx]),
	}));

	return {
		sqlStatements: grouped.flatMap((it) => it.sqlStatements),
		groupedStatements: grouped,
		snapshotStatements,
	};
}

// blog.yo1.dog/updating-enum-values-in-postgresql-the-safe-and-easy-way/
// test case for enum altering
// oxlint-disable-next-line no-unused-expressions
`
create table users (
	id int,
    name character varying(128)
);

create type venum as enum('one', 'two', 'three');
alter table users add column typed venum;

insert into users(id, name, typed) values (1, 'name1', 'one');
insert into users(id, name, typed) values (2, 'name2', 'two');
insert into users(id, name, typed) values (3, 'name3', 'three');

alter type venum rename to __venum;
create type venum as enum ('one', 'two', 'three', 'four', 'five');

ALTER TABLE users ALTER COLUMN typed TYPE venum USING typed::text::venum;

insert into users(id, name, typed) values (4, 'name4', 'four');
insert into users(id, name, typed) values (5, 'name5', 'five');

drop type __venum;
`;
