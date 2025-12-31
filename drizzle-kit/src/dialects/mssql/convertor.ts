import type { Simplify } from '../../utils';
import type { DefaultConstraint } from './ddl';
import type { DropColumn, JsonStatement, RenameColumn } from './statements';

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
	const { name, schema, columns, pk, checks, uniques, defaults } = st.table;

	let statement = '';

	const key = schema !== 'dbo' ? `[${schema}].[${name}]` : `[${name}]`;
	statement += `CREATE TABLE ${key} (\n`;

	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const isPK = pk && pk.columns.includes(column.name);

		const identity = column.identity;
		const identityStatement = identity ? ` IDENTITY(${identity.seed}, ${identity.increment})` : '';
		const notNullStatement = isPK ? '' : column.notNull && !column.identity && !column.generated ? ' NOT NULL' : '';

		const hasDefault = defaults.find((it) =>
			it.table === column.table && it.column === column.name && it.schema === column.schema
		);
		const defaultStatement = !hasDefault
			? ''
			: ` CONSTRAINT [${hasDefault.name}] DEFAULT ${hasDefault.default}`;

		const generatedType = column.generated?.type.toUpperCase() === 'VIRTUAL'
			? ''
			: column.generated?.type.toUpperCase();
		const generatedStatement = column.generated
			? ` AS (${column.generated?.as})${' ' + generatedType}`
			: '';

		statement += '\t'
			+ `[${column.name}] ${
				generatedStatement ? '' : column.type
			}${identityStatement}${generatedStatement}${notNullStatement}${defaultStatement}`;
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
	const { column, defaults } = st;
	const {
		name,
		notNull,
		table,
		generated,
		identity,
		schema,
	} = column;

	const notNullStatement = notNull && !column.generated && !column.identity ? ' NOT NULL' : '';
	const identityStatement = identity ? ` IDENTITY(${identity.seed}, ${identity.increment})` : '';

	const generatedType = column.generated?.type.toUpperCase() === 'VIRTUAL'
		? ''
		: column.generated?.type.toUpperCase();
	const generatedStatement = generated
		? ` AS (${generated?.as})${generatedType ? ' ' + generatedType : ''}`
		: '';

	const hasDefault = defaults.find((it) =>
		it.table === column.table && it.column === column.name && it.schema === column.schema
	);
	const defaultStatement = !hasDefault
		? ''
		: ` CONSTRAINT [${hasDefault.name}] DEFAULT ${hasDefault.default}`;

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;

	let statement = `ALTER TABLE ${key} ADD [${name}]`;
	if (!generated) statement += ` ${column.type}`;
	statement += `${identityStatement}${generatedStatement}${notNullStatement}${defaultStatement};`;

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
	const { diff } = st;

	const column = diff.$right;
	const notNullStatement = `${column.notNull ? ' NOT NULL' : ''}`;

	const key = column.schema !== 'dbo' ? `[${column.schema}].[${column.table}]` : `[${column.table}]`;

	return `ALTER TABLE ${key} ALTER COLUMN [${column.name}] ${column.type}${notNullStatement};`;
});

const recreateColumn = convertor('recreate_column', (st) => {
	return [
		dropColumn.convert({ column: st.diff.$left }) as string,
		addColumn.convert({ column: st.diff.$right, defaults: [], isPK: false }) as string,
	];
});

