import { escapeSingleQuotes, type Simplify } from '../../utils';
import { defaultNameForPK, defaults, defaultToSQL, isDefaultAction } from './grammar';
import type { JsonStatement } from './statements';

export const convertor = <
	TType extends JsonStatement['type'],
	TStatement extends Extract<JsonStatement, { type: TType }>,
>(
	type: TType,
	convertor: (statement: Simplify<Omit<TStatement, 'type'>>) => string | string[],
) => {
	return {
		type,
		can: (st: JsonStatement) => {
			return st.type === type;
		},
		convert: convertor,
	};
};

const createSchemaConvertor = convertor('create_schema', (st) => {
	return `CREATE SCHEMA "${st.name}";\n`;
});

const dropSchemaConvertor = convertor('drop_schema', (st) => {
	return `DROP SCHEMA "${st.name}";\n`;
});

const renameSchemaConvertor = convertor('rename_schema', (st) => {
	return `ALTER SCHEMA "${st.from.name}" RENAME TO "${st.to.name}";\n`;
});

const createViewConvertor = convertor('create_view', (st) => {
	const { definition, name: viewName, schema, materialized, withNoData } = st.view;

	const name = schema !== 'public' ? `"${schema}"."${viewName}"` : `"${viewName}"`;
	let statement = materialized ? `CREATE MATERIALIZED VIEW ${name}` : `CREATE VIEW ${name}`;

	statement += ` AS (${definition})`;
	if (withNoData) statement += ` WITH NO DATA`;
	statement += `;`;

	return statement;
});

const dropViewConvertor = convertor('drop_view', (st) => {
	const { name: viewName, schema, materialized } = st.view;
	const name = schema !== 'public' ? `"${schema}"."${viewName}"` : `"${viewName}"`;
	return `DROP${materialized ? ' MATERIALIZED' : ''} VIEW ${name};`;
});

const renameViewConvertor = convertor('rename_view', (st) => {
	const materialized = st.from.materialized;
	const nameFrom = st.from.schema !== 'public' ? `"${st.from.schema}"."${st.from.name}"` : `"${st.from.name}"`;

	return `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW ${nameFrom} RENAME TO "${st.to.name}";`;
});

const moveViewConvertor = convertor('move_view', (st) => {
	const { fromSchema, toSchema, view } = st;
	const from = fromSchema === 'public' ? `"${view.name}"` : `"${fromSchema}"."${view.name}"`;
	return `ALTER${view.materialized ? ' MATERIALIZED' : ''} VIEW ${from} SET SCHEMA "${toSchema}";`;
});

const recreateViewConvertor = convertor('recreate_view', (st) => {
	const drop = dropViewConvertor.convert({ view: st.from }) as string;
	const create = createViewConvertor.convert({ view: st.to }) as string;
	return [drop, create];
});

