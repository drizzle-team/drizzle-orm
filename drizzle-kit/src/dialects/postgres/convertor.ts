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
	const { definition, name: viewName, schema, with: withOption, materialized, withNoData, tablespace, using } = st.view;

	const name = schema !== 'public' ? `"${schema}"."${viewName}"` : `"${viewName}"`;
	let statement = materialized ? `CREATE MATERIALIZED VIEW ${name}` : `CREATE VIEW ${name}`;
	if (using && !using.default) statement += ` USING "${using.name}"`;

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

const alterViewConvertor = convertor('alter_view', (st) => {
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
		return val !== null && from != val;
	}).map((it) => `${it[0].snake_case()} = ${it[1]}`).join(', ');

	if (setOptions.length > 0) statements.push(`ALTER ${viewClause} SET (${setOptions});`);
	if (resetOptions.length > 0) statements.push(`ALTER ${viewClause} RESET (${resetOptions.join(', ')});`);
	// TODO: reset missing options, set changed options and new options?

	if (diff.tablespace) {
		const to = diff.tablespace.to || defaults.tablespace;
		statements.push(`ALTER ${viewClause} SET TABLESPACE "${to}";`);
	}

	if (diff.using) {
		const toUsing = diff.using.to ? diff.using.to.name : defaults.accessMethod;
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
	const key = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	statement += `CREATE TABLE ${key} (\n`;
	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === column.name
			&& pk.name === defaultNameForPK(column.table);

		const primaryKeyStatement = isPK ? ' PRIMARY KEY' : '';
		const notNullStatement = isPK ? '' : column.notNull && !column.identity ? ' NOT NULL' : '';
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

		const arr = column.dimensions > 0 ? '[]'.repeat(column.dimensions) : '';
		const options = column.options ? `(${column.options})` : '';
		const colType = column.typeSchema ? `"${column.type}"` : column.type;
		const type = `${schemaPrefix}${colType}${options}${arr}`;

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
		statement += `\tCONSTRAINT "${pk.name}" PRIMARY KEY(\"${pk.columns.join(`","`)}\")`;
	}

	for (const it of uniques.filter((u) => u.columns.length > 1)) {
		// TODO: skip for inlined uniques || DECIDE
		// if (it.columns.length === 1 && it.name === `${name}_${it.columns[0]}_key`) continue;

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
			name: st.table.name,
			schema: st.table.schema,
		}) as string);
	}

	return statements;
});

const dropTableConvertor = convertor('drop_table', (st) => {
	const { name, schema, policies } = st.table;

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${name}"`
		: `"${name}"`;

	const droppedPolicies = policies.map((policy) => dropPolicyConvertor.convert({ policy }) as string);

	return [
		...droppedPolicies,
		`DROP TABLE ${tableNameWithSchema};`,
	];
});

const renameTableConvertor = convertor('rename_table', (st) => {
	const schemaPrefix = st.schema !== 'public'
		? `"${st.schema}".`
		: '';

	return `ALTER TABLE ${schemaPrefix}"${st.from}" RENAME TO "${st.to}";`;
});

const moveTableConvertor = convertor('move_table', (st) => {
	const from = st.from !== 'public' ? `"${st.from}"."${st.name}"` : `"${st.name}"`;

	return `ALTER TABLE ${from} SET SCHEMA "${st.to}";\n`;
});

const addColumnConvertor = convertor('add_column', (st) => {
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

	const options = column.options ? `(${column.options})` : '';
	const type = column.typeSchema ? `"${column.type}"` : column.type;
	let fixedType = `${schemaPrefix}${type}${options}${'[]'.repeat(column.dimensions)}`;

	const notNullStatement = column.notNull && !identity && !generated ? ' NOT NULL' : '';

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
});

const dropColumnConvertor = convertor('drop_column', (st) => {
	const { schema, table, name } = st.column;

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP COLUMN "${name}";`;
});

const renameColumnConvertor = convertor('rename_column', (st) => {
	const { table, schema } = st.from;
	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} RENAME COLUMN "${st.from.name}" TO "${st.to.name}";`;
});

const recreateColumnConvertor = convertor('recreate_column', (st) => {
	// AlterTableAlterColumnSetExpressionConvertor
	// AlterTableAlterColumnAlterGeneratedConvertor

	const drop = dropColumnConvertor.convert({ column: st.column }) as string;
	const add = addColumnConvertor.convert({ column: st.column, isPK: st.isPK }) as string;

	return [drop, add];
});

