import { it } from 'node:test';
import { escapeSingleQuotes, type Simplify } from '../../utils';
import { defaults, parseType } from './grammar';
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
	return `ALTER SCHEMA "${st.from}" RENAME TO "${st.to}";\n`;
});

const createViewConvertor = convertor('create_view', (st) => {
	const { definition, name: viewName, schema, with: withOption, materialized, withNoData, tablespace, using } = st.view;

	const name = schema ? `"${schema}"."${viewName}"` : `"${viewName}"`;
	let statement = materialized ? `CREATE MATERIALIZED VIEW ${name}` : `CREATE VIEW ${name}`;
	if (using) statement += ` USING "${using}"`;

	const options: string[] = [];
	if (withOption) {
		statement += ` WITH (`;
		for (const [key, value] of Object.entries(withOption)) {
			if (typeof value === 'undefined') continue;
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

const dropViewConvertor = convertor('drop_view', (st) => {
	const { name: viewName, schema, materialized } = st.view;
	const name = schema ? `"${schema}"."${viewName}"` : `"${viewName}"`;
	return `DROP${materialized ? ' MATERIALIZED' : ''} VIEW ${name};`;
});

const renameViewConvertor = convertor('rename_view', (st) => {
	const materialized = st.from.materialized;
	const nameFrom = st.from.schema ? `"${st.from.schema}"."${st.from.name}"` : `"${st.from.name}"`;
	const nameTo = st.to.schema ? `"${st.to.schema}"."${st.to.name}"` : `"${st.to.name}"`;

	return `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW ${nameFrom} RENAME TO "${nameTo}";`;
});

const moveViewConvertor = convertor('move_view', (st) => {
	const { fromSchema, toSchema, view } = st;
	return `ALTER${
		view.materialized ? ' MATERIALIZED' : ''
	} VIEW "${fromSchema}"."${view.name}" SET SCHEMA "${toSchema}";`;
});

const alterViewConvertor = convertor('alter_view', (st) => {
	const diff = st.diff;
	if (diff) {}

	const statements = [] as string[];
	const key = st.to.schema ? `"${st.to.schema}"."${st.to.name}"` : `"${st.to.name}"`;
	const viewClause = st.to.materialized ? `MATERIALIZED VIEW ${key}` : `VIEW ${key}`;
	if (diff.with) {
		if (diff.with.from === null) {
			const options = Object.entries(diff.with.to!).filter((it) => it[1]).map(([key, value]) =>
				`${key.snake_case()} = ${value}`
			).join(', ');
			statements.push(`ALTER ${viewClause} SET (${options});`);
		} else {
			// TODO: reset missing options, set changed options and new options?
			const options = diff.with.to
				? Object.keys(diff.with.to!).map((key) => key.snake_case()).join(', ')
				: '';
			statements.push(`ALTER ${viewClause} RESET (${options});`);
		}
	}

	if (diff.tablespace) {
		const to = diff.tablespace.to || defaults.tablespace;
		statements.push(`ALTER ${viewClause} SET TABLESPACE "${to}";`);
	}

	if (diff.using) {
		const toUsing = diff.using.to || defaults.accessMethod;
		statements.push(`ALTER ${viewClause} SET ACCESS METHOD "${toUsing}";`);
	}

	return statements;
});

const recreateViewConvertor = convertor('recreate_view', (st) => {
	const drop = dropViewConvertor.convert({ view: st.from }) as string;
	const create = createViewConvertor.convert({ view: st.to }) as string;
	return [drop, create];
});

const createTableConvertor = convertor('create_table', (st) => {
	const { schema, name, columns, pk, uniques, checks, policies, isRlsEnabled } = st.table;

	const statements = [] as string[];
	let statement = '';
	const key = schema ? `"${schema}"."${name}"` : `"${name}"`;

	// TODO: strict?
	statement += `CREATE TABLE IF NOT EXISTS ${key} (\n`;
	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const primaryKeyStatement = column.primaryKey ? ' PRIMARY KEY' : '';
		const notNullStatement = column.notNull && !column.identity ? ' NOT NULL' : '';
		const defaultStatement = column.default !== undefined ? ` DEFAULT ${column.default}` : '';

		const uniqueConstraint = uniques.find((it) =>
			it.columns.length === 1 && it.columns[0] === column.name && `${name}_${column.name}_key` === it.name
		);
		const unqiueConstraintPrefix = uniqueConstraint
			? 'UNIQUE'
			: '';
		const uniqueConstraintStatement = uniqueConstraint
			? ` ${unqiueConstraintPrefix}${uniqueConstraint.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''}`
			: '';

		const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
			? `"${column.typeSchema}".`
			: '';

		const type = parseType(schemaPrefix, column.type);
		const generated = column.generated;

		const generatedStatement = generated ? ` GENERATED ALWAYS AS (${generated?.as}) STORED` : '';

		const identityWithSchema = schema
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

	if (pk && pk.columns.length > 0) {
		statement += ',\n';
		statement += `\tCONSTRAINT "${pk.name}" PRIMARY KEY(\"${pk.columns.join(`","`)}\")`;
	}

	for (const it of uniques) {
		// skip for inlined uniques
		if (it.columns.length === 1 && it.name === `${name}_${it.columns[0]}_key`) continue;

		statement += ',\n';
		statement += `\tCONSTRAINT "${it.name}" UNIQUE${it.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''}(\"${
			it.columns.join(`","`)
		}\")`;
	}

	for (const check of checks) {
		statement += ',\n';
		statement += `\tCONSTRAINT "${check.name}" CHECK (${check.value})`;
	}

	statement += `\n);`;
	statement += `\n`;
	statements.push(statement);

	if (policies && policies.length > 0 || isRlsEnabled) {
		statements.push(toggleRlsConvertor.convert({
			isRlsEnabled: true,
			table: {
				entityType: 'tables',
				name: st.table.name,
				schema: st.table.schema,
				isRlsEnabled: st.table.isRlsEnabled,
			},
		}) as string);
	}

	return statements;
});

const dropTableConvertor = convertor('drop_table', (st) => {
	const { name, schema, policies } = st.table;

	const tableNameWithSchema = schema
		? `"${schema}"."${name}"`
		: `"${name}"`;

	const droppedPolicies = policies.map((policy) => dropPolicyConvertor.convert({ policy }) as string);

	return [
		...droppedPolicies,
		`DROP TABLE ${tableNameWithSchema} CASCADE;`,
	];
});

const renameTableConvertor = convertor('rename_table', (st) => {
	const from = st.from.schema
		? `"${st.from.schema}"."${st.from.name}"`
		: `"${st.from.name}"`;
	const to = st.to.schema
		? `"${st.to.schema}"."${st.to.name}"`
		: `"${st.to.name}"`;

	return `ALTER TABLE ${from} RENAME TO ${to};`;
});

const moveTableConvertor = convertor('move_table', (st) => {
	const from = st.schemaFrom ? `"${st.schemaFrom}".${st.name}` : 'public';
	const to = st.schemaTo ? `"${st.schemaTo}"` : 'public';

	return `ALTER TABLE ${from} SET SCHEMA ${to};\n`;
});

const addColumnConvertor = convertor('add_column', (st) => {
	const { schema, table, name } = st.column;
	const column = st.column;

	const primaryKeyStatement = column.primaryKey ? ' PRIMARY KEY' : '';

	const tableNameWithSchema = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	const defaultStatement = `${column.default !== undefined ? ` DEFAULT ${column.default}` : ''}`;

	const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
		? `"${column.typeSchema}".`
		: '';

	const fixedType = parseType(schemaPrefix, column.type);

	const notNullStatement = `${column.notNull ? ' NOT NULL' : ''}`;

	const unsquashedIdentity = column.identity;

	const identityWithSchema = schema
		? `"${schema}"."${unsquashedIdentity?.name}"`
		: `"${unsquashedIdentity?.name}"`;

	const identityStatement = unsquashedIdentity
		? ` GENERATED ${
			unsquashedIdentity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'
		} AS IDENTITY (sequence name ${identityWithSchema}${
			unsquashedIdentity.increment
				? ` INCREMENT BY ${unsquashedIdentity.increment}`
				: ''
		}${
			unsquashedIdentity.minValue
				? ` MINVALUE ${unsquashedIdentity.minValue}`
				: ''
		}${
			unsquashedIdentity.maxValue
				? ` MAXVALUE ${unsquashedIdentity.maxValue}`
				: ''
		}${
			unsquashedIdentity.startWith
				? ` START WITH ${unsquashedIdentity.startWith}`
				: ''
		}${unsquashedIdentity.cache ? ` CACHE ${unsquashedIdentity.cache}` : ''}${
			unsquashedIdentity.cycle ? ` CYCLE` : ''
		})`
		: '';

	const generatedStatement = column.generated ? ` GENERATED ALWAYS AS (${column.generated.as}) STORED` : '';

	return `ALTER TABLE ${tableNameWithSchema} ADD COLUMN "${name}" ${fixedType}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${identityStatement};`;
});

const dropColumnConvertor = convertor('drop_column', (st) => {
	const { schema, table, name } = st.column;

	const tableNameWithSchema = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP COLUMN "${name}";`;
});

const renameColumnConvertor = convertor('rename_column', (st) => {
	const { table, schema } = st.from;
	const tableNameWithSchema = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} RENAME COLUMN "${st.from.name}" TO "${st.to.name}";`;
});

const recreateColumnConvertor = convertor('recreate_column', (st) => {
	// AlterTableAlterColumnSetExpressionConvertor
	// AlterTableAlterColumnAlterGeneratedConvertor

	const drop = dropColumnConvertor.convert({ column: st.column }) as string;
	const add = addColumnConvertor.convert({ column: st.column }) as string;

	return [drop, add];
});

const alterColumnConvertor = convertor('alter_column', (st) => {
	const { diff, column } = st;

	const statements = [] as string[];

	const key = column.schema
		? `"${column.schema}"."${column.table}"`
		: `"${column.table}"`;

	if (diff.type) {
		const type = diff.typeSchema?.to ? `"${diff.typeSchema.to}"."${diff.type.to}"` : diff.type.to; // TODO: enum?
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE ${type};`);
	}

	if (diff.default) {
		if (diff.default.to) {
			const { expression, value } = diff.default.to;
			const def = expression ? `(${value})` : value;
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${def};`);
		} else {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
		}
	}

	if (diff.generated && diff.generated.to === null) {
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP EXPRESSION;`);
	}

	if (diff.notNull) {
		const clause = diff.notNull.to ? 'SET NOT NULL' : 'DROP NOT NULL';
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" ${clause};`);
	}

	if (diff.identity) {
		if (diff.identity.from === null) {
			const identity = column.identity!;
			const identityWithSchema = column.schema
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

			if (from.cycle !== to.cycle) {
				statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET ${to.cycle ? `CYCLE` : 'NO CYCLE'};`);
			}
		}
	}

	return statements;
});

const createIndexConvertor = convertor('create_index', (st) => {
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
	// // since postgresql 9.5
	const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';
	const value = columns
		.map(
			(it) =>
				`${it.isExpression ? it.isExpression : `"${it.isExpression}"`}${
					it.opclass ? ` ${it.opclass}` : it.asc ? '' : ' DESC'
				}${
					(it.asc && it.nulls && it.nulls === 'last') || it.opclass
						? ''
						: ` NULLS ${it.nulls!.toUpperCase()}`
				}`,
		)
		.join(',');

	const key = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	const concur = concurrently ? ' CONCURRENTLY' : '';
	const withClause = w ? ` WITH (${w})` : '';
	const whereClause = where ? ` WHERE ${where}` : '';
	return `CREATE ${indexPart}${concur} IF NOT EXISTS "${name}" ON ${key} USING ${method} (${value})${withClause}${whereClause};`;
});

const dropIndexConvertor = convertor('drop_index', (st) => {
	return `DROP INDEX "${st.index}";`;
});

const addPrimaryKeyConvertor = convertor('add_pk', (st) => {
	const { pk } = st;
	const key = pk.schema
		? `"${pk.schema}"."${pk.table}"`
		: `"${pk.table}"`;

	if (!pk.isNameExplicit) {
		return `ALTER TABLE ${key} ADD PRIMARY KEY ("${pk.columns.join('","')}");`;
	}
	return `ALTER TABLE ${key} ADD CONSTRAINT "${pk.name}" PRIMARY KEY("${pk.columns.join('","')}");`;
});

const dropPrimaryKeyConvertor = convertor('drop_pk', (st) => {
	const pk = st.pk;
	const key = pk.schema
		? `"${pk.schema}"."${pk.table}"`
		: `"${pk.table}"`;

	if (st.pk.isNameExplicit) {
		return `ALTER TABLE ${key} DROP CONSTRAINT "${pk.name}";`;
	}

	const schema = pk.schema ?? 'public';
	return `/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = '${schema}'
                AND table_name = '${pk.table}'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "${key}" DROP CONSTRAINT "<constraint_name>";`;
});

const renameConstraintConvertor = convertor('rename_pk', (st) => {
	const key = st.to.schema
		? `"${st.to.schema}"."${st.to.table}"`
		: `"${st.to.table}"`;

	return `ALTER TABLE ${key} RENAME CONSTRAINT "${st.from.name}" TO "${st.to.name}";`;
});

const createForeignKeyConvertor = convertor('create_fk', (st) => {
	const { schema, table, name, tableFrom, tableTo, columnsFrom, columnsTo, onDelete, onUpdate, schemaTo } = st.fk;

	const onDeleteStatement = onDelete ? ` ON DELETE ${onDelete}` : '';
	const onUpdateStatement = onUpdate ? ` ON UPDATE ${onUpdate}` : '';
	const fromColumnsString = columnsFrom.map((it) => `"${it}"`).join(',');
	const toColumnsString = columnsTo.map((it) => `"${it}"`).join(',');

	const tableNameWithSchema = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	const tableToNameWithSchema = schemaTo
		? `"${schemaTo}"."${tableTo}"`
		: `"${tableTo}"`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement}`;
});

const alterForeignKeyConvertor = convertor('alter_fk', (st) => {
	const { from, to } = st;

	const key = to.schema
		? `"${to.schema}"."${to.table}"`
		: `"${to.table}"`;

	let sql = `ALTER TABLE ${key} DROP CONSTRAINT "${from.name}";\n`;

	const onDeleteStatement = to.onDelete
		? ` ON DELETE ${to.onDelete}`
		: '';
	const onUpdateStatement = to.onUpdate
		? ` ON UPDATE ${to.onUpdate}`
		: '';

	const fromColumnsString = to.columnsFrom
		.map((it) => `"${it}"`)
		.join(',');
	const toColumnsString = to.columnsTo.map((it) => `"${it}"`).join(',');

	const tableToNameWithSchema = to.schemaTo
		? `"${to.schemaTo}"."${to.tableTo}"`
		: `"${to.tableTo}"`;

	const alterStatement =
		`ALTER TABLE ${key} ADD CONSTRAINT "${to.name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement}`;

	// TODO: remove DO BEGIN?
	sql += 'DO $$ BEGIN\n';
	sql += ' ' + alterStatement + ';\n';
	sql += 'EXCEPTION\n';
	sql += ' WHEN duplicate_object THEN null;\n';
	sql += 'END $$;\n';
	return sql;
});

const dropForeignKeyConvertor = convertor('drop_fk', (st) => {
	const { schema, table, name } = st.fk;

	const tableNameWithSchema = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${name}";\n`;
});

const addCheckConvertor = convertor('add_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema
		? `"${check.schema}"."${check.table}"`
		: `"${check.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${check.name}" CHECK (${check.value});`;
});

const dropCheckConvertor = convertor('drop_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema
		? `"${check.schema}"."${check.table}"`
		: `"${check.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${check.name}";`;
});

const addUniqueConvertor = convertor('add_unique', (st) => {
	const { unique } = st;
	const tableNameWithSchema = unique.schema
		? `"${unique.schema}"."${unique.table}"`
		: `"${unique.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${unique.name}" UNIQUE${
		unique.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''
	}("${unique.columns.join('","')}");`;
});

const dropUniqueConvertor = convertor('drop_unique', (st) => {
	const { unique } = st;
	const tableNameWithSchema = unique.schema
		? `"${unique.schema}"."${unique.table}"`
		: `"${unique.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${unique.name}";`;
});

const createEnumConvertor = convertor('create_enum', (st) => {
	const { name, schema, values } = st.enum;
	const enumNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

	let valuesStatement = '(';
	valuesStatement += values.map((it) => `'${escapeSingleQuotes(it)}'`).join(', ');
	valuesStatement += ')';

	return `CREATE TYPE ${enumNameWithSchema} AS ENUM${valuesStatement};`;
});

const dropEnumConvertor = convertor('drop_enum', (st) => {
	const { name, schema } = st.enum;
	const enumNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;
	return `DROP TYPE ${enumNameWithSchema};`;
});

const renameEnumConvertor = convertor('rename_enum', (st) => {
	const from = st.from.schema ? `"${st.from.schema}"."${st.from.name}"` : `"${st.from.name}"`;
	const to = st.to.schema ? `"${st.to.schema}"."${st.to.name}"` : `"${st.to.name}"`;
	return `ALTER TYPE ${from} RENAME TO "${to}";`;
});

const moveEnumConvertor = convertor('move_enum', (st) => {
	const { schemaFrom, schemaTo, name } = st;
	const enumNameWithSchema = schemaFrom ? `"${schemaFrom}"."${name}"` : `"${name}"`;
	return `ALTER TYPE ${enumNameWithSchema} SET SCHEMA "${schemaTo}";`;
});

const alterEnumConvertor = convertor('alter_enum', (st) => {
	const { diff, enum: e } = st;
	const key = e.schema ? `"${e.schema}"."${e.name}"` : `"${e.name}"`;

	const statements = [] as string[];
	for (const d of diff.filter((it) => it.type === 'added')) {
		if (d.beforeValue) {
			statements.push(`ALTER TYPE ${key} ADD VALUE '${d.value}' BEFORE '${d.beforeValue}'`);
		} else {
			statements.push(`ALTER TYPE ${key} ADD VALUE IF NOT EXISTS ${d.value};`);
		}
	}
	return statements;
});

const recreateEnumConvertor = convertor('recreate_enum', (st) => {
	const { to, columns } = st;
	const statements: string[] = [];
	for (const column of columns) {
		const key = column.schema ? `"${column.schema}"."${column.table}"` : `"${column.table}"`;
		statements.push(
			`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE text;`,
		);
	}
	statements.push(dropEnumConvertor.convert({ enum: to }) as string);
	statements.push(createEnumConvertor.convert({ enum: to }) as string);

	for (const column of columns) {
		const key = column.schema ? `"${column.schema}"."${column.table}"` : `"${column.table}"`;
		const enumType = to.schema ? `"${to.schema}"."${to.name}"` : `"${to.name}"`;
		statements.push(
			`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE ${enumType} USING "${column.name}"::${enumType};`,
		);
	}

	return statements;
});

const createSequenceConvertor = convertor('create_sequence', (st) => {
	const { name, schema, minValue, maxValue, increment, startWith, cache, cycle } = st.sequence;
	const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

	return `CREATE SEQUENCE ${sequenceWithSchema}${increment ? ` INCREMENT BY ${increment}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
		cache ? ` CACHE ${cache}` : ''
	}${cycle ? ` CYCLE` : ''};`;
});

const dropSequenceConvertor = convertor('drop_sequence', (st) => {
	const { name, schema } = st.sequence;
	const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;
	return `DROP SEQUENCE ${sequenceWithSchema};`;
});

const renameSequenceConvertor = convertor('rename_sequence', (st) => {
	const sequenceWithSchemaFrom = st.from.schema
		? `"${st.from.schema}"."${st.from.name}"`
		: `"${st.from.name}"`;
	const sequenceWithSchemaTo = st.to.schema
		? `"${st.to.schema}"."${st.to.name}"`
		: `"${st.to.name}"`;
	return `ALTER SEQUENCE ${sequenceWithSchemaFrom} RENAME TO "${sequenceWithSchemaTo}";`;
});

const moveSequenceConvertor = convertor('move_sequence', (st) => {
	const sequenceWithSchema = st.schemaFrom
		? `"${st.schemaFrom}"."${st.name}"`
		: `"${st.name}"`;
	const seqSchemaTo = st.schemaTo ? `"${st.schemaTo}"` : `public`;
	return `ALTER SEQUENCE ${sequenceWithSchema} SET SCHEMA ${seqSchemaTo};`;
});

const alterSequenceConvertor = convertor('alter_sequence', (st) => {
	const { schema, name, increment, minValue, maxValue, startWith, cache, cycle } = st.sequence;

	const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

	return `ALTER SEQUENCE ${sequenceWithSchema}${increment ? ` INCREMENT BY ${increment}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
		cache ? ` CACHE ${cache}` : ''
	}${cycle ? ` CYCLE` : ''};`;
});

const createRoleConvertor = convertor('create_role', (st) => {
	const { name, createDb, createRole, inherit } = st.role;
	const withClause = createDb || createRole || !inherit
		? ` WITH${createDb ? ' CREATEDB' : ''}${createRole ? ' CREATEROLE' : ''}${inherit ? '' : ' NOINHERIT'}`
		: '';

	return `CREATE ROLE "${name}"${withClause};`;
});

const dropRoleConvertor = convertor('drop_role', (st) => {
	return `DROP ROLE "${st.role.name}";`;
});

const renameRoleConvertor = convertor('rename_role', (st) => {
	return `ALTER ROLE "${st.from.name}" RENAME TO "${st.to.name}";`;
});

const alterRoleConvertor = convertor('alter_role', (st) => {
	const { name, createDb, createRole, inherit } = st.role;
	return `ALTER ROLE "${name}"${` WITH${createDb ? ' CREATEDB' : ' NOCREATEDB'}${
		createRole ? ' CREATEROLE' : ' NOCREATEROLE'
	}${inherit ? ' INHERIT' : ' NOINHERIT'}`};`;
});

const createPolicyConvertor = convertor('create_policy', (st) => {
	const { schema, table } = st.policy;
	const policy = st.policy;

	const tableNameWithSchema = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	const usingPart = policy.using ? ` USING (${policy.using})` : '';

	const withCheckPart = policy.withCheck ? ` WITH CHECK (${policy.withCheck})` : '';

	const policyToPart = policy.roles?.map((v) =>
		['current_user', 'current_role', 'session_user', 'public'].includes(v) ? v : `"${v}"`
	).join(', ');

	return `CREATE POLICY "${policy.name}" ON ${tableNameWithSchema} AS ${policy.as?.toUpperCase()} FOR ${policy.for?.toUpperCase()} TO ${policyToPart}${usingPart}${withCheckPart};`;
});

const dropPolicyConvertor = convertor('drop_policy', (st) => {
	const policy = st.policy;

	const tableNameWithSchema = policy.schema
		? `"${policy.schema}"."${policy.table}"`
		: `"${policy.table}"`;

	return `DROP POLICY "${policy.name}" ON ${tableNameWithSchema} CASCADE;`;
});

const renamePolicyConvertor = convertor('rename_policy', (st) => {
	const { from, to } = st;

	const tableNameWithSchema = to.schema
		? `"${to.schema}"."${to.table}"`
		: `"${to.table}"`;

	return `ALTER POLICY "${from.name}" ON ${tableNameWithSchema} RENAME TO "${to.name}";`;
});

const alterPolicyConvertor = convertor('alter_policy', (st) => {
	const { policy } = st;

	const tableNameWithSchema = policy.schema
		? `"${policy.schema}"."${policy.table}"`
		: `"${policy.table}"`;

	const usingPart = policy.using
		? ` USING (${policy.using})`
		: '';

	const withCheckPart = policy.withCheck
		? ` WITH CHECK (${policy.withCheck})`
		: '';

	const toClause = policy.roles?.map((v) =>
		['current_user', 'current_role', 'session_user', 'public'].includes(v) ? v : `"${v}"`
	).join(', ');

	const forClause = policy.for ? ` FOR ${policy.for.toUpperCase()}` : '';

	return `ALTER POLICY "${policy.name}" ON ${tableNameWithSchema}${forClause} TO ${toClause}${usingPart}${withCheckPart};`;
});

const toggleRlsConvertor = convertor('alter_rls', (st) => {
	const { table } = st;

	const tableNameWithSchema = table.schema
		? `"${table.schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} ${table.isRlsEnabled ? 'ENABLE' : 'DISABLE'} ROW LEVEL SECURITY;`;
});

const convertors = [
	createSchemaConvertor,
	dropSchemaConvertor,
	renameSchemaConvertor,
	createViewConvertor,
	dropViewConvertor,
	renameViewConvertor,
	moveViewConvertor,
	alterViewConvertor,
	recreateViewConvertor,
	createTableConvertor,
	renameTableConvertor,
	moveTableConvertor,
	addColumnConvertor,
	dropCheckConvertor,
	renameColumnConvertor,
	recreateColumnConvertor,
	alterColumnConvertor,
	createIndexConvertor,
	dropIndexConvertor,
	addPrimaryKeyConvertor,
	dropPrimaryKeyConvertor,
	createForeignKeyConvertor,
	alterForeignKeyConvertor,
	dropForeignKeyConvertor,
	addCheckConvertor,
	dropCheckConvertor,
	addUniqueConvertor,
	dropUniqueConvertor,
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
	renameRoleConvertor,
	alterRoleConvertor,
	createPolicyConvertor,
	dropPolicyConvertor,
	renamePolicyConvertor,
	alterPolicyConvertor,
	toggleRlsConvertor,
];

export function fromJson(
	statements: JsonStatement[],
) {
	const grouped = statements
		.map((statement) => {
			const filtered = convertors.filter((it) => {
				return it.can(statement);
			});

			const convertor = filtered.length === 1 ? filtered[0] : undefined;
			if (!convertor) {
				console.error('cant:', statement.type);
				return null;
			}

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

// blog.yo1.dog/updating-enum-values-in-postgresql-the-safe-and-easy-way/
// test case for enum altering
https: `
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