const createTableConvertor = convertor('create_table', (st) => {
	const { schema, name, columns, pk, checks, policies, isRlsEnabled, indexes } = st.table;

	const uniqueIndexes = indexes.filter((it) =>
		it.isUnique && (!it.method || it.method === defaults.index.method) && !it.where
	);

	const statements = [] as string[];
	let statement = '';
	const key = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	statement += `CREATE TABLE ${key} (\n`;
	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === column.name
			&& pk.name === defaultNameForPK(column.table);

		const primaryKeyStatement = isPK ? ' PRIMARY KEY' : '';
		const notNullStatement = pk?.columns.includes(column.name)
			? ''
			: column.notNull && !column.identity
			? ' NOT NULL'
			: '';

		const defaultStatement = column.default ? ` DEFAULT ${defaultToSQL(column)}` : '';

		const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
			? `"${column.typeSchema}".`
			: '';
		let type = column.typeSchema
			? `"${column.type}"`
			: column.type;
		type = `${schemaPrefix}${type}${'[]'.repeat(column.dimensions)}`;

		const generated = column.generated;

		const generatedStatement = generated ? ` GENERATED ALWAYS AS (${generated?.as}) STORED` : '';

		const identity = column.identity
			? ` GENERATED ${column.identity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY (${
				column.identity.increment ? `INCREMENT BY ${column.identity.increment}` : ''
			}${column.identity.minValue ? ` MINVALUE ${column.identity.minValue}` : ''}${
				column.identity.maxValue ? ` MAXVALUE ${column.identity.maxValue}` : ''
			}${column.identity.startWith ? ` START WITH ${column.identity.startWith}` : ''}${
				column.identity.cache ? ` CACHE ${column.identity.cache}` : ''
			})`
			: '';

		statement += '\t'
			+ `"${column.name}" ${type}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${identity}`;
		statement += i === columns.length - 1 ? '' : ',\n';
	}

	for (const unique of uniqueIndexes) {
		statement += ',\n';
		const uniqueString = unique.columns.map((it) => (it.isExpression ? `${it.value}` : `"${it.value}"`)).join(',');

		statement += `\tCONSTRAINT "${unique.name}" UNIQUE(${uniqueString})`;
	}

	if (pk && (pk.columns.length > 1 || pk.name !== defaultNameForPK(st.table.name))) {
		statement += ',\n';
		statement += `\tCONSTRAINT "${pk.name}" PRIMARY KEY("${pk.columns.join(`","`)}")`;
	}

	for (const check of checks) {
		statement += ',\n';
		statement += `\tCONSTRAINT "${check.name}" CHECK (${check.value})`;
	}

	statement += `\n);`;
	statement += `\n`;
	statements.push(statement);

	if ((policies && policies.length > 0) || isRlsEnabled) {
		statements.push(
			toggleRlsConvertor.convert({
				isRlsEnabled: true,
				name: st.table.name,
				schema: st.table.schema,
			}) as string,
		);
	}

	return statements;
});

const dropTableConvertor = convertor('drop_table', (st) => {
	const { name, schema, policies } = st.table;

	const tableNameWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	const droppedPolicies = policies.map((policy) => dropPolicyConvertor.convert({ policy }) as string);

	return [...droppedPolicies, `DROP TABLE ${tableNameWithSchema};`];
});

const renameTableConvertor = convertor('rename_table', (st) => {
	const schemaPrefix = st.schema !== 'public' ? `"${st.schema}".` : '';

	return `ALTER TABLE ${schemaPrefix}"${st.from}" RENAME TO "${st.to}";`;
});

const moveTableConvertor = convertor('move_table', (st) => {
	const from = st.from !== 'public' ? `"${st.from}"."${st.name}"` : `"${st.name}"`;

	return `ALTER TABLE ${from} SET SCHEMA "${st.to}";\n`;
});

const addColumnConvertor = convertor('add_column', (st) => {
	const { schema, table, name, identity, generated } = st.column;
	const column = st.column;

	const tableNameWithSchema = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	const defaultStatement = column.default ? ` DEFAULT ${defaultToSQL(column)}` : '';

	const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
		? `"${column.typeSchema}".`
		: '';
	const type = column.typeSchema
		? `"${column.type}"`
		: column.type;
	let fixedType = `${schemaPrefix}${type}${'[]'.repeat(column.dimensions)}`;

	// unlike postgres cockroach requires explicit not null columns for pk
	const notNullStatement = column.notNull && !identity && !generated ? ' NOT NULL' : '';

	const identityStatement = identity
		? ` GENERATED ${identity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY (${
			identity.increment ? `INCREMENT BY ${identity.increment}` : ''
		}${identity.minValue ? ` MINVALUE ${identity.minValue}` : ''}${
			identity.maxValue ? ` MAXVALUE ${identity.maxValue}` : ''
		}${identity.startWith ? ` START WITH ${identity.startWith}` : ''}${
			identity.cache ? ` CACHE ${identity.cache}` : ''
		})`
		: '';

	const generatedStatement = column.generated ? ` GENERATED ALWAYS AS (${column.generated.as}) STORED` : '';

	return `ALTER TABLE ${tableNameWithSchema} ADD COLUMN "${name}" ${fixedType}${defaultStatement}${generatedStatement}${notNullStatement}${identityStatement};`;
});

const dropColumnConvertor = convertor('drop_column', (st) => {
	const { schema, table, name } = st.column;

	const tableNameWithSchema = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP COLUMN "${name}";`;
});

const renameColumnConvertor = convertor('rename_column', (st) => {
	const { table, schema } = st.from;
	const tableNameWithSchema = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} RENAME COLUMN "${st.from.name}" TO "${st.to.name}";`;
});