const recreateIdentityColumn = convertor('recreate_identity_column', (st) => {
	const { column, constraintsToCreate, constraintsToDelete } = st;

	const shouldTransferData = column.identity?.from && Boolean(!column.identity.to);
	const statements = [];

	for (const toDelete of constraintsToDelete) {
		if (toDelete.entityType === 'fks') statements.push(dropForeignKey.convert({ fk: toDelete }) as string);
		if (toDelete.entityType === 'checks') statements.push(dropCheck.convert({ check: toDelete }) as string);
		if (toDelete.entityType === 'defaults') statements.push(dropDefault.convert({ default: toDelete }) as string);
		if (toDelete.entityType === 'pks') statements.push(dropPK.convert({ pk: toDelete }) as string);
		if (toDelete.entityType === 'indexes') statements.push(dropIndex.convert({ index: toDelete }) as string);
		if (toDelete.entityType === 'uniques') statements.push(dropUnique.convert({ unique: toDelete }) as string);
	}

	const renamedColumnName = `__old_${column.name}`;
	statements.push(
		renameColumn.convert({
			from: { table: column.table, name: column.name, schema: column.schema },
			to: { name: renamedColumnName },
		} as RenameColumn) as string,
	);

	const defaultsToCreate: DefaultConstraint[] = constraintsToCreate.filter((it) => it.entityType === 'defaults');
	statements.push(addColumn.convert({ column: column.$right, defaults: defaultsToCreate, isPK: false }) as string);

	if (shouldTransferData) {
		statements.push(
			`INSERT INTO [${column.table}] ([${column.name}]) SELECT [${renamedColumnName}] FROM [${column.table}];`,
		);
	}

	statements.push(
		dropColumn.convert(
			{ column: { name: renamedColumnName, schema: column.schema, table: column.table } } as DropColumn,
		) as string,
	);

	for (const toCreate of constraintsToCreate) {
		if (toCreate.entityType === 'checks') statements.push(addCheck.convert({ check: toCreate }) as string);
		if (toCreate.entityType === 'fks') statements.push(createFK.convert({ fk: toCreate }) as string);
		if (toCreate.entityType === 'pks') statements.push(createPK.convert({ pk: toCreate }) as string);
		if (toCreate.entityType === 'indexes') statements.push(createIndex.convert({ index: toCreate }) as string);
		if (toCreate.entityType === 'uniques') statements.push(addUnique.convert({ unique: toCreate }) as string);
	}

	return statements;
});

const createIndex = convertor('create_index', (st) => {
	const { name, table, columns, isUnique, where, schema } = st.index;
	const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';

	const uniqueString = `${
		columns.map((it) => {
			return it.isExpression ? it.value : `[${it.value}]`;
		})
	}`;

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
		schemaTo,
	} = st.fk;
	const onDeleteStatement = onDelete !== 'NO ACTION' ? ` ON DELETE ${onDelete}` : '';
	const onUpdateStatement = onUpdate !== 'NO ACTION' ? ` ON UPDATE ${onUpdate}` : '';
	const fromColumnsString = columns.map((it) => `[${it}]`).join(',');
	const toColumnsString = columnsTo.map((it) => `[${it}]`).join(',');

	const key = schema !== 'dbo' ? `[${schema}].[${table}]` : `[${table}]`;
	const keyTo = schemaTo !== 'dbo' ? `[${schemaTo}].[${tableTo}]` : `[${tableTo}]`;

	return `ALTER TABLE ${key} ADD CONSTRAINT [${name}] FOREIGN KEY (${fromColumnsString}) REFERENCES ${keyTo}(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
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
	statement += ` AS ${definition}`;
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
	let statement = `ALTER VIEW ${key}`;

	if (encryption || schemaBinding || viewMetadata) {
		const options: string[] = [];
		statement += `\nWITH`;

		if (encryption) options.push(`ENCRYPTION`);
		if (schemaBinding) options.push(`SCHEMABINDING`);
		if (viewMetadata) options.push(`VIEW_METADATA`);

		statement += ` ${options.join(', ')}`;
	}
	statement += ` AS ${definition}`;
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

const renameSchema = convertor('rename_schema', (_st) => {
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

const addUnique = convertor('add_unique', (st) => {
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
	const { schema, table, name, default: tableDefault, column } = st.default;

	const tableNameWithSchema = schema !== 'dbo'
		? `[${schema}].[${table}]`
		: `[${table}]`;

	return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT [${name}] DEFAULT ${tableDefault} FOR [${column}];`;
});

const dropDefault = convertor('drop_default', (st) => {
	const { schema, table, name } = st.default;

	const tableNameWithSchema = schema !== 'dbo'
		? `[${schema}].[${table}]`
		: `[${table}]`;

	return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT [${name}];`;
});

const renameDefault = convertor('recreate_default', (st) => {
	const { from, to } = st;

	return [dropDefault.convert({ default: from }) as string, addDefault.convert({ default: to }) as string];
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
	recreateIdentityColumn,
	createIndex,
	dropIndex,
	createFK,
	createPK,
	dropPK,
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
	addCheck,
	dropCheck,
	renameSchema,
	addUnique,
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
