import { BREAKPOINT } from '../../global';
import { escapeSingleQuotes, Simplify } from '../../utils';
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

const parseType = (schemaPrefix: string, type: string) => {
	const NativeTypes = [
		'uuid',
		'smallint',
		'integer',
		'bigint',
		'boolean',
		'text',
		'varchar',
		'serial',
		'bigserial',
		'decimal',
		'numeric',
		'real',
		'json',
		'jsonb',
		'time',
		'time with time zone',
		'time without time zone',
		'time',
		'timestamp',
		'timestamp with time zone',
		'timestamp without time zone',
		'date',
		'interval',
		'bigint',
		'bigserial',
		'double precision',
		'interval year',
		'interval month',
		'interval day',
		'interval hour',
		'interval minute',
		'interval second',
		'interval year to month',
		'interval day to hour',
		'interval day to minute',
		'interval day to second',
		'interval hour to minute',
		'interval hour to second',
		'interval minute to second',
		'char',
		'vector',
		'geometry',
	];
	const arrayDefinitionRegex = /\[\d*(?:\[\d*\])*\]/g;
	const arrayDefinition = (type.match(arrayDefinitionRegex) ?? []).join('');
	const withoutArrayDefinition = type.replace(arrayDefinitionRegex, '');
	return NativeTypes.some((it) => type.startsWith(it))
		? `${withoutArrayDefinition}${arrayDefinition}`
		: `${schemaPrefix}"${withoutArrayDefinition}"${arrayDefinition}`;
};

interface Convertor {
	can(
		statement: JsonStatement,
	): boolean;
	convert(
		statement: JsonStatement,
	): string | string[];
}

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

// alter view - recreate
const alterViewConvertor = convertor('alter_view', (st) => {
	// alter view with options
	const { schema, with: withOption, name, materialized } = st;
	let statement = `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW "${schema}"."${name}" SET (`;
	const options: string[] = [];
	for (const [key, value] of Object.entries(withOption)) {
		options.push(`${key.snake_case()} = ${value}`);
	}
	statement += options.join(', ');
	statement += `);`;
	return statement;

	// alter view drop with options
	const { schema, name, materialized, with: withOptions } = st;
	let statement = `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW "${schema}"."${name}" RESET (`;
	const options: string[] = [];
	Object.entries(withOptions).forEach(([key, value]) => {
		options.push(`${key.snake_case()}`);
	});
	statement += options.join(', ');
	statement += ');';
	return statement;

	// alter table namescpace
	const { schema, name, toTablespace } = st;
	const statement = `ALTER MATERIALIZED VIEW "${schema}"."${name}" SET TABLESPACE ${toTablespace};`;

	// AlterViewAlterUsingConvertor
	const { schema, name, toUsing } = st;
	const statement = `ALTER MATERIALIZED VIEW "${schema}"."${name}" SET ACCESS METHOD "${toUsing}";`;
	return statement;

	const drop = dropViewConvertor.convert({ view: st.from }) as string;
	const create = createViewConvertor.convert({ view: st.to }) as string;
	return [drop, create];
});