const recreateColumnConvertor = convertor('recreate_column', (st) => {
	// AlterTableAlterColumnSetExpressionConvertor
	// AlterTableAlterColumnAlterGeneratedConvertor

	const drop = dropColumnConvertor.convert({ column: st.diff.$right }) as string;
	const add = addColumnConvertor.convert({
		column: st.diff.$right,
	}) as string;

	return [drop, add];
});

const alterColumnConvertor = convertor('alter_column', (st) => {
	const { diff, to: column, isEnum, wasEnum } = st;
	const statements = [] as string[];

	const key = column.schema !== 'public' ? `"${column.schema}"."${column.table}"` : `"${column.table}"`;

	// TODO need to recheck this
	const recreateDefault = diff.type && (isEnum || wasEnum) && (diff.$left.default);
	if (recreateDefault) {
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
	}

	if (diff.type) {
		const typeSchema = column.typeSchema && column.typeSchema !== 'public' ? `"${column.typeSchema}".` : '';
		const textProxy = wasEnum && isEnum ? 'text::' : ''; // using enum1::text::enum2
		const suffix = isEnum
			? ` USING "${column.name}"::${textProxy}${typeSchema}"${column.type}"${'[]'.repeat(column.dimensions)}`
			: '';

		const type = diff.typeSchema?.to && diff.typeSchema.to !== 'public'
			? `"${diff.typeSchema.to}"."${diff.type.to}"`
			: isEnum
			? `"${diff.type.to}"`
			: diff.type.to;

		statements.push(
			`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE ${type}${
				'[]'.repeat(column.dimensions)
			}${suffix};`,
		);

		if (recreateDefault && column.default) {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${defaultToSQL(column)};`);
		}
	}

	if (diff.default && !recreateDefault) {
		if (diff.default.to) {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${defaultToSQL(diff.$right)};`);
		} else {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
		}
	}

	if (diff.identity) {
		if (diff.identity.from === null) {
			const identity = column.identity!;
			const typeClause = identity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT';
			const incrementClause = identity.increment ? `INCREMENT BY ${identity.increment}` : '';
			const minClause = identity.minValue ? ` MINVALUE ${identity.minValue}` : '';
			const maxClause = identity.maxValue ? ` MAXVALUE ${identity.maxValue}` : '';
			const startWith = identity.startWith ? ` START WITH ${identity.startWith}` : '';
			const cache = identity.cache ? ` CACHE ${identity.cache}` : '';
			const identityStatement =
				`GENERATED ${typeClause} AS IDENTITY (${incrementClause}${minClause}${maxClause}${startWith}${cache})`;
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" ADD ${identityStatement};`);
		} else if (diff.identity.to === null) {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP IDENTITY;`);
		} else {
			const { from, to } = diff.identity;

			// TODO: when to.prop === null?
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
		}
	}

	return statements;
});

const alterColumnAddNotNullConvertor = convertor('alter_add_column_not_null', (st) => {
	const { table, schema, column } = st;
	const statements = [] as string[];

	const key = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column}" SET NOT NULL;`);
	return statements;
});
const alterColumnDropNotNullConvertor = convertor('alter_drop_column_not_null', (st) => {
	const { table, schema, column } = st;
	const statements = [] as string[];

	const key = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column}" DROP NOT NULL;`);
	return statements;
});

const createIndexConvertor = convertor('create_index', (st) => {
	const { schema, table, name, columns, isUnique, method, where } = st.index;
	const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';
	const value = columns
		.map((it) => {
			const expr = it.isExpression ? it.value : `"${it.value}"`;

			// ASC - default
			const ord = it.asc ? '' : ' DESC';

			return `${expr}${ord}`;
		})
		.join(',');

	const key = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	const whereClause = where ? ` WHERE ${where}` : '';
	const using = method !== defaults.index.method ? method : null;

	let statement = `CREATE ${indexPart} "${name}" ON ${key}`;
	if (using === 'hash') {
		statement += ` (${value}) USING ${using}`;
	} else {
		statement += (using ? ` USING ${using}` : '') + ` (${value})`;
	}
	statement += `${whereClause};`;

	return statement;
});