const alterColumnConvertor = convertor('alter_column', (st) => {
	const { diff, to: column, isEnum, wasEnum } = st;
	const statements = [] as string[];

	const key = column.schema !== 'public'
		? `"${column.schema}"."${column.table}"`
		: `"${column.table}"`;

	const recreateDefault = diff.type && (isEnum || wasEnum) && (column.default || (diff.default && diff.default.from));
	if (recreateDefault) {
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
	}

	if (diff.type || diff.options) {
		const typeSchema = column.typeSchema && column.typeSchema !== 'public' ? `"${column.typeSchema}".` : '';
		const textProxy = wasEnum && isEnum ? 'text::' : ''; // using enum1::text::enum2
		const arrSuffix = column.dimensions > 0 ? '[]'.repeat(column.dimensions) : '';
		const suffix = isEnum ? ` USING "${column.name}"::${textProxy}${typeSchema}"${column.type}"${arrSuffix}` : '';
		let type: string;

		if (diff.type) {
			type = diff.typeSchema?.to && diff.typeSchema.to !== 'public'
				? `"${diff.typeSchema.to}"."${diff.type.to}"`
				: isEnum
				? `"${diff.type.to}"`
				: diff.type.to; // TODO: enum?
		} else {
			type = `${typeSchema}${column.typeSchema ? `"${column.type}"` : column.type}`;
		}

		type += column.options ? `(${column.options})` : '';
		type += arrSuffix;
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE ${type}${suffix};`);

		if (recreateDefault) {
			statements.push(
				`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${defaultToSQL(column)};`,
			);
		}
	}

	if (diff.default && !recreateDefault) {
		if (diff.default.to) {
			statements.push(
				`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${defaultToSQL(diff.$right)};`,
			);
		} else {
			statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
		}
	}

	if (diff.generated && diff.generated.to === null) {
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP EXPRESSION;`);
	}

	// TODO: remove implicit notnull in orm
	// skip if not null was implicit from identity and identity is dropped
	if (diff.notNull && !(diff.notNull.to === false && diff.identity && !diff.identity.to)) {
		const clause = diff.notNull.to ? 'SET NOT NULL' : 'DROP NOT NULL';
		statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" ${clause};`);
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

const dropIndexConvertor = convertor('drop_index', (st) => {
	return `DROP INDEX "${st.index.name}";`;
});

const renameIndexConvertor = convertor('rename_index', (st) => {
	const key = st.schema !== 'public' ? `"${st.schema}"."${st.from}"` : `"${st.from}"`;

	return `ALTER INDEX ${key} RENAME TO "${st.to}";`;
});

const addPrimaryKeyConvertor = convertor('add_pk', (st) => {
	const { pk } = st;
	const key = pk.schema !== 'public'
		? `"${pk.schema}"."${pk.table}"`
		: `"${pk.table}"`;

	if (!pk.nameExplicit) {
		return `ALTER TABLE ${key} ADD PRIMARY KEY ("${pk.columns.join('","')}");`;
	}
	return `ALTER TABLE ${key} ADD CONSTRAINT "${pk.name}" PRIMARY KEY("${pk.columns.join('","')}");`;
});

const dropPrimaryKeyConvertor = convertor('drop_pk', (st) => {
	const pk = st.pk;
	const key = pk.schema !== 'public'
		? `"${pk.schema}"."${pk.table}"`
		: `"${pk.table}"`;

	return `ALTER TABLE ${key} DROP CONSTRAINT "${pk.name}";`;
});

const recreatePrimaryKeyConvertor = convertor('alter_pk', (it) => {
	const drop = dropPrimaryKeyConvertor.convert({ pk: it.pk }) as string;
	const create = addPrimaryKeyConvertor.convert({ pk: it.pk }) as string;
	return [drop, create];
});

const renameConstraintConvertor = convertor('rename_constraint', (st) => {
	const key = st.schema !== 'public'
		? `"${st.schema}"."${st.table}"`
		: `"${st.table}"`;

	return `ALTER TABLE ${key} RENAME CONSTRAINT "${st.from}" TO "${st.to}";`;
});

const createForeignKeyConvertor = convertor('create_fk', (st) => {
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

const recreateFKConvertor = convertor('recreate_fk', (st) => {
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

const dropForeignKeyConvertor = convertor('drop_fk', (st) => {
	const { schema, table, name } = st.fk;

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${name}";`;
});

const addCheckConvertor = convertor('add_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'public'
		? `"${check.schema}"."${check.table}"`
		: `"${check.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${check.name}" CHECK (${check.value});`;
});

const dropCheckConvertor = convertor('drop_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'public'
		? `"${check.schema}"."${check.table}"`
		: `"${check.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${check.name}";`;
});

const recreateCheckConvertor = convertor('alter_check', (st) => {
	const { check } = st;

	const key = check.schema !== 'public'
		? `"${check.schema}"."${check.table}"`
		: `"${check.table}"`;

	let sql = `ALTER TABLE ${key} DROP CONSTRAINT "${check.name}", `;
	sql += `ADD CONSTRAINT "${check.name}" CHECK (${check.value});`;

	return sql;
});

const addUniqueConvertor = convertor('add_unique', (st) => {
	const { unique } = st;
	const tableNameWithSchema = unique.schema !== 'public'
		? `"${unique.schema}"."${unique.table}"`
		: `"${unique.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${unique.name}" UNIQUE${
		unique.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''
	}("${unique.columns.join('","')}");`;
});

const dropUniqueConvertor = convertor('drop_unique', (st) => {
	const { unique } = st;
	const tableNameWithSchema = unique.schema !== 'public'
		? `"${unique.schema}"."${unique.table}"`
		: `"${unique.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${unique.name}";`;
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
	const { diff, enum: e } = st;
	const key = e.schema !== 'public' ? `"${e.schema}"."${e.name}"` : `"${e.name}"`;

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
		if (column.default) statements.push(`ALTER TABLE ${key} ALTER COLUMN "${column.name}" DROP DEFAULT;`);
	}
	statements.push(dropEnumConvertor.convert({ enum: to }) as string);
	statements.push(createEnumConvertor.convert({ enum: to }) as string);

	for (const column of columns) {
		const key = column.schema !== 'public' ? `"${column.schema}"."${column.table}"` : `"${column.table}"`;
		const arr = column.dimensions > 0 ? '[]'.repeat(column.dimensions) : '';
		const enumType = to.schema !== 'public' ? `"${to.schema}"."${to.name}"${arr}` : `"${to.name}"${arr}`;
		statements.push(
			`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DATA TYPE ${enumType} USING "${column.name}"::${enumType};`,
		);
		if (column.default) {
			statements.push(
				`ALTER TABLE ${key} ALTER COLUMN "${column.name}" SET DEFAULT ${defaultToSQL(column)};`,
			);
		}
	}

	return statements;
});

const createSequenceConvertor = convertor('create_sequence', (st) => {
	const { name, schema, minValue, maxValue, incrementBy, startWith, cacheSize, cycle } = st.sequence;
	const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

	return `CREATE SEQUENCE ${sequenceWithSchema}${incrementBy ? ` INCREMENT BY ${incrementBy}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
		cacheSize ? ` CACHE ${cacheSize}` : ''
	}${cycle ? ` CYCLE` : ''};`;
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
	const sequenceWithSchema = from.schema !== 'public'
		? `"${from.schema}"."${from.name}"`
		: `"${from.name}"`;
	const seqSchemaTo = `"${to.schema}"`;
	return `ALTER SEQUENCE ${sequenceWithSchema} SET SCHEMA ${seqSchemaTo};`;
});

const alterSequenceConvertor = convertor('alter_sequence', (st) => {
	const { schema, name, incrementBy, minValue, maxValue, startWith, cacheSize, cycle } = st.sequence;

	const sequenceWithSchema = schema !== 'public' ? `"${schema}"."${name}"` : `"${name}"`;

	return `ALTER SEQUENCE ${sequenceWithSchema}${incrementBy ? ` INCREMENT BY ${incrementBy}` : ''}${
		minValue ? ` MINVALUE ${minValue}` : ''
	}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
		cacheSize ? ` CACHE ${cacheSize}` : ''
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

	const tableNameWithSchema = schema !== 'public'
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

	const tableNameWithSchema = policy.schema !== 'public'
		? `"${policy.schema}"."${policy.table}"`
		: `"${policy.table}"`;

	return `DROP POLICY "${policy.name}" ON ${tableNameWithSchema};`;
});

const renamePolicyConvertor = convertor('rename_policy', (st) => {
	const { from, to } = st;

	const tableNameWithSchema = to.schema !== 'public'
		? `"${to.schema}"."${to.table}"`
		: `"${to.table}"`;

	return `ALTER POLICY "${from.name}" ON ${tableNameWithSchema} RENAME TO "${to.name}";`;
});

const alterPolicyConvertor = convertor('alter_policy', (st) => {
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

	const toClause = policy.roles?.map((v) =>
		['current_user', 'current_role', 'session_user', 'public'].includes(v) ? v : `"${v}"`
	).join(', ');

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

	const tableNameWithSchema = schema !== 'public'
		? `"${schema}"."${name}"`
		: `"${name}"`;

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
	alterViewConvertor,
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
	recreatePolicy,
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
