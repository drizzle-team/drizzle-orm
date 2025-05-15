import { Simplify } from '../../utils';
import { defaultNameForPK, defaultToSQL } from './grammar';
import { JsonStatement } from './statements';

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

const createTable = convertor('create_table', (st) => {
	const { name, schema, columns, pk, checks, uniques } = st.table;

	let statement = '';

	const key = schema !== 'dbo' ? `[${schema}].[${name}]` : `[${name}]`;
	statement += `CREATE TABLE ${key} (\n`;

	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const isPK = pk && pk.columns.length === 1 && pk.columns[0] === column.name
			&& pk.name === defaultNameForPK(column.table);

		const identity = column.identity;
		const identityStatement = identity ? ` IDENTITY(${identity.seed}, ${identity.increment})` : '';
		const notNullStatement = isPK ? '' : column.notNull && !column.identity ? ' NOT NULL' : '';

		const generatedType = column.generated?.type.toUpperCase() === 'VIRTUAL'
			? ''
			: column.generated?.type.toUpperCase();
		const generatedStatement = column.generated
			? ` AS (${column.generated?.as})${' ' + generatedType}`
			: '';

		statement += '\t'
			+ `[${column.name}] ${column.type}${identityStatement}${generatedStatement}${notNullStatement}`;
		statement += i === columns.length - 1 ? '' : ',\n';
	}

	if (pk) {
		statement += ',\n';
		statement += `\tCONSTRAINT [${pk.name}] PRIMARY KEY([${pk.columns.join(`],[`)}])`;
	}

	for (const unique of uniques) {
		statement += ',\n';
		const uniqueString = unique.columns.join('],[');

		statement += `\tCONSTRAINT [${unique.name}] UNIQUE([${uniqueString}])`;
	}

	for (const check of checks) {
		statement += ',\n';
		statement += `\tCONSTRAINT [${check.name}] CHECK (${check.value})`;
	}

	statement += `\n);`;
	statement += `\n`;
	return statement;
});

const dropTable = convertor('drop_table', (st) => {
	const { table } = st;

	const key = table.schema !== 'dbo' ? `[${table.schema}].[${table.name}]` : `[${table.name}]`;

	return `DROP TABLE ${key};`;
});

const renameTable = convertor('rename_table', (st) => {
	const { from, schema, to } = st;

	const key = schema !== 'dbo' ? `${schema}.${from}` : `${from}`;

	return `EXEC sp_rename '${key}', [${to}];`;
});

const addColumn = convertor('add_column', (st) => {
	const { column } = st;
	const {
		name,
		type,
		notNull,
		table,
		generated,
		identity,
		schema,
	} = column;

	const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;
	const identityStatement = identity ? ` IDENTITY(${identity.seed}, ${identity.increment})` : '';

	const generatedType = column.generated?.type.toUpperCase() === 'VIRTUAL'
		? ''
		: column.generated?.type.toUpperCase();
	const generatedStatement = generated
		? ` AS (${generated?.as})${generatedType ? ' ' + generatedType : ''}`
		: '';

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;

	let statement = `ALTER TABLE ${key} ADD [${name}]`;
	if (!generated) statement += ` ${type}`;
	statement += `${identityStatement}${generatedStatement}${notNullStatement};`;

	return statement;
});

const dropColumn = convertor('drop_column', (st) => {
	const { column } = st;

	const key = column.schema !== 'dbo' ? `[${column.schema}].[${column.table}]` : `[${column.table}]`;
	return `ALTER TABLE ${key} DROP COLUMN [${st.column.name}];`;
});

const renameColumn = convertor('rename_column', (st) => {
	const { table: tableFrom, name: columnFrom, schema } = st.from;

	const key = schema !== 'dbo' ? `${schema}.${tableFrom}.${columnFrom}` : `${tableFrom}.${columnFrom}`;

	const { name: columnTo } = st.to;
	return `EXEC sp_rename '${key}', [${columnTo}], 'COLUMN';`;
});