const dropIndexConvertor = convertor('drop_index', (st) => {
	const { index } = st;

	const cascade = index.isUnique ? ' CASCADE' : '';
	return `DROP INDEX "${st.index.name}"${cascade};`;
});

const recreateIndexConvertor = convertor('recreate_index', (st) => {
	const { diff } = st;
	const drop = dropIndexConvertor.convert({ index: diff.$right }) as string;
	const create = createIndexConvertor.convert({ index: diff.$right, newTable: false }) as string;
	return [drop, create];
});

const renameIndexConvertor = convertor('rename_index', (st) => {
	const key = st.schema !== 'public' ? `"${st.schema}"."${st.from}"` : `"${st.from}"`;

	return `ALTER INDEX ${key} RENAME TO "${st.to}";`;
});

const addPrimaryKeyConvertor = convertor('add_pk', (st) => {
	const { pk } = st;
	const key = pk.schema !== 'public' ? `"${pk.schema}"."${pk.table}"` : `"${pk.table}"`;

	if (!pk.nameExplicit) {
		return `ALTER TABLE ${key} ADD PRIMARY KEY ("${pk.columns.join('","')}");`;
	}
	return `ALTER TABLE ${key} ADD CONSTRAINT "${pk.name}" PRIMARY KEY("${pk.columns.join('","')}");`;
});

const dropPrimaryKeyConvertor = convertor('drop_pk', (st) => {
	const pk = st.pk;
	const key = pk.schema !== 'public' ? `"${pk.schema}"."${pk.table}"` : `"${pk.table}"`;

	return `ALTER TABLE ${key} DROP CONSTRAINT "${pk.name}";`;
});

const alterPrimaryKeyConvertor = convertor('alter_pk', (it) => {
	const key = it.pk.schema !== 'public' ? `"${it.pk.schema}"."${it.pk.table}"` : `"${it.pk.table}"`;

	return `ALTER TABLE ${key} DROP CONSTRAINT "${it.pk.name}", ADD CONSTRAINT "${it.pk.name}" PRIMARY KEY("${
		it.pk.columns.join('","')
	}");`;
});

const recreatePrimaryKeyConvertor = convertor('recreate_pk', (it) => {
	const { left, right } = it;

	const key = it.right.schema !== 'public' ? `"${right.schema}"."${right.table}"` : `"${right.table}"`;

	return `ALTER TABLE ${key} DROP CONSTRAINT "${left.name}", ADD CONSTRAINT "${right.name}" PRIMARY KEY("${
		right.columns.join('","')
	}");`;
});

const renameConstraintConvertor = convertor('rename_constraint', (st) => {
	const key = st.schema !== 'public' ? `"${st.schema}"."${st.table}"` : `"${st.table}"`;

	return `ALTER TABLE ${key} RENAME CONSTRAINT "${st.from}" TO "${st.to}";`;
});

const createForeignKeyConvertor = convertor('create_fk', (st) => {
	const { schema, table, name, tableTo, columns, columnsTo, onDelete, onUpdate, schemaTo } = st.fk;

	const onDeleteStatement = onDelete && !isDefaultAction(onDelete) ? ` ON DELETE ${onDelete}` : '';
	const onUpdateStatement = onUpdate && !isDefaultAction(onUpdate) ? ` ON UPDATE ${onUpdate}` : '';
	const fromColumnsString = columns.map((it) => `"${it}"`).join(',');
	const toColumnsString = columnsTo.map((it) => `"${it}"`).join(',');

	const tableNameWithSchema = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	const tableToNameWithSchema = schemaTo !== 'public' ? `"${schemaTo}"."${tableTo}"` : `"${tableTo}"`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
});