const CreateTableConvertor = convertor('create_table', (st) => {
	const { tableName, schema, columns, compositePKs, uniqueConstraints, checkConstraints, policies, isRLSEnabled } = st;

	let statement = '';
	const name = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;

	statement += `CREATE TABLE IF NOT EXISTS ${name} (\n`;
	for (let i = 0; i < columns.length; i++) {
		const column = columns[i];

		const primaryKeyStatement = column.primaryKey ? ' PRIMARY KEY' : '';
		const notNullStatement = column.notNull && !column.identity ? ' NOT NULL' : '';
		const defaultStatement = column.default !== undefined ? ` DEFAULT ${column.default}` : '';

		const uniqueConstraint = uniqueConstraints.find((it) =>
			it.columns.length === 1 && it.columns[0] === column.name && `${tableName}_${column.name}_key` === it.name
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

	if (typeof compositePKs !== 'undefined' && compositePKs.length > 0) {
		statement += ',\n';
		const compositePK = compositePKs[0];
		statement += `\tCONSTRAINT "${st.compositePkName}" PRIMARY KEY(\"${compositePK.columns.join(`","`)}\")`;
		// statement += `\n`;
	}

	for (const it of uniqueConstraints) {
		// skip for inlined uniques
		if (it.columns.length === 1 && it.name === `${tableName}_${it.columns[0]}_key`) continue;

		statement += ',\n';
		statement += `\tCONSTRAINT "${it.name}" UNIQUE${it.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''}(\"${
			it.columns.join(`","`)
		}\")`;
		// statement += `\n`;
	}

	for (const check of checkConstraints) {
		statement += ',\n';
		statement += `\tCONSTRAINT "${check.name}" CHECK (${check.value})`;
	}

	statement += `\n);`;
	statement += `\n`;

	const enableRls = rlsConvertor.convert({
		type: 'enable_rls',
		tableName,
		schema,
	});

	return [statement, ...(policies && policies.length > 0 || isRLSEnabled ? [enableRls] : [])];
});

const alterColumnGeneratedConvertor = convertor('alter_column_generated', (st) => {
	const { identity, tableName, columnName, schema } = statement;

	const tableNameWithSchema = schema
		? `"${schema}"."${tableName}"`
		: `"${tableName}"`;

	const unsquashedIdentity = identity;

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

	return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" ADD${identityStatement};`;

	//AlterTableAlterColumnDroenerated
	const { tableName, columnName, schema } = statement;

	const tableNameWithSchema = schema
		? `"${schema}"."${tableName}"`
		: `"${tableName}"`;

	return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP IDENTITY;`;

	//AlterTableAlterColumnAlterGenerated
	const { identity, oldIdentity, tableName, columnName, schema } = statement;

	const tableNameWithSchema = schema
		? `"${schema}"."${tableName}"`
		: `"${tableName}"`;

	const unsquashedIdentity = identity;
	const unsquashedOldIdentity = oldIdentity;

	const statementsToReturn: string[] = [];

	if (unsquashedOldIdentity.type !== unsquashedIdentity.type) {
		statementsToReturn.push(
			`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET GENERATED ${
				unsquashedIdentity.type === 'always' ? 'ALWAYS' : 'BY DEFAULT'
			};`,
		);
	}

	if (unsquashedOldIdentity.minValue !== unsquashedIdentity.minValue) {
		statementsToReturn.push(
			`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET MINVALUE ${unsquashedIdentity.minValue};`,
		);
	}

	if (unsquashedOldIdentity.maxValue !== unsquashedIdentity.maxValue) {
		statementsToReturn.push(
			`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET MAXVALUE ${unsquashedIdentity.maxValue};`,
		);
	}

	if (unsquashedOldIdentity.increment !== unsquashedIdentity.increment) {
		statementsToReturn.push(
			`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET INCREMENT BY ${unsquashedIdentity.increment};`,
		);
	}

	if (unsquashedOldIdentity.startWith !== unsquashedIdentity.startWith) {
		statementsToReturn.push(
			`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET START WITH ${unsquashedIdentity.startWith};`,
		);
	}

	if (unsquashedOldIdentity.cache !== unsquashedIdentity.cache) {
		statementsToReturn.push(
			`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET CACHE ${unsquashedIdentity.cache};`,
		);
	}

	if (unsquashedOldIdentity.cycle !== unsquashedIdentity.cycle) {
		statementsToReturn.push(
			`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET ${
				unsquashedIdentity.cycle ? `CYCLE` : 'NO CYCLE'
			};`,
		);
	}

	return statementsToReturn;
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

const renameUniqueConvertor = convertor('rename_unique', (st) => {
	const { from, to } = st;
	const tableNameWithSchema = to.schema
		? `"${to.schema}"."${to.table}"`
		: `"${to.table}"`;
	return `ALTER TABLE ${tableNameWithSchema} RENAME CONSTRAINT "${from.name}" TO "${to.name}";`;
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

	const enumNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;
	const valuesStatement = values.map((it) => `'${escapeSingleQuotes(it)}'`).join(', ');

	return `ALTER TYPE ${enumNameWithSchema} ADD VALUE IF NOT EXISTS ${valuesStatement};`;

	// AlterTypeAddValueConvertor
	const { name, schema, value, before } = st;
	const enumNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;
	return `ALTER TYPE ${enumNameWithSchema} ADD VALUE '${value}'${before.length ? ` BEFORE '${before}'` : ''};`;
});

const dropEnumValueConvertor = convertor('drop_enum_value', (st) => {
	const { columnsWithEnum, name, newValues, schema } = st;
	const statements: string[] = [];
	for (const withEnum of columnsWithEnum) {
		statements.push(
			`ALTER TABLE "${withEnum.schema}"."${withEnum.table}" ALTER COLUMN "${withEnum.column}" SET DATA TYPE text;`,
		);
	}

	statements.push(new DropTypeEnumConvertor().convert({ name: name, schema, type: 'drop_type_enum' }));
	statements.push(new CreateTypeEnumConvertor().convert({
		name: name,
		schema: schema,
		values: newValues,
		type: 'create_type_enum',
	}));

	for (const withEnum of columnsWithEnum) {
		statements.push(
			`ALTER TABLE "${withEnum.schema}"."${withEnum.table}" ALTER COLUMN "${withEnum.column}" SET DATA TYPE "${schema}"."${name}" USING "${withEnum.column}"::"${schema}"."${name}";`,
		);
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

const renameColumnConvertor = convertor('rename_column', (st) => {
	const { table, schema } = st.from;
	const tableNameWithSchema = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} RENAME COLUMN "${st.from.name}" TO "${st.to.name}";`;
});

const dropColumnConvertor = convertor('drop_column', (st) => {
	const { schema, table, name } = st.column;

	const tableNameWithSchema = schema
		? `"${schema}"."${table}"`
		: `"${table}"`;

	return `ALTER TABLE ${tableNameWithSchema} DROP COLUMN "${name}";`;
});

const addColumnConvertor = convertor('add_column', (st) => {
	const { tableName, column, schema } = statement;
	const { name, type, notNull, generated, primaryKey, identity } = column;

	const primaryKeyStatement = primaryKey ? ' PRIMARY KEY' : '';

	const tableNameWithSchema = schema
		? `"${schema}"."${tableName}"`
		: `"${tableName}"`;

	const defaultStatement = `${column.default !== undefined ? ` DEFAULT ${column.default}` : ''}`;

	const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
		? `"${column.typeSchema}".`
		: '';

	const fixedType = parseType(schemaPrefix, column.type);

	const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;

	const unsquashedIdentity = identity;

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

	const generatedStatement = generated ? ` GENERATED ALWAYS AS (${generated?.as}) STORED` : '';

	return `ALTER TABLE ${tableNameWithSchema} ADD COLUMN "${name}" ${fixedType}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${identityStatement};`;
});

const alterColumnConvertor = convertor('alter_column', (st) => {
	const { tableName, columnName, newDataType, schema } = statement;

	const tableNameWithSchema = schema
		? `"${schema}"."${tableName}"`
		: `"${tableName}"`;

	return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DATA TYPE ${newDataType};`;

	// AlterTableAlterColumnSetDefaultConvertor
	return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DEFAULT ${statement.newDefaultValue};`;

	// AlterTableAlterColumnDropDefaultConvertor
	return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP DEFAULT;`;

	// AlterTableAlterColumnDropGeneratedConvertor
	return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP EXPRESSION;`;

	// AlterTableAlterColumnSetExpressionConvertor
	const {
		columnNotNull: notNull,
		columnDefault,
		columnPk,
		columnGenerated,
	} = statement;

	const addColumnStatement = addColumnConvertor.convert({ column });
	return [
		`ALTER TABLE ${tableNameWithSchema} drop column "${columnName}";`,
		addColumnStatement,
	];

	// AlterTableAlterColumnAlterGeneratedConvertor
	const addColumnStatement = addColumnConvertor.convert({ column });
	return [
		`ALTER TABLE ${tableNameWithSchema} drop column "${columnName}";`,
		addColumnStatement,
	];
});

class AlterTableCreateCompositePrimaryKeyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_composite_pk';
	}

	convert(statement: JsonCreateCompositePK) {
		const { name, columns } = statement.primaryKey;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${statement.primaryKey}" PRIMARY KEY("${
			columns.join('","')
		}");`;
	}
}
class AlterTableDeleteCompositePrimaryKeyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'delete_composite_pk';
	}

	convert(statement: JsonDropCompositePK) {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${statement.constraintName}";`;
	}
}

class AlterTableAlterCompositePrimaryKeyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_composite_pk';
	}

	convert(statement: JsonAlterCompositePK) {
		const { name: oldName } = statement.oldPK;
		const { name: newName, columns: newColumns } = statement.newPK;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${oldName}";\n${BREAKPOINT}ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${newName}" PRIMARY KEY("${
			newColumns.join('","')
		}");`;
	}
}

class AlterTableAlterColumnSetPrimaryKeyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_pk'
		);
	}

	convert(statement: JsonAlterColumnSetPrimaryKeyStatement) {
		const { tableName, columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD PRIMARY KEY ("${columnName}");`;
	}
}

class AlterTableAlterColumnDropPrimaryKeyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_pk'
		);
	}

	convert(statement: JsonAlterColumnDropPrimaryKeyStatement) {
		const { tableName, columnName, schema } = statement;
		return `/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = '${typeof schema === 'undefined' || schema === '' ? 'public' : schema}'
                AND table_name = '${tableName}'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "${tableName}" DROP CONSTRAINT "<constraint_name>";`;
	}
}

class AlterTableAlterColumnSetNotNullConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_notnull'
		);
	}

	convert(statement: JsonAlterColumnSetNotNullStatement) {
		const { tableName, columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET NOT NULL;`;
	}
}

class AlterTableAlterColumnDropNotNullConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_notnull'
		);
	}

	convert(statement: JsonAlterColumnDropNotNullStatement) {
		const { tableName, columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP NOT NULL;`;
	}
}

class CreateForeignKeyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_reference';
	}

	convert(statement: JsonCreateReferenceStatement): string {
		const { name, tableFrom, tableTo, columnsFrom, columnsTo, onDelete, onUpdate, schemaTo } = statement.foreignKey;

		const onDeleteStatement = onDelete ? ` ON DELETE ${onDelete}` : '';
		const onUpdateStatement = onUpdate ? ` ON UPDATE ${onUpdate}` : '';
		const fromColumnsString = columnsFrom.map((it) => `"${it}"`).join(',');
		const toColumnsString = columnsTo.map((it) => `"${it}"`).join(',');

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${tableFrom}"`
			: `"${tableFrom}"`;

		const tableToNameWithSchema = schemaTo
			? `"${schemaTo}"."${tableTo}"`
			: `"${tableTo}"`;

		const alterStatement =
			`ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement}`;

		let sql = 'DO $$ BEGIN\n';
		sql += ' ' + alterStatement + ';\n';
		sql += 'EXCEPTION\n';
		sql += ' WHEN duplicate_object THEN null;\n';
		sql += 'END $$;\n';
		return sql;
	}
}

class AlterForeignKeyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_reference';
	}

	convert(statement: JsonAlterReferenceStatement): string {
		const newFk = statement.foreignKey;
		const oldFk = statement.oldFkey;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${oldFk.tableFrom}"`
			: `"${oldFk.tableFrom}"`;

		let sql = `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${oldFk.name}";\n`;

		const onDeleteStatement = newFk.onDelete
			? ` ON DELETE ${newFk.onDelete}`
			: '';
		const onUpdateStatement = newFk.onUpdate
			? ` ON UPDATE ${newFk.onUpdate}`
			: '';

		const fromColumnsString = newFk.columnsFrom
			.map((it) => `"${it}"`)
			.join(',');
		const toColumnsString = newFk.columnsTo.map((it) => `"${it}"`).join(',');

		const tableFromNameWithSchema = oldFk.schemaTo
			? `"${oldFk.schemaTo}"."${oldFk.tableFrom}"`
			: `"${oldFk.tableFrom}"`;

		const tableToNameWithSchema = newFk.schemaTo
			? `"${newFk.schemaTo}"."${newFk.tableFrom}"`
			: `"${newFk.tableFrom}"`;

		const alterStatement =
			`ALTER TABLE ${tableFromNameWithSchema} ADD CONSTRAINT "${newFk.name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement}`;

		sql += 'DO $$ BEGIN\n';
		sql += ' ' + alterStatement + ';\n';
		sql += 'EXCEPTION\n';
		sql += ' WHEN duplicate_object THEN null;\n';
		sql += 'END $$;\n';
		return sql;
	}
}

class DeleteForeignKeyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'delete_reference';
	}

	convert(statement: JsonDeleteReferenceStatement): string {
		const tableFrom = statement.tableName; // delete fk from renamed table case
		const { name } = statement.foreignKey;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${tableFrom}"`
			: `"${tableFrom}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${name}";\n`;
	}
}

class CreateIndexConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_index';
	}

	convert(statement: JsonCreateIndexStatement): string {
		const {
			name,
			columns,
			isUnique,
			concurrently,
			with: withMap,
			method,
			where,
		} = statement.index;
		// // since postgresql 9.5
		const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';
		const value = columns
			.map(
				(it) =>
					`${it.isExpression ? it.expression : `"${it.expression}"`}${
						it.opclass ? ` ${it.opclass}` : it.asc ? '' : ' DESC'
					}${
						(it.asc && it.nulls && it.nulls === 'last') || it.opclass
							? ''
							: ` NULLS ${it.nulls!.toUpperCase()}`
					}`,
			)
			.join(',');

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		function reverseLogic(mappedWith: Record<string, string>): string {
			let reversedString = '';
			for (const key in mappedWith) {
				// TODO: wtf??
				if (mappedWith.hasOwnProperty(key)) {
					reversedString += `${key}=${mappedWith[key]},`;
				}
			}
			reversedString = reversedString.slice(0, -1);
			return reversedString;
		}

		return `CREATE ${indexPart}${
			concurrently ? ' CONCURRENTLY' : ''
		} IF NOT EXISTS "${name}" ON ${tableNameWithSchema} USING ${method} (${value})${
			Object.keys(withMap!).length !== 0
				? ` WITH (${reverseLogic(withMap!)})`
				: ''
		}${where ? ` WHERE ${where}` : ''};`;
	}
}

class DropIndexConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_index';
	}

	convert(statement: JsonDropIndexStatement): string {
		const { name } = statement.index;
		return `DROP INDEX IF EXISTS "${name}";`;
	}
}

class CreateSchemaConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_schema';
	}

	convert(statement: JsonCreateSchema) {
		const { name } = statement;
		return `CREATE SCHEMA "${name}";\n`;
	}
}

class RenameSchemaConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_schema';
	}

	convert(statement: JsonRenameSchema) {
		const { from, to } = statement;
		return `ALTER SCHEMA "${from}" RENAME TO "${to}";\n`;
	}
}

class DropSchemaConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_schema';
	}

	convert(statement: JsonCreateSchema) {
		const { name } = statement;
		return `DROP SCHEMA "${name}";\n`;
	}
}

class AlterTableSetSchemaConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_set_schema'
		);
	}

	convert(statement: JsonMoveTable) {
		const { tableName, schemaFrom, schemaTo } = statement;

		return `ALTER TABLE "${schemaFrom}"."${tableName}" SET SCHEMA "${schemaTo}";\n`;
	}
}

class AlterTableSetNewSchemaConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_set_new_schema'
		);
	}

	convert(statement: JsonAlterTableSetNewSchema) {
		const { tableName, to, from } = statement;

		const tableNameWithSchema = from
			? `"${from}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} SET SCHEMA "${to}";\n`;
	}
}

class AlterTableRemoveFromSchemaConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_remove_from_schema'
		);
	}

	convert(statement: JsonAlterTableRemoveFromSchema) {
		const { tableName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} SET SCHEMA public;\n`;
	}
}

const convertors: Convertor[] = [];
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

			const sqlStatements = convertor.convert(statement);
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