const alterColumn = convertor('alter_column', (st) => {
	const { diff, column, isPK } = st;

	const identity = column.identity;

	const notNullStatement = `${column.notNull ? ' NOT NULL' : ''}`;
	const identityStatement = identity ? ` IDENTITY(${identity.seed}, ${identity.increment})` : '';

	const generatedStatement = column.generated
		? ` AS (${column.generated.as}) ${column.generated.type.toUpperCase()}`
		: '';

	const key = column.schema !== 'dbo' ? `[${column.schema}].[${column.table}]` : `[${column.table}]`;
	return `ALTER TABLE ${key} ALTER COLUMN [${column.name}] ${column.type}${identityStatement}${generatedStatement}${notNullStatement};`;
});

const recreateColumn = convertor('recreate_column', (st) => {
	return [dropColumn.convert(st) as string, addColumn.convert(st) as string];
});

const createIndex = convertor('create_index', (st) => {
	const { name, table, columns, isUnique, where, schema } = st.index;
	const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';

	const uniqueString = columns
		.map((it) => it.isExpression ? `${it.value}` : `[${it.value}]`)
		.join(',');

	const whereClause = where ? ` WHERE ${where}` : '';

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;
	return `CREATE ${indexPart} [${name}] ON ${key} (${uniqueString})${whereClause};`;
});

const dropIndex = convertor('drop_index', (st) => {
	const { schema, name, table } = st.index;

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;
	return `DROP INDEX [${name}] ON ${key};`;
});