const recreateFKConvertor = convertor('recreate_fk', (st) => {
	const { fk } = st;

	const key = fk.schema !== 'public' ? `"${fk.schema}"."${fk.table}"` : `"${fk.table}"`;

	const onDeleteStatement = fk.onDelete !== 'NO ACTION' ? ` ON DELETE ${fk.onDelete}` : '';
	const onUpdateStatement = fk.onUpdate !== 'NO ACTION' ? ` ON UPDATE ${fk.onUpdate}` : '';

	const fromColumnsString = fk.columns.map((it) => `"${it}"`).join(',');
	const toColumnsString = fk.columnsTo.map((it) => `"${it}"`).join(',');

	const tableToNameWithSchema = fk.schemaTo !== 'public' ? `"${fk.schemaTo}"."${fk.tableTo}"` : `"${fk.tableTo}"`;

	let sql = `ALTER TABLE ${key} DROP CONSTRAINT "${fk.name}", `;
	sql += `ADD CONSTRAINT "${fk.name}" FOREIGN KEY (${fromColumnsString}) `;
	sql += `REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;

	return sql;
});

const dropForeignKeyConvertor = convertor('drop_fk', (st) => {
	const { schema, table, name } = st.fk;

	const tableNameWithSchema = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${name}";`;
});

const addCheckConvertor = convertor('add_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'public' ? `"${check.schema}"."${check.table}"` : `"${check.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${check.name}" CHECK (${check.value});`;
});

const dropCheckConvertor = convertor('drop_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'public' ? `"${check.schema}"."${check.table}"` : `"${check.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${check.name}";`;
});

const recreateCheckConvertor = convertor('alter_check', (st) => {
	const { check } = st;

	const key = check.schema !== 'public' ? `"${check.schema}"."${check.table}"` : `"${check.table}"`;

	let sql = [`ALTER TABLE ${key} DROP CONSTRAINT "${check.name}";`];
	sql.push(`ALTER TABLE ${key} ADD CONSTRAINT "${check.name}" CHECK (${check.value});`);

	return sql;
});

const createEnumConvertor = convertor('create_enum', (st) => {
	const { name, schema, values } = st.enum;
	const enumNameWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	let valuesStatement = '(';
	valuesStatement += values.map((it) => `'${escapeSingleQuotes(it)}'`).join(', ');
	valuesStatement += ')';

	return `CREATE TYPE ${enumNameWithSchema} AS ENUM${valuesStatement};`;
});

const dropEnumConvertor = convertor('drop_enum', (st) => {
	const { name, schema } = st.enum;
	const enumNameWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;
	return `DROP TYPE ${enumNameWithSchema};`;
});

const renameEnumConvertor = convertor('rename_enum', (st) => {
	const from = st.schema !== 'public' ? `"${st.schema}"."${st.from}"` : `"${st.from}"`;
	return `ALTER TYPE ${from} RENAME TO "${st.to}";`;
});

const moveEnumConvertor = convertor('move_enum', (st) => {
	const { from, to } = st;

	const enumNameWithSchema = from.schema !== 'public' ? `"${from.schema}"."${from.name}"` : `"${from.name}"`;
	return `ALTER TYPE ${enumNameWithSchema} SET SCHEMA "${to.schema || 'public'}";`;
});

const alterEnumConvertor = convertor('alter_enum', (st) => {
	const { diff, to } = st;
	const key = to.schema !== 'public' ? `"${to.schema}"."${to.name}"` : `"${to.name}"`;

	const statements = [] as string[];
	for (const d of diff.filter((it) => it.type === 'added')) {
		if (d.beforeValue) {
			statements.push(`ALTER TYPE ${key} ADD VALUE '${d.value}' BEFORE '${d.beforeValue}';`);
		} else {
			statements.push(`ALTER TYPE ${key} ADD VALUE '${d.value}';`);
		}
	}
	return statements;
});

const recreateEnumConvertor = convertor('recreate_enum', (st) => {
	const { to, columns } = st;

	const statements: string[] = [];
	for (const column of columns) {
		const key = column.schema !== 'public' ? `"${column.schema}"."${column.table}"` : `"${column.table}"`;
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE text;`);
		if (column.default.left) statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
	}
	statements.push(dropEnumConvertor.convert({ enum: to }) as string);
	statements.push(createEnumConvertor.convert({ enum: to }) as string);

	for (const column of columns) {
		const key = column.schema !== 'public' ? `"${column.schema}"."${column.table}"` : `"${column.table}"`;
		const arr = column.dimensions > 0 ? '[]' : '';
		const enumType = to.schema !== 'public' ? `"${to.schema}"."${to.name}"${arr}` : `"${to.name}"${arr}`;
		statements.push(
			`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE ${enumType} USING "${column.name}"::${enumType};`,
		);
		if (column.default.right) {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${
				defaultToSQL({
					default: column.default.right,
					dimensions: column.dimensions,
					type: column.type,
					typeSchema: column.typeSchema,
				})
			};`);
		}
	}

	return statements;
});

const createSequenceConvertor = convertor('create_sequence', (st) => {
	const { name, schema, minValue, maxValue, incrementBy, startWith, cacheSize } = st.sequence;
	const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

	return `CREATE SEQUENCE ${sequenceWithSchema}${incrementBy ? ` INCREMENT BY ${incrementBy}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
		cacheSize ? ` CACHE ${cacheSize}` : ''
	};`;
});

const dropSequenceConvertor = convertor('drop_sequence', (st) => {
	const { name, schema } = st.sequence;
	const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;
	return `DROP SEQUENCE ${sequenceWithSchema};`;
});

const renameSequenceConvertor = convertor('rename_sequence', (st) => {
	const sequenceWithSchemaFrom = st.from.schema !== 'public'
		? `"${st.from.schema}"."${st.from.name}"`
		: `"${st.from.name}"`;
	return `ALTER SEQUENCE ${sequenceWithSchemaFrom} RENAME TO "${st.to.name}";`;
});

const moveSequenceConvertor = convertor('move_sequence', (st) => {
	const { from, to } = st;
	const sequenceWithSchema = from.schema !== 'public' ? `"${from.schema}"."${from.name}"` : `"${from.name}"`;
	const seqSchemaTo = `"${to.schema}"`;
	return `ALTER SEQUENCE ${sequenceWithSchema} SET SCHEMA ${seqSchemaTo};`;
});

const alterSequenceConvertor = convertor('alter_sequence', (st) => {
	const { schema, name, incrementBy, minValue, maxValue, startWith, cacheSize } = st.sequence;

	const sequenceWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	return `ALTER SEQUENCE ${sequenceWithSchema}${incrementBy ? ` INCREMENT BY ${incrementBy}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
		cacheSize ? ` CACHE ${cacheSize}` : ''
	};`;
});

const createRoleConvertor = convertor('create_role', (st) => {
	const { name, createDb, createRole } = st.role;
	const withClause = createDb || createRole
		? ` WITH${createDb ? ' CREATEDB' : ''}${createRole ? ' CREATEROLE' : ''}`
		: '';

	return `CREATE ROLE "${name}"${withClause};`;
});

const dropRoleConvertor = convertor('drop_role', (st) => {
	return `DROP ROLE "${st.role.name}";`;
});

const alterRoleConvertor = convertor('alter_role', (st) => {
	const { name, createDb, createRole } = st.role;
	return `ALTER ROLE "${name}"${` WITH${createDb ? ' CREATEDB' : ' NOCREATEDB'}${
		createRole ? ' CREATEROLE' : ' NOCREATEROLE'
	}`};`;
});

const createPolicyConvertor = convertor('create_policy', (st) => {
	const { schema, table } = st.policy;
	const policy = st.policy;

	const tableNameWithSchema = schema !== 'public' ? `"${schema}"."${table}"` : `"${table}"`;

	const usingPart = policy.using ? ` USING (${policy.using})` : '';

	const withCheckPart = policy.withCheck ? ` WITH CHECK (${policy.withCheck})` : '';

	const policyToPart = policy.roles?.map((v) => (['current_user', 'session_user', 'public'].includes(v) ? v : `"${v}"`))
		.join(', ');

	return `CREATE POLICY "${policy.name}" ON ${tableNameWithSchema} AS ${policy.as?.toUpperCase()} FOR ${policy.for?.toUpperCase()} TO ${policyToPart}${usingPart}${withCheckPart};`;
});

const dropPolicyConvertor = convertor('drop_policy', (st) => {
	const policy = st.policy;

	const tableNameWithSchema = policy.schema !== 'public' ? `"${policy.schema}"."${policy.table}"` : `"${policy.table}"`;

	return `DROP POLICY "${policy.name}" ON ${tableNameWithSchema};`;
});