const createFK = convertor('create_fk', (st) => {
	const {
		name,
		table,
		columns,
		tableTo,
		columnsTo,
		onDelete,
		onUpdate,
		schema,
	} = st.fk;
	const onDeleteStatement = onDelete !== 'NO ACTION' ? ` ON DELETE ${onDelete}` : '';
	const onUpdateStatement = onUpdate !== 'NO ACTION' ? ` ON UPDATE ${onUpdate}` : '';
	const fromColumnsString = columns.map((it) => `[${it}]`).join(',');
	const toColumnsString = columnsTo.map((it) => `[${it}]`).join(',');

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;
	return `ALTER TABLE ${key} ADD CONSTRAINT [${name}] FOREIGN KEY (${fromColumnsString}) REFERENCES [${tableTo}](${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
});

const createPK = convertor('create_pk', (st) => {
	const { name, schema, table, columns } = st.pk;

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;
	return `ALTER TABLE ${key} ADD CONSTRAINT [${name}] PRIMARY KEY ([${columns.join('],[')}]);`;
});

const renamePk = convertor('rename_pk', (st) => {
	const { name: nameFrom, schema: schemaFrom } = st.from;
	const { name: nameTo } = st.to;

	const key = schemaFrom !== 'dbo' ? `${schemaFrom}.${nameFrom}` : `${nameFrom}`;
	return `EXEC sp_rename '${key}', [${nameTo}], 'OBJECT';`;
});

const renameCheck = convertor('rename_check', (st) => {
	const { name: nameFrom, schema: schemaFrom } = st.from;
	const { name: nameTo } = st.to;

	const key = schemaFrom !== 'dbo' ? `${schemaFrom}.${nameFrom}` : `${nameFrom}`;
	return `EXEC sp_rename '${key}', [${nameTo}], 'OBJECT';`;
});

const renameFk = convertor('rename_fk', (st) => {
	const { name: nameFrom, schema: schemaFrom } = st.from;
	const { name: nameTo } = st.to;

	const key = schemaFrom !== 'dbo' ? `${schemaFrom}.${nameFrom}` : `${nameFrom}`;
	return `EXEC sp_rename '${key}', [${nameTo}], 'OBJECT';`;
});

const renameIndex = convertor('rename_index', (st) => {
	const { name: nameFrom, schema: schemaFrom, table: tableFrom } = st.from;
	const { name: nameTo } = st.to;

	const key = schemaFrom !== 'dbo' ? `${schemaFrom}.${tableFrom}.${nameFrom}` : `${tableFrom}.${nameFrom}`;
	return `EXEC sp_rename '${key}', [${nameTo}], 'INDEX';`;
});

const renameUnique = convertor('rename_unique', (st) => {
	const { name: nameFrom, schema: schemaFrom } = st.from;
	const { name: nameTo } = st.to;

	const key = schemaFrom !== 'dbo' ? `${schemaFrom}.${nameFrom}` : `${nameFrom}`;
	return `EXEC sp_rename '${key}', [${nameTo}], 'OBJECT';`;
});

const createCheck = convertor('create_check', (st) => {
	const { name, schema, table, value } = st.check;

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;
	return `ALTER TABLE ${key} ADD CONSTRAINT [${name}] CHECK (${value});`;
});

const dropConstraint = convertor('drop_constraint', (st) => {
	const { constraint, table, schema } = st;

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;
	return `ALTER TABLE ${key} DROP CONSTRAINT [${constraint}];`;
});

const createView = convertor('create_view', (st) => {
	const { definition, name, checkOption, encryption, schemaBinding, viewMetadata, schema } = st.view;

	let statement = `CREATE `;

	const key = schema === 'dbo' ? `[${name}]` : `[${schema}].[${name}]`;
	statement += `VIEW ${key}`;

	if (encryption || schemaBinding || viewMetadata) {
		const options: string[] = [];
		statement += `\nWITH`;

		if (encryption) options.push(`ENCRYPTION`);
		if (schemaBinding) options.push(`SCHEMABINDING`);
		if (viewMetadata) options.push(`VIEW_METADATA`);

		statement += ` ${options.join(', ')}`;
	}
	statement += ` AS (${definition})`;
	statement += checkOption ? `\nWITH CHECK OPTION` : '';

	statement += ';';

	return statement;
});

const dropView = convertor('drop_view', (st) => {
	const { schema, name } = st.view;
	const key = schema === 'dbo' ? `[${name}]` : `[${schema}].[${name}]`;

	return `DROP VIEW ${key};`;
});

const renameView = convertor('rename_view', (st) => {
	const { schema, name } = st.from;
	const key = schema === 'dbo' ? `${name}` : `${schema}.${name}`;

	return `EXEC sp_rename '${key}', [${st.to.name}];`;
});

const alterView = convertor('alter_view', (st) => {
	const { definition, name, checkOption, encryption, schemaBinding, viewMetadata, schema } = st.view;

	const key = schema === 'dbo' ? `[${name}]` : `[${schema}].[${name}]`;
	let statement = `ALTER `;
	statement += `VIEW ${key}`;

	if (encryption || schemaBinding || viewMetadata) {
		const options: string[] = [];
		statement += `\nWITH`;

		if (encryption) options.push(`ENCRYPTION`);
		if (schemaBinding) options.push(`SCHEMABINDING`);
		if (viewMetadata) options.push(`VIEW_METADATA`);

		statement += ` ${options.join(', ')}`;
	}
	statement += ` AS (${definition})`;
	statement += checkOption ? `\nWITH CHECK OPTION` : '';

	statement += ';';

	return statement;
});

const createSchema = convertor('create_schema', (st) => {
	return `CREATE SCHEMA [${st.name}];\n`;
});

const dropSchema = convertor('drop_schema', (st) => {
	return `DROP SCHEMA [${st.name}];\n`;
});

const renameSchema = convertor('rename_schema', (st) => {
	return `/**
 * ⚠️ Renaming schemas is not supported in SQL Server (MSSQL),
 * and therefore is not supported in Drizzle ORM at this time
 * 
 * SQL Server does not provide a built-in command to rename a schema directly.
 * Workarounds involve creating a new schema and migrating objects manually
 */`;
});

const moveTable = convertor('move_table', (st) => {
	const { from, name, to } = st;
	return `ALTER SCHEMA [${to}] TRANSFER [${from}].[${name}];\n`;
});

const moveView = convertor('move_view', (st) => {
	const { fromSchema, toSchema, view } = st;
	const from = fromSchema === 'dbo' ? `[${view.name}]` : `[${fromSchema}].[${view.name}]`;

	return `ALTER SCHEMA [${toSchema}] TRANSFER ${from};`;
});

const addUniqueConvertor = convertor('add_unique', (st) => {
	const { unique } = st;
	const tableNameWithSchema = unique.schema !== 'dbo'
		? `[${unique.schema}].[${unique.table}]`
		: `[${unique.table}]`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT [${unique.name}] UNIQUE([${unique.columns.join('],[')}]);`;
});