const renamePolicyConvertor = convertor('rename_policy', (st) => {
	const { from, to } = st;

	const tableNameWithSchema = to.schema !== 'public' ? `"${to.schema}"."${to.table}"` : `"${to.table}"`;

	return `ALTER POLICY "${from.name}" ON ${tableNameWithSchema} RENAME TO "${to.name}";`;
});

const alterPolicyConvertor = convertor('alter_policy', (st) => {
	const { policy } = st;

	const tableNameWithSchema = policy.schema !== 'public' ? `"${policy.schema}"."${policy.table}"` : `"${policy.table}"`;

	const usingPart = policy.using ? ` USING (${policy.using})` : '';

	const withCheckPart = policy.withCheck ? ` WITH CHECK (${policy.withCheck})` : '';

	const toClause = policy.roles?.map((
		v,
	) => (['current_user', 'current_role', 'session_user', 'public'].includes(v) ? v : `"${v}"`)).join(', ');

	return `ALTER POLICY "${policy.name}" ON ${tableNameWithSchema} TO ${toClause}${usingPart}${withCheckPart};`;
});

const recreatePolicy = convertor('recreate_policy', (st) => {
	return [
		dropPolicyConvertor.convert({ policy: st.policy }) as string,
		createPolicyConvertor.convert({ policy: st.policy }) as string,
	];
});

const toggleRlsConvertor = convertor('alter_rls', (st) => {
	const { schema, name, isRlsEnabled } = st;

	const tableNameWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	return `ALTER TABLE ${tableNameWithSchema} ${isRlsEnabled ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY;`;
});

const convertors = [
	createSchemaConvertor,
	dropSchemaConvertor,
	renameSchemaConvertor,
	createViewConvertor,
	dropViewConvertor,
	renameViewConvertor,
	moveViewConvertor,
	recreateViewConvertor,
	createTableConvertor,
	dropTableConvertor,
	renameTableConvertor,
	moveTableConvertor,
	addColumnConvertor,
	dropColumnConvertor,
	renameColumnConvertor,
	recreateColumnConvertor,
	alterColumnConvertor,
	createIndexConvertor,
	dropIndexConvertor,
	recreateIndexConvertor,
	renameIndexConvertor,
	addPrimaryKeyConvertor,
	dropPrimaryKeyConvertor,
	recreatePrimaryKeyConvertor,
	createForeignKeyConvertor,
	recreateFKConvertor,
	dropForeignKeyConvertor,
	addCheckConvertor,
	dropCheckConvertor,
	recreateCheckConvertor,
	renameConstraintConvertor,
	createEnumConvertor,
	dropEnumConvertor,
	renameEnumConvertor,
	moveEnumConvertor,
	alterEnumConvertor,
	recreateEnumConvertor,
	createSequenceConvertor,
	dropSequenceConvertor,
	renameSequenceConvertor,
	moveSequenceConvertor,
	alterSequenceConvertor,
	createRoleConvertor,
	dropRoleConvertor,
	alterRoleConvertor,
	createPolicyConvertor,
	dropPolicyConvertor,
	renamePolicyConvertor,
	alterPolicyConvertor,
	recreatePolicy,
	toggleRlsConvertor,
	alterPrimaryKeyConvertor,
	alterColumnAddNotNullConvertor,
	alterColumnDropNotNullConvertor,
];

export function fromJson(statements: JsonStatement[]) {
	const grouped = statements
		.map((statement) => {
			const filtered = convertors.filter((it) => {
				return it.can(statement);
			});

			const convertor = filtered.length === 1 ? filtered[0] : undefined;
			if (!convertor) throw new Error(`No convertor for: ${statement.type} statement`);

			const sqlStatements = convertor.convert(statement as any);
			const statements = typeof sqlStatements === 'string' ? [sqlStatements] : sqlStatements;
			return { jsonStatement: statement, sqlStatements: statements };
		})
		.filter((it) => it !== null);

	const result = {
		sqlStatements: grouped.map((it) => it.sqlStatements).flat(),
		groupedStatements: grouped,
	};
	return result;
}