const dropPK = convertor('drop_pk', (st) => {
	const pk = st.pk;
	const key = pk.schema !== 'dbo'
		? `[${pk.schema}].[${pk.table}]`
		: `[${pk.table}]`;

	return `ALTER TABLE ${key} DROP CONSTRAINT [${pk.name}];`;
});

const recreatePK = convertor('alter_pk', (it) => {
	const drop = dropPK.convert({ pk: it.pk }) as string;
	const create = createPK.convert({ pk: it.pk }) as string;
	return [drop, create];
});

const recreateView = convertor('recreate_view', (st) => {
	const drop = dropView.convert({ view: st.from }) as string;
	const create = createView.convert({ view: st.to }) as string;
	return [drop, create];
});

const addCheck = convertor('add_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'dbo'
		? `[${check.schema}].[${check.table}]`
		: `[${check.table}]`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT [${check.name}] CHECK (${check.value});`;
});

const dropCheck = convertor('drop_check', (st) => {
	const { check } = st;
	const tableNameWithSchema = check.schema !== 'dbo'
		? `[${check.schema}].[${check.table}]`
		: `[${check.table}]`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT [${check.name}];`;
});

const alterCheck = convertor('alter_check', (st) => {
	const check = st.diff;

	const dropObj = {
		entityType: check.entityType,
		name: check.name,
		schema: check.schema,
		nameExplicit: false,
		table: check.table,
		value: check.value!.from,
	};
	const createObj = {
		entityType: check.entityType,
		name: check.name,
		nameExplicit: false,
		schema: check.schema,
		table: check.table,
		value: check.value!.to,
	};

	const drop = dropCheck.convert({ check: dropObj }) as string;
	const create = addCheck.convert({ check: createObj }) as string;

	return [drop, create];
});

const dropUnique = convertor('drop_unique', (st) => {
	const { unique } = st;

	const tableNameWithSchema = unique.schema !== 'dbo'
		? `[${unique.schema}].[${unique.table}]`
		: `[${unique.table}]`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT [${unique.name}];`;
});

const dropForeignKey = convertor('drop_fk', (st) => {
	const { schema, table, name } = st.fk;

	const tableNameWithSchema = schema !== 'dbo'
		? `[${schema}].[${table}]`
		: `[${table}]`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT [${name}];\n`;
});

const addDefault = convertor('create_default', (st) => {
	const { schema, table, name, default: tableDefault } = st.default;

	const tableNameWithSchema = schema !== 'dbo'
		? `[${schema}].[${table}]`
		: `[${table}]`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT [${name}] DEFAULT ${defaultToSQL(tableDefault)};`;
});

const dropDefault = convertor('drop_default', (st) => {
	const { schema, table, name } = st.default;

	const tableNameWithSchema = schema !== 'dbo'
		? `[${schema}].[${table}]`
		: `[${table}]`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT [${name}];`;
});

const renameDefault = convertor('rename_default', (st) => {
	const { name: nameFrom, schema: schemaFrom } = st.from;
	const { name: nameTo } = st.to;

	const key = schemaFrom !== 'dbo' ? `${schemaFrom}.${nameFrom}` : `${nameFrom}`;
	return `EXEC sp_rename '${key}', [${nameTo}], 'OBJECT';`;
});

const convertors = [
	createTable,
	dropTable,
	renameTable,
	addColumn,
	dropColumn,
	renameColumn,
	alterColumn,
	recreateColumn,
	createIndex,
	dropIndex,
	createFK,
	createPK,
	dropPK,
	recreatePK,
	createCheck,
	dropConstraint,
	createView,
	dropView,
	renameView,
	alterView,
	createSchema,
	dropSchema,
	moveTable,
	moveView,
	recreateView,
	addCheck,
	dropCheck,
	alterCheck,
	renameSchema,
	addUniqueConvertor,
	renamePk,
	renameCheck,
	renameFk,
	renameIndex,
	dropUnique,
	dropForeignKey,
	renameUnique,
	addDefault,
	dropDefault,
	renameDefault,
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
