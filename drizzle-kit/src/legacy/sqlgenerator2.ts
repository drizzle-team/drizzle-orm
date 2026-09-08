import type {
	JsonAddColumnStatement,
	JsonAddValueToEnumStatement,
	JsonAlterColumnAlterGeneratedStatement,
	JsonAlterColumnAlterIdentityStatement,
	JsonAlterColumnDropAutoincrementStatement,
	JsonAlterColumnDropDefaultStatement,
	JsonAlterColumnDropGeneratedStatement,
	JsonAlterColumnDropIdentityStatement,
	JsonAlterColumnDropNotNullStatement,
	JsonAlterColumnDropOnUpdateStatement,
	JsonAlterColumnDropPrimaryKeyStatement,
	JsonAlterColumnPgTypeStatement,
	JsonAlterColumnSetAutoincrementStatement,
	JsonAlterColumnSetDefaultStatement,
	JsonAlterColumnSetGeneratedStatement,
	JsonAlterColumnSetIdentityStatement,
	JsonAlterColumnSetNotNullStatement,
	JsonAlterColumnSetOnUpdateStatement,
	JsonAlterColumnSetPrimaryKeyStatement,
	JsonAlterColumnTypeStatement,
	JsonAlterCompositePK,
	JsonAlterIndPolicyStatement,
	JsonAlterPolicyStatement,
	JsonAlterReferenceStatement,
	JsonAlterRoleStatement,
	JsonAlterSequenceStatement,
	JsonAlterTableRemoveFromSchema,
	JsonAlterTableSetNewSchema,
	JsonAlterTableSetSchema,
	JsonAlterViewAddWithOptionStatement,
	JsonAlterViewAlterSchemaStatement,
	JsonAlterViewAlterTablespaceStatement,
	JsonAlterViewAlterUsingStatement,
	JsonAlterViewDropWithOptionStatement,
	JsonCreateCheckConstraint,
	JsonCreateCompositePK,
	JsonCreateEnumStatement,
	JsonCreateIndexStatement,
	JsonCreateIndPolicyStatement,
	JsonCreateMySqlViewStatement,
	JsonCreatePgViewStatement,
	JsonCreatePolicyStatement,
	JsonCreateReferenceStatement,
	JsonCreateRoleStatement,
	JsonCreateSchema,
	JsonCreateSequenceStatement,
	JsonCreateTableStatement,
	JsonCreateUniqueConstraint,
	JsonDeleteCheckConstraint,
	JsonDeleteCompositePK,
	JsonDeleteReferenceStatement,
	JsonDeleteUniqueConstraint,
	JsonDisableRLSStatement,
	JsonDropColumnStatement,
	JsonDropEnumStatement,
	JsonDropIndexStatement,
	JsonDropIndPolicyStatement,
	JsonDropPolicyStatement,
	JsonDropRoleStatement,
	JsonDropSequenceStatement,
	JsonDropTableStatement,
	JsonDropValueFromEnumStatement,
	JsonDropViewStatement,
	JsonEnableRLSStatement,
	JsonIndRenamePolicyStatement,
	JsonMoveEnumStatement,
	JsonMoveSequenceStatement,
	JsonPgCreateIndexStatement,
	JsonRenameColumnStatement,
	JsonRenameEnumStatement,
	JsonRenamePolicyStatement,
	JsonRenameRoleStatement,
	JsonRenameSchema,
	JsonRenameSequenceStatement,
	JsonRenameTableStatement,
	JsonRenameViewStatement,
	JsonStatement,
} from './jsonStatements';
import { MySqlSquasher } from './mysql-v5/mysqlSchema';
import { PgSquasher } from './postgres-v7/pgSchema';
import type { Dialect } from './schemaValidator';
import { BREAKPOINT } from './sqlgenerator';

import { escapeSingleQuotes } from './utils';

const parseType = (schemaPrefix: string, type: string) => {
	const pgNativeTypes = [
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
		'halfvec',
		'sparsevec',
		'bit',
	];
	const arrayDefinitionRegex = /\[\d*(?:\[\d*\])*\]/g;
	const arrayDefinition = (type.match(arrayDefinitionRegex) ?? []).join('');
	const withoutArrayDefinition = type.replace(arrayDefinitionRegex, '');
	return pgNativeTypes.some((it) => type.startsWith(it))
		? `${withoutArrayDefinition}${arrayDefinition}`
		: `${schemaPrefix}"${withoutArrayDefinition}"${arrayDefinition}`;
};

abstract class Convertor {
	abstract can(
		statement: JsonStatement,
		dialect: Dialect,
	): boolean;
	abstract convert(
		statement: JsonStatement,
		action?: 'push',
	): string | string[];
}

class PgCreateRoleConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_role' && dialect === 'postgresql';
	}
	override convert(statement: JsonCreateRoleStatement): string | string[] {
		return `CREATE ROLE "${statement.name}"${
			statement.values.createDb || statement.values.createRole || !statement.values.inherit
				? ` WITH${statement.values.createDb ? ' CREATEDB' : ''}${statement.values.createRole ? ' CREATEROLE' : ''}${
					statement.values.inherit ? '' : ' NOINHERIT'
				}`
				: ''
		};`;
	}
}

class PgDropRoleConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_role' && dialect === 'postgresql';
	}
	override convert(statement: JsonDropRoleStatement): string | string[] {
		return `DROP ROLE "${statement.name}";`;
	}
}

class PgRenameRoleConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_role' && dialect === 'postgresql';
	}
	override convert(statement: JsonRenameRoleStatement): string | string[] {
		return `ALTER ROLE "${statement.nameFrom}" RENAME TO "${statement.nameTo}";`;
	}
}

class PgAlterRoleConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_role' && dialect === 'postgresql';
	}
	override convert(statement: JsonAlterRoleStatement): string | string[] {
		return `ALTER ROLE "${statement.name}"${` WITH${statement.values.createDb ? ' CREATEDB' : ' NOCREATEDB'}${
			statement.values.createRole ? ' CREATEROLE' : ' NOCREATEROLE'
		}${statement.values.inherit ? ' INHERIT' : ' NOINHERIT'}`};`;
	}
}

/////

class PgCreatePolicyConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_policy' && dialect === 'postgresql';
	}
	override convert(statement: JsonCreatePolicyStatement): string | string[] {
		const policy = statement.data;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		const usingPart = policy.using ? ` USING (${policy.using})` : '';

		const withCheckPart = policy.withCheck ? ` WITH CHECK (${policy.withCheck})` : '';

		const policyToPart = policy.to?.map((v) =>
			['current_user', 'current_role', 'session_user', 'public'].includes(v) ? v : `"${v}"`
		).join(', ');

		return `CREATE POLICY "${policy.name}" ON ${tableNameWithSchema} AS ${policy.as?.toUpperCase()} FOR ${policy.for?.toUpperCase()} TO ${policyToPart}${usingPart}${withCheckPart};`;
	}
}

class PgDropPolicyConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_policy' && dialect === 'postgresql';
	}
	override convert(statement: JsonDropPolicyStatement): string | string[] {
		const policy = statement.data;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `DROP POLICY "${policy.name}" ON ${tableNameWithSchema} CASCADE;`;
	}
}

class PgRenamePolicyConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_policy' && dialect === 'postgresql';
	}
	override convert(statement: JsonRenamePolicyStatement): string | string[] {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER POLICY "${statement.oldName}" ON ${tableNameWithSchema} RENAME TO "${statement.newName}";`;
	}
}

class PgAlterPolicyConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_policy' && dialect === 'postgresql';
	}
	override convert(statement: JsonAlterPolicyStatement, _dialect: any, action?: string): string | string[] {
		const newPolicy = action === 'push'
			? PgSquasher.unsquashPolicyPush(statement.newData)
			: PgSquasher.unsquashPolicy(statement.newData);
		const oldPolicy = action === 'push'
			? PgSquasher.unsquashPolicyPush(statement.oldData)
			: PgSquasher.unsquashPolicy(statement.oldData);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		const usingPart = newPolicy.using
			? ` USING (${newPolicy.using})`
			: oldPolicy.using
			? ` USING (${oldPolicy.using})`
			: '';

		const withCheckPart = newPolicy.withCheck
			? ` WITH CHECK (${newPolicy.withCheck})`
			: oldPolicy.withCheck
			? ` WITH CHECK  (${oldPolicy.withCheck})`
			: '';

		return `ALTER POLICY "${oldPolicy.name}" ON ${tableNameWithSchema} TO ${newPolicy.to}${usingPart}${withCheckPart};`;
	}
}

////

class PgCreateIndPolicyConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_ind_policy' && dialect === 'postgresql';
	}
	override convert(statement: JsonCreateIndPolicyStatement): string | string[] {
		const policy = statement.data;

		const usingPart = policy.using ? ` USING (${policy.using})` : '';

		const withCheckPart = policy.withCheck ? ` WITH CHECK (${policy.withCheck})` : '';

		const policyToPart = policy.to?.map((v) =>
			['current_user', 'current_role', 'session_user', 'public'].includes(v) ? v : `"${v}"`
		).join(', ');

		return `CREATE POLICY "${policy.name}" ON ${policy.on} AS ${policy.as?.toUpperCase()} FOR ${policy.for?.toUpperCase()} TO ${policyToPart}${usingPart}${withCheckPart};`;
	}
}

class PgDropIndPolicyConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_ind_policy' && dialect === 'postgresql';
	}
	override convert(statement: JsonDropIndPolicyStatement): string | string[] {
		const policy = statement.data;

		return `DROP POLICY "${policy.name}" ON ${policy.on} CASCADE;`;
	}
}

class PgRenameIndPolicyConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_ind_policy' && dialect === 'postgresql';
	}
	override convert(statement: JsonIndRenamePolicyStatement): string | string[] {
		return `ALTER POLICY "${statement.oldName}" ON ${statement.tableKey} RENAME TO "${statement.newName}";`;
	}
}

class PgAlterIndPolicyConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_ind_policy' && dialect === 'postgresql';
	}
	override convert(statement: JsonAlterIndPolicyStatement): string | string[] {
		const newPolicy = statement.newData;
		const oldPolicy = statement.oldData;

		const usingPart = newPolicy.using
			? ` USING (${newPolicy.using})`
			: oldPolicy.using
			? ` USING (${oldPolicy.using})`
			: '';

		const withCheckPart = newPolicy.withCheck
			? ` WITH CHECK (${newPolicy.withCheck})`
			: oldPolicy.withCheck
			? ` WITH CHECK  (${oldPolicy.withCheck})`
			: '';

		return `ALTER POLICY "${oldPolicy.name}" ON ${oldPolicy.on} TO ${newPolicy.to}${usingPart}${withCheckPart};`;
	}
}

////

class PgEnableRlsConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'enable_rls' && dialect === 'postgresql';
	}
	override convert(statement: JsonEnableRLSStatement): string {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ENABLE ROW LEVEL SECURITY;`;
	}
}

class PgDisableRlsConvertor extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'disable_rls' && dialect === 'postgresql';
	}
	override convert(statement: JsonDisableRLSStatement): string {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DISABLE ROW LEVEL SECURITY;`;
	}
}

class PgCreateTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_table' && dialect === 'postgresql';
	}

	convert(st: JsonCreateTableStatement) {
		const { tableName, schema, columns, compositePKs, uniqueConstraints, checkConstraints, policies, isRLSEnabled } =
			st;

		let statement = '';
		const name = schema ? `"${schema}"."${tableName}"` : `"${tableName}"`;

		statement += `CREATE TABLE ${name} (\n`;
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i];

			const primaryKeyStatement = column.primaryKey ? ' PRIMARY KEY' : '';
			const notNullStatement = column.notNull && !column.identity ? ' NOT NULL' : '';
			const defaultStatement = column.default !== undefined ? ` DEFAULT ${column.default}` : '';

			const uniqueConstraint = column.isUnique
				? ` CONSTRAINT "${column.uniqueName}" UNIQUE${column.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''}`
				: '';

			const schemaPrefix = column.typeSchema && column.typeSchema !== 'public'
				? `"${column.typeSchema}".`
				: '';

			const type = parseType(schemaPrefix, column.type);
			const generated = column.generated;

			const generatedStatement = generated ? ` GENERATED ALWAYS AS (${generated?.as}) STORED` : '';

			const unsquashedIdentity = column.identity
				? PgSquasher.unsquashIdentity(column.identity)
				: undefined;

			const identityWithSchema = schema
				? `"${schema}"."${unsquashedIdentity?.name}"`
				: `"${unsquashedIdentity?.name}"`;

			const identity = unsquashedIdentity
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

			statement += '\t'
				+ `"${column.name}" ${type}${primaryKeyStatement}${defaultStatement}${generatedStatement}${notNullStatement}${uniqueConstraint}${identity}`;
			statement += i === columns.length - 1 ? '' : ',\n';
		}

		if (typeof compositePKs !== 'undefined' && compositePKs.length > 0) {
			statement += ',\n';
			const compositePK = PgSquasher.unsquashPK(compositePKs[0]);
			statement += `\tCONSTRAINT "${st.compositePkName}" PRIMARY KEY("${compositePK.columns.join(`","`)}")`;
			// statement += `\n`;
		}

		if (
			typeof uniqueConstraints !== 'undefined'
			&& uniqueConstraints.length > 0
		) {
			for (const uniqueConstraint of uniqueConstraints) {
				statement += ',\n';
				const unsquashedUnique = PgSquasher.unsquashUnique(uniqueConstraint);
				statement += `\tCONSTRAINT "${unsquashedUnique.name}" UNIQUE${
					unsquashedUnique.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''
				}("${unsquashedUnique.columns.join(`","`)}")`;
				// statement += `\n`;
			}
		}

		if (typeof checkConstraints !== 'undefined' && checkConstraints.length > 0) {
			for (const checkConstraint of checkConstraints) {
				statement += ',\n';
				const unsquashedCheck = PgSquasher.unsquashCheck(checkConstraint);
				statement += `\tCONSTRAINT "${unsquashedCheck.name}" CHECK (${unsquashedCheck.value})`;
			}
		}

		statement += `\n);`;
		statement += `\n`;

		const enableRls = new PgEnableRlsConvertor().convert({
			type: 'enable_rls',
			tableName,
			schema,
		});

		return [statement, ...(policies && policies.length > 0 || isRLSEnabled ? [enableRls] : [])];
	}
}

class MySqlCreateTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_table' && dialect === 'mysql';
	}

	convert(st: JsonCreateTableStatement) {
		const {
			tableName,
			columns,
			checkConstraints,
			compositePKs,
			uniqueConstraints,
		} = st;

		let statement = '';
		statement += `CREATE TABLE \`${tableName}\` (\n`;
		for (let i = 0; i < columns.length; i++) {
			const column = columns[i];

			const primaryKeyStatement = column.primaryKey ? ' PRIMARY KEY' : '';
			const notNullStatement = column.notNull ? ' NOT NULL' : '';
			const defaultStatement = column.default !== undefined ? ` DEFAULT ${column.default}` : '';

			const onUpdateStatement = column.onUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';

			const autoincrementStatement = column.autoincrement
				? ' AUTO_INCREMENT'
				: '';

			const generatedStatement = column.generated
				? ` GENERATED ALWAYS AS (${column.generated?.as}) ${column.generated?.type.toUpperCase()}`
				: '';

			statement += '\t'
				+ `\`${column.name}\` ${column.type}${autoincrementStatement}${primaryKeyStatement}${generatedStatement}${notNullStatement}${defaultStatement}${onUpdateStatement}`;
			statement += i === columns.length - 1 ? '' : ',\n';
		}

		if (typeof compositePKs !== 'undefined' && compositePKs.length > 0) {
			statement += ',\n';
			const compositePK = MySqlSquasher.unsquashPK(compositePKs[0]);
			statement += `\tCONSTRAINT \`${st.compositePkName}\` PRIMARY KEY(\`${compositePK.columns.join(`\`,\``)}\`)`;
		}

		if (
			typeof uniqueConstraints !== 'undefined'
			&& uniqueConstraints.length > 0
		) {
			for (const uniqueConstraint of uniqueConstraints) {
				statement += ',\n';
				const unsquashedUnique = MySqlSquasher.unsquashUnique(uniqueConstraint);

				const uniqueString = unsquashedUnique.columns.join(',');

				statement += `\tCONSTRAINT \`${unsquashedUnique.name}\` UNIQUE(${uniqueString})`;
			}
		}

		if (typeof checkConstraints !== 'undefined' && checkConstraints.length > 0) {
			for (const checkConstraint of checkConstraints) {
				statement += ',\n';
				const unsquashedCheck = MySqlSquasher.unsquashCheck(checkConstraint);

				statement += `\tCONSTRAINT \`${unsquashedCheck.name}\` CHECK(${unsquashedCheck.value})`;
			}
		}

		statement += `\n);`;
		statement += `\n`;
		return statement;
	}
}

class PgCreateViewConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_view' && dialect === 'postgresql';
	}

	convert(st: JsonCreatePgViewStatement) {
		const { definition, name: viewName, schema, with: withOption, materialized, withNoData, tablespace, using } = st;

		const name = schema ? `"${schema}"."${viewName}"` : `"${viewName}"`;

		let statement = materialized ? `CREATE MATERIALIZED VIEW ${name}` : `CREATE VIEW ${name}`;

		if (using) statement += ` USING "${using}"`;

		const options: string[] = [];
		if (withOption) {
			statement += ` WITH (`;

			Object.entries(withOption).forEach(([key, value]) => {
				if (typeof value === 'undefined') return;

				options.push(`${key.snake_case()} = ${value}`);
			});

			statement += options.join(', ');

			statement += `)`;
		}

		if (tablespace) statement += ` TABLESPACE ${tablespace}`;

		statement += ` AS (${definition})`;

		if (withNoData) statement += ` WITH NO DATA`;

		statement += `;`;

		return statement;
	}
}

class MySqlCreateViewConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'mysql_create_view' && dialect === 'mysql';
	}

	convert(st: JsonCreateMySqlViewStatement) {
		const { definition, name, algorithm, sqlSecurity, withCheckOption, replace } = st;

		let statement = `CREATE `;
		statement += replace ? `OR REPLACE ` : '';
		statement += algorithm ? `ALGORITHM = ${algorithm}\n` : '';
		statement += sqlSecurity ? `SQL SECURITY ${sqlSecurity}\n` : '';
		statement += `VIEW \`${name}\` AS (${definition})`;
		statement += withCheckOption ? `\nWITH ${withCheckOption} CHECK OPTION` : '';

		statement += ';';

		return statement;
	}
}

class PgDropViewConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_view' && dialect === 'postgresql';
	}

	convert(st: JsonDropViewStatement) {
		const { name: viewName, schema, materialized } = st;

		const name = schema ? `"${schema}"."${viewName}"` : `"${viewName}"`;

		return `DROP${materialized ? ' MATERIALIZED' : ''} VIEW ${name};`;
	}
}

class MySqlDropViewConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_view' && dialect === 'mysql';
	}

	convert(st: JsonDropViewStatement) {
		const { name } = st;

		return `DROP VIEW \`${name}\`;`;
	}
}

class SqliteDropViewConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_view' && (dialect === 'sqlite' || dialect === 'turso');
	}

	convert(st: JsonDropViewStatement) {
		const { name } = st;

		return `DROP VIEW \`${name}\`;`;
	}
}

class PgRenameViewConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_view' && dialect === 'postgresql';
	}

	convert(st: JsonRenameViewStatement) {
		const { nameFrom: from, nameTo: to, schema, materialized } = st;

		const nameFrom = `"${schema}"."${from}"`;

		return `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW ${nameFrom} RENAME TO "${to}";`;
	}
}

class MySqlRenameViewConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_view' && dialect === 'mysql';
	}

	convert(st: JsonRenameViewStatement) {
		const { nameFrom: from, nameTo: to } = st;

		return `RENAME TABLE \`${from}\` TO \`${to}\`;`;
	}
}

class PgAlterViewSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_view_alter_schema' && dialect === 'postgresql';
	}

	convert(st: JsonAlterViewAlterSchemaStatement) {
		const { fromSchema, toSchema, name, materialized } = st;

		const statement = `ALTER${
			materialized ? ' MATERIALIZED' : ''
		} VIEW "${fromSchema}"."${name}" SET SCHEMA "${toSchema}";`;

		return statement;
	}
}

class PgAlterViewAddWithOptionConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_view_add_with_option' && dialect === 'postgresql';
	}

	convert(st: JsonAlterViewAddWithOptionStatement) {
		const { schema, with: withOption, name, materialized } = st;

		let statement = `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW "${schema}"."${name}" SET (`;

		const options: string[] = [];

		Object.entries(withOption).forEach(([key, value]) => {
			options.push(`${key.snake_case()} = ${value}`);
		});

		statement += options.join(', ');

		statement += `);`;

		return statement;
	}
}

class PgAlterViewDropWithOptionConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_view_drop_with_option' && dialect === 'postgresql';
	}

	convert(st: JsonAlterViewDropWithOptionStatement) {
		const { schema, name, materialized, with: withOptions } = st;

		let statement = `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW "${schema}"."${name}" RESET (`;

		const options: string[] = [];

		Object.entries(withOptions).forEach(([key]) => {
			options.push(`${key.snake_case()}`);
		});

		statement += options.join(', ');

		statement += ');';

		return statement;
	}
}

class PgAlterViewAlterTablespaceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_view_alter_tablespace' && dialect === 'postgresql';
	}

	convert(st: JsonAlterViewAlterTablespaceStatement) {
		const { schema, name, toTablespace } = st;

		const statement = `ALTER MATERIALIZED VIEW "${schema}"."${name}" SET TABLESPACE ${toTablespace};`;

		return statement;
	}
}

class PgAlterViewAlterUsingConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_view_alter_using' && dialect === 'postgresql';
	}

	convert(st: JsonAlterViewAlterUsingStatement) {
		const { schema, name, toUsing } = st;

		const statement = `ALTER MATERIALIZED VIEW "${schema}"."${name}" SET ACCESS METHOD "${toUsing}";`;

		return statement;
	}
}

class PgAlterTableAlterColumnSetGenerated extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_identity'
			&& dialect === 'postgresql'
		);
	}
	override convert(
		statement: JsonAlterColumnSetIdentityStatement,
	): string | string[] {
		const { identity, tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const unsquashedIdentity = PgSquasher.unsquashIdentity(identity);

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
	}
}

class PgAlterTableAlterColumnDropGenerated extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_identity'
			&& dialect === 'postgresql'
		);
	}
	override convert(
		statement: JsonAlterColumnDropIdentityStatement,
	): string | string[] {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP IDENTITY;`;
	}
}

class PgAlterTableAlterColumnAlterGenerated extends Convertor {
	override can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_change_identity'
			&& dialect === 'postgresql'
		);
	}
	override convert(
		statement: JsonAlterColumnAlterIdentityStatement,
	): string | string[] {
		const { identity, oldIdentity, tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const unsquashedIdentity = PgSquasher.unsquashIdentity(identity);
		const unsquashedOldIdentity = PgSquasher.unsquashIdentity(oldIdentity);

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
	}
}

class PgAlterTableAddUniqueConstraintConvertor extends Convertor {
	can(statement: JsonCreateUniqueConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'create_unique_constraint' && dialect === 'postgresql'
		);
	}
	convert(statement: JsonCreateUniqueConstraint): string {
		const unsquashed = PgSquasher.unsquashUnique(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${unsquashed.name}" UNIQUE${
			unsquashed.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''
		}("${unsquashed.columns.join('","')}");`;
	}
}

class PgAlterTableDropUniqueConstraintConvertor extends Convertor {
	can(statement: JsonDeleteUniqueConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'delete_unique_constraint' && dialect === 'postgresql'
		);
	}
	convert(statement: JsonDeleteUniqueConstraint): string {
		const unsquashed = PgSquasher.unsquashUnique(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${unsquashed.name}";`;
	}
}

class PgAlterTableAddCheckConstraintConvertor extends Convertor {
	can(statement: JsonCreateCheckConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'create_check_constraint' && dialect === 'postgresql'
		);
	}
	convert(statement: JsonCreateCheckConstraint): string {
		const unsquashed = PgSquasher.unsquashCheck(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${unsquashed.name}" CHECK (${unsquashed.value});`;
	}
}

class PgAlterTableDeleteCheckConstraintConvertor extends Convertor {
	can(statement: JsonDeleteCheckConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'delete_check_constraint' && dialect === 'postgresql'
		);
	}
	convert(statement: JsonDeleteCheckConstraint): string {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${statement.constraintName}";`;
	}
}

class MySQLAlterTableAddUniqueConstraintConvertor extends Convertor {
	can(statement: JsonCreateUniqueConstraint, dialect: Dialect): boolean {
		return statement.type === 'create_unique_constraint' && dialect === 'mysql';
	}
	convert(statement: JsonCreateUniqueConstraint): string {
		const unsquashed = MySqlSquasher.unsquashUnique(statement.data);

		return `ALTER TABLE \`${statement.tableName}\` ADD CONSTRAINT \`${unsquashed.name}\` UNIQUE(\`${
			unsquashed.columns.join('`,`')
		}\`);`;
	}
}

class MySQLAlterTableDropUniqueConstraintConvertor extends Convertor {
	can(statement: JsonDeleteUniqueConstraint, dialect: Dialect): boolean {
		return statement.type === 'delete_unique_constraint' && dialect === 'mysql';
	}
	convert(statement: JsonDeleteUniqueConstraint): string {
		const unsquashed = MySqlSquasher.unsquashUnique(statement.data);

		return `ALTER TABLE \`${statement.tableName}\` DROP INDEX \`${unsquashed.name}\`;`;
	}
}

class MySqlAlterTableAddCheckConstraintConvertor extends Convertor {
	can(statement: JsonCreateCheckConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'create_check_constraint' && dialect === 'mysql'
		);
	}
	convert(statement: JsonCreateCheckConstraint): string {
		const unsquashed = MySqlSquasher.unsquashCheck(statement.data);
		const { tableName } = statement;

		return `ALTER TABLE \`${tableName}\` ADD CONSTRAINT \`${unsquashed.name}\` CHECK (${unsquashed.value});`;
	}
}

class MySqlAlterTableDeleteCheckConstraintConvertor extends Convertor {
	can(statement: JsonDeleteCheckConstraint, dialect: Dialect): boolean {
		return (
			statement.type === 'delete_check_constraint' && dialect === 'mysql'
		);
	}
	convert(statement: JsonDeleteCheckConstraint): string {
		const { tableName } = statement;

		return `ALTER TABLE \`${tableName}\` DROP CONSTRAINT \`${statement.constraintName}\`;`;
	}
}

class CreatePgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonCreateSequenceStatement) {
		const { name, values, schema } = st;

		const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `CREATE SEQUENCE ${sequenceWithSchema}${values.increment ? ` INCREMENT BY ${values.increment}` : ''}${
			values.minValue ? ` MINVALUE ${values.minValue}` : ''
		}${values.maxValue ? ` MAXVALUE ${values.maxValue}` : ''}${
			values.startWith ? ` START WITH ${values.startWith}` : ''
		}${values.cache ? ` CACHE ${values.cache}` : ''}${values.cycle ? ` CYCLE` : ''};`;
	}
}

class DropPgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonDropSequenceStatement) {
		const { name, schema } = st;

		const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `DROP SEQUENCE ${sequenceWithSchema};`;
	}
}

class RenamePgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonRenameSequenceStatement) {
		const { nameFrom, nameTo, schema } = st;

		const sequenceWithSchemaFrom = schema
			? `"${schema}"."${nameFrom}"`
			: `"${nameFrom}"`;
		// const sequenceWithSchemaTo = schema
		// 	? `"${schema}"."${nameTo}"`
		// 	: `"${nameTo}"`;

		return `ALTER SEQUENCE ${sequenceWithSchemaFrom} RENAME TO "${nameTo}";`;
	}
}

class MovePgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'move_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonMoveSequenceStatement) {
		const { schemaFrom, schemaTo, name } = st;

		const sequenceWithSchema = schemaFrom
			? `"${schemaFrom}"."${name}"`
			: `"${name}"`;

		const seqSchemaTo = schemaTo ? `"${schemaTo}"` : `public`;

		return `ALTER SEQUENCE ${sequenceWithSchema} SET SCHEMA ${seqSchemaTo};`;
	}
}

class AlterPgSequenceConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_sequence' && dialect === 'postgresql';
	}

	convert(st: JsonAlterSequenceStatement) {
		const { name, schema, values } = st;

		const { increment, minValue, maxValue, startWith, cache, cycle } = values;

		const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `ALTER SEQUENCE ${sequenceWithSchema}${increment ? ` INCREMENT BY ${increment}` : ''}${
			minValue ? ` MINVALUE ${minValue}` : ''
		}${maxValue ? ` MAXVALUE ${maxValue}` : ''}${startWith ? ` START WITH ${startWith}` : ''}${
			cache ? ` CACHE ${cache}` : ''
		}${cycle ? ` CYCLE` : ''};`;
	}
}

class CreateTypeEnumConvertor extends Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_type_enum';
	}

	convert(st: JsonCreateEnumStatement) {
		const { name, values, schema } = st;

		const enumNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		let valuesStatement = '(';
		valuesStatement += values.map((it) => `'${escapeSingleQuotes(it)}'`).join(', ');
		valuesStatement += ')';

		// TODO do we need this?
		// let statement = 'DO $$ BEGIN';
		// statement += '\n';
		let statement = `CREATE TYPE ${enumNameWithSchema} AS ENUM${valuesStatement};`;
		// statement += '\n';
		// statement += 'EXCEPTION';
		// statement += '\n';
		// statement += ' WHEN duplicate_object THEN null;';
		// statement += '\n';
		// statement += 'END $$;';
		// statement += '\n';
		return statement;
	}
}

class DropTypeEnumConvertor extends Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_type_enum';
	}

	convert(st: JsonDropEnumStatement) {
		const { name, schema } = st;

		const enumNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		let statement = `DROP TYPE ${enumNameWithSchema};`;

		return statement;
	}
}

class AlterTypeAddValueConvertor extends Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_type_add_value';
	}

	convert(st: JsonAddValueToEnumStatement) {
		const { name, schema, value, before } = st;

		const enumNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `ALTER TYPE ${enumNameWithSchema} ADD VALUE '${value}'${before.length ? ` BEFORE '${before}'` : ''};`;
	}
}

class AlterTypeSetSchemaConvertor extends Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'move_type_enum';
	}

	convert(st: JsonMoveEnumStatement) {
		const { name, schemaFrom, schemaTo } = st;

		const enumNameWithSchema = schemaFrom ? `"${schemaFrom}"."${name}"` : `"${name}"`;

		return `ALTER TYPE ${enumNameWithSchema} SET SCHEMA "${schemaTo}";`;
	}
}

class AlterRenameTypeConvertor extends Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_type_enum';
	}

	convert(st: JsonRenameEnumStatement) {
		const { nameTo, nameFrom, schema } = st;

		const enumNameWithSchema = schema ? `"${schema}"."${nameFrom}"` : `"${nameFrom}"`;

		return `ALTER TYPE ${enumNameWithSchema} RENAME TO "${nameTo}";`;
	}
}

class AlterTypeDropValueConvertor extends Convertor {
	can(statement: JsonDropValueFromEnumStatement): boolean {
		return statement.type === 'alter_type_drop_value';
	}

	convert(st: JsonDropValueFromEnumStatement) {
		const { columnsWithEnum, name, newValues, enumSchema } = st;

		const statements: string[] = [];

		for (const withEnum of columnsWithEnum) {
			const tableNameWithSchema = withEnum.tableSchema
				? `"${withEnum.tableSchema}"."${withEnum.table}"`
				: `"${withEnum.table}"`;

			statements.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${withEnum.column}" SET DATA TYPE text;`,
			);
			if (withEnum.default) {
				statements.push(
					`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${withEnum.column}" SET DEFAULT ${withEnum.default}::text;`,
				);
			}
		}

		statements.push(new DropTypeEnumConvertor().convert({ name: name, schema: enumSchema, type: 'drop_type_enum' }));

		statements.push(new CreateTypeEnumConvertor().convert({
			name: name,
			schema: enumSchema,
			values: newValues,
			type: 'create_type_enum',
		}));

		for (const withEnum of columnsWithEnum) {
			const tableNameWithSchema = withEnum.tableSchema
				? `"${withEnum.tableSchema}"."${withEnum.table}"`
				: `"${withEnum.table}"`;

			const parsedType = parseType(`"${enumSchema}".`, withEnum.columnType);
			if (withEnum.default) {
				statements.push(
					`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${withEnum.column}" SET DEFAULT ${withEnum.default}::${parsedType};`,
				);
			}

			statements.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${withEnum.column}" SET DATA TYPE ${parsedType} USING "${withEnum.column}"::${parsedType};`,
			);
		}

		return statements;
	}
}

class PgDropTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_table' && dialect === 'postgresql';
	}

	convert(statement: JsonDropTableStatement, _d: any, action?: string) {
		const { tableName, schema, policies } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const dropPolicyConvertor = new PgDropPolicyConvertor();
		const droppedPolicies = policies?.map((p) => {
			return dropPolicyConvertor.convert({
				type: 'drop_policy',
				tableName,
				data: action === 'push'
					? PgSquasher.unsquashPolicyPush(p)
					: PgSquasher.unsquashPolicy(p),
				schema,
			}) as string;
		}) ?? [];

		return [
			...droppedPolicies,
			`DROP TABLE ${tableNameWithSchema} CASCADE;`,
		];
	}
}

class MySQLDropTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_table' && dialect === 'mysql';
	}

	convert(statement: JsonDropTableStatement) {
		const { tableName } = statement;
		return `DROP TABLE \`${tableName}\`;`;
	}
}

export class SingleStoreDropTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_table' && dialect === 'singlestore';
	}

	convert(statement: JsonDropTableStatement) {
		const { tableName } = statement;
		return `DROP TABLE \`${tableName}\`;`;
	}
}

export class SQLiteDropTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_table' && (dialect === 'sqlite' || dialect === 'turso');
	}

	convert(statement: JsonDropTableStatement) {
		const { tableName } = statement;
		return `DROP TABLE \`${tableName}\`;`;
	}
}

class PgRenameTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_table' && dialect === 'postgresql';
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo, fromSchema } = statement;
		const from = fromSchema
			? `"${fromSchema}"."${tableNameFrom}"`
			: `"${tableNameFrom}"`;
		const to = `"${tableNameTo}"`;
		return `ALTER TABLE ${from} RENAME TO ${to};`;
	}
}

export class SqliteRenameTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_table' && (dialect === 'sqlite' || dialect === 'turso');
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo } = statement;
		return `ALTER TABLE \`${tableNameFrom}\` RENAME TO \`${tableNameTo}\`;`;
	}
}

class MySqlRenameTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_table' && dialect === 'mysql';
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo } = statement;
		return `RENAME TABLE \`${tableNameFrom}\` TO \`${tableNameTo}\`;`;
	}
}

export class SingleStoreRenameTableConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_table' && dialect === 'singlestore';
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo } = statement;
		return `ALTER TABLE \`${tableNameFrom}\` RENAME TO \`${tableNameTo}\`;`;
	}
}

class PgAlterTableRenameColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_rename_column' && dialect === 'postgresql'
		);
	}

	convert(statement: JsonRenameColumnStatement) {
		const { tableName, oldColumnName, newColumnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} RENAME COLUMN "${oldColumnName}" TO "${newColumnName}";`;
	}
}

class MySqlAlterTableRenameColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_rename_column' && dialect === 'mysql'
		);
	}

	convert(statement: JsonRenameColumnStatement) {
		const { tableName, oldColumnName, newColumnName } = statement;
		return `ALTER TABLE \`${tableName}\` RENAME COLUMN \`${oldColumnName}\` TO \`${newColumnName}\`;`;
	}
}

class SingleStoreAlterTableRenameColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_rename_column' && dialect === 'singlestore'
		);
	}

	convert(statement: JsonRenameColumnStatement) {
		const { tableName, oldColumnName, newColumnName } = statement;
		return `ALTER TABLE \`${tableName}\` CHANGE \`${oldColumnName}\` \`${newColumnName}\`;`;
	}
}

class SQLiteAlterTableRenameColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_rename_column' && (dialect === 'sqlite' || dialect === 'turso')
		);
	}

	convert(statement: JsonRenameColumnStatement) {
		const { tableName, oldColumnName, newColumnName } = statement;
		return `ALTER TABLE \`${tableName}\` RENAME COLUMN "${oldColumnName}" TO "${newColumnName}";`;
	}
}

class PgAlterTableDropColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_drop_column' && dialect === 'postgresql'
		);
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP COLUMN "${columnName}";`;
	}
}

class MySqlAlterTableDropColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_drop_column' && dialect === 'mysql';
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\`;`;
	}
}

class SingleStoreAlterTableDropColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_drop_column' && dialect === 'singlestore';
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\`;`;
	}
}

class SQLiteAlterTableDropColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_drop_column' && (dialect === 'sqlite' || dialect === 'turso');
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName } = statement;
		return `ALTER TABLE \`${tableName}\` DROP COLUMN \`${columnName}\`;`;
	}
}

class PgAlterTableAddColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_add_column' && dialect === 'postgresql'
		);
	}

	convert(statement: JsonAddColumnStatement) {
		const { tableName, column, schema } = statement;
		const { name, notNull, generated, primaryKey, identity } = column;

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

		const unsquashedIdentity = identity
			? PgSquasher.unsquashIdentity(identity)
			: undefined;

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
	}
}

class MySqlAlterTableAddColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_add_column' && dialect === 'mysql';
	}

	convert(statement: JsonAddColumnStatement) {
		const { tableName, column } = statement;
		const {
			name,
			type,
			notNull,
			primaryKey,
			autoincrement,
			onUpdate,
			generated,
		} = column;

		const defaultStatement = `${column.default !== undefined ? ` DEFAULT ${column.default}` : ''}`;
		const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;
		const primaryKeyStatement = `${primaryKey ? ' PRIMARY KEY' : ''}`;
		const autoincrementStatement = `${autoincrement ? ' AUTO_INCREMENT' : ''}`;
		const onUpdateStatement = `${onUpdate ? ' ON UPDATE CURRENT_TIMESTAMP' : ''}`;

		const generatedStatement = generated
			? ` GENERATED ALWAYS AS (${generated?.as}) ${generated?.type.toUpperCase()}`
			: '';

		return `ALTER TABLE \`${tableName}\` ADD \`${name}\` ${type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${generatedStatement}${notNullStatement}${onUpdateStatement};`;
	}
}

class SingleStoreAlterTableAddColumnConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_table_add_column' && dialect === 'singlestore';
	}

	convert(statement: JsonAddColumnStatement) {
		const { tableName, column } = statement;
		const {
			name,
			type,
			notNull,
			primaryKey,
			autoincrement,
			onUpdate,
			generated,
		} = column;

		const defaultStatement = `${column.default !== undefined ? ` DEFAULT ${column.default}` : ''}`;
		const notNullStatement = `${notNull ? ' NOT NULL' : ''}`;
		const primaryKeyStatement = `${primaryKey ? ' PRIMARY KEY' : ''}`;
		const autoincrementStatement = `${autoincrement ? ' AUTO_INCREMENT' : ''}`;
		const onUpdateStatement = `${onUpdate ? ' ON UPDATE CURRENT_TIMESTAMP' : ''}`;

		const generatedStatement = generated
			? ` GENERATED ALWAYS AS (${generated?.as}) ${generated?.type.toUpperCase()}`
			: '';

		return `ALTER TABLE \`${tableName}\` ADD \`${name}\` ${type}${primaryKeyStatement}${autoincrementStatement}${defaultStatement}${notNullStatement}${onUpdateStatement}${generatedStatement};`;
	}
}

class PgAlterTableAlterColumnSetTypeConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'pg_alter_table_alter_column_set_type'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnPgTypeStatement) {
		const { tableName, columnName, newDataType, schema, oldDataType, columnDefault, typeSchema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const statements: string[] = [];

		const type = parseType(`"${typeSchema}".`, newDataType.name);

		if (!oldDataType.isEnum && !newDataType.isEnum) {
			statements.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DATA TYPE ${type};`,
			);
			if (columnDefault) {
				statements.push(
					`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DEFAULT ${columnDefault};`,
				);
			}
		}

		if (oldDataType.isEnum && !newDataType.isEnum) {
			statements.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DATA TYPE ${type};`,
			);
			if (columnDefault) {
				statements.push(
					`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DEFAULT ${columnDefault};`,
				);
			}
		}

		if (!oldDataType.isEnum && newDataType.isEnum) {
			if (columnDefault) {
				statements.push(
					`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DEFAULT ${columnDefault}::${type};`,
				);
			}
			statements.push(
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DATA TYPE ${type} USING "${columnName}"::${type};`,
			);
		}

		if (oldDataType.isEnum && newDataType.isEnum) {
			const alterType =
				`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DATA TYPE ${type} USING "${columnName}"::text::${type};`;

			if (newDataType.name !== oldDataType.name && columnDefault) {
				statements.push(
					`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP DEFAULT;`,
					alterType,
					`ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DEFAULT ${columnDefault};`,
				);
			} else {
				statements.push(alterType);
			}
		}

		return statements;
	}
}

class PgAlterTableAlterColumnSetDefaultConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_default'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnSetDefaultStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DEFAULT ${statement.newDefaultValue};`;
	}
}

class PgAlterTableAlterColumnDropDefaultConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_default'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnDropDefaultStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP DEFAULT;`;
	}
}

class PgAlterTableAlterColumnDropGeneratedConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_generated'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnDropGeneratedStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP EXPRESSION;`;
	}
}

class PgAlterTableAlterColumnSetExpressionConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_generated'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnSetGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
		} = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const addColumnStatement = new PgAlterTableAddColumnConvertor().convert({
			schema,
			tableName,
			column: {
				name: columnName,
				type: statement.newDataType,
				notNull,
				default: columnDefault,
				onUpdate: columnOnUpdate,
				autoincrement: columnAutoIncrement,
				primaryKey: columnPk,
				generated: columnGenerated,
			},
			type: 'alter_table_add_column',
		});

		return [
			`ALTER TABLE ${tableNameWithSchema} drop column "${columnName}";`,
			addColumnStatement,
		];
	}
}

class PgAlterTableAlterColumnAlterrGeneratedConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_alter_generated'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnAlterGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
		} = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const addColumnStatement = new PgAlterTableAddColumnConvertor().convert({
			schema,
			tableName,
			column: {
				name: columnName,
				type: statement.newDataType,
				notNull,
				default: columnDefault,
				onUpdate: columnOnUpdate,
				autoincrement: columnAutoIncrement,
				primaryKey: columnPk,
				generated: columnGenerated,
			},
			type: 'alter_table_add_column',
		});

		return [
			`ALTER TABLE ${tableNameWithSchema} drop column "${columnName}";`,
			addColumnStatement,
		];
	}
}

////

type MySqlModifyColumnStatement =
	| JsonAlterColumnDropNotNullStatement
	| JsonAlterColumnSetNotNullStatement
	| JsonAlterColumnTypeStatement
	| JsonAlterColumnDropOnUpdateStatement
	| JsonAlterColumnSetOnUpdateStatement
	| JsonAlterColumnDropAutoincrementStatement
	| JsonAlterColumnSetAutoincrementStatement
	| JsonAlterColumnSetDefaultStatement
	| JsonAlterColumnDropDefaultStatement
	| JsonAlterColumnSetGeneratedStatement
	| JsonAlterColumnDropGeneratedStatement;

class MySqlModifyColumn extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			(statement.type === 'alter_table_alter_column_set_type'
				|| statement.type === 'alter_table_alter_column_set_notnull'
				|| statement.type === 'alter_table_alter_column_drop_notnull'
				|| statement.type === 'alter_table_alter_column_drop_on_update'
				|| statement.type === 'alter_table_alter_column_set_on_update'
				|| statement.type === 'alter_table_alter_column_set_autoincrement'
				|| statement.type === 'alter_table_alter_column_drop_autoincrement'
				|| statement.type === 'alter_table_alter_column_set_default'
				|| statement.type === 'alter_table_alter_column_drop_default'
				|| statement.type === 'alter_table_alter_column_set_generated'
				|| statement.type === 'alter_table_alter_column_drop_generated')
			&& dialect === 'mysql'
		);
	}

	convert(statement: MySqlModifyColumnStatement) {
		const { tableName, columnName } = statement;
		let columnType = ``;
		let columnDefault: any = '';
		let columnNotNull = '';
		let columnOnUpdate = '';
		let columnAutoincrement = '';
		// let primaryKey = statement.columnPk ? ' PRIMARY KEY' : '';
		let columnGenerated = '';

		if (statement.type === 'alter_table_alter_column_drop_notnull') {
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_notnull') {
			columnNotNull = ` NOT NULL`;
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_drop_on_update') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnOnUpdate = '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_on_update') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = ` ON UPDATE CURRENT_TIMESTAMP`;
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (
			statement.type === 'alter_table_alter_column_set_autoincrement'
		) {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = ' AUTO_INCREMENT';
		} else if (
			statement.type === 'alter_table_alter_column_drop_autoincrement'
		) {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = '';
		} else if (statement.type === 'alter_table_alter_column_set_default') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = ` DEFAULT ${statement.newDefaultValue}`;
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_drop_default') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_generated') {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';

			if (statement.columnGenerated?.type === 'virtual') {
				return [
					new MySqlAlterTableDropColumnConvertor().convert({
						type: 'alter_table_drop_column',
						tableName: statement.tableName,
						columnName: statement.columnName,
						schema: statement.schema,
					}),
					new MySqlAlterTableAddColumnConvertor().convert({
						tableName,
						column: {
							name: columnName,
							type: statement.newDataType,
							notNull: statement.columnNotNull,
							default: statement.columnDefault,
							onUpdate: statement.columnOnUpdate,
							autoincrement: statement.columnAutoIncrement,
							primaryKey: statement.columnPk,
							generated: statement.columnGenerated,
						},
						schema: statement.schema,
						type: 'alter_table_add_column',
					}),
				];
			} else {
				columnGenerated = statement.columnGenerated
					? ` GENERATED ALWAYS AS (${statement.columnGenerated?.as}) ${statement.columnGenerated?.type.toUpperCase()}`
					: '';
			}
		} else if (statement.type === 'alter_table_alter_column_drop_generated') {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';

			if (statement.oldColumn?.generated?.type === 'virtual') {
				return [
					new MySqlAlterTableDropColumnConvertor().convert({
						type: 'alter_table_drop_column',
						tableName: statement.tableName,
						columnName: statement.columnName,
						schema: statement.schema,
					}),
					new MySqlAlterTableAddColumnConvertor().convert({
						tableName,
						column: {
							name: columnName,
							type: statement.newDataType,
							notNull: statement.columnNotNull,
							default: statement.columnDefault,
							onUpdate: statement.columnOnUpdate,
							autoincrement: statement.columnAutoIncrement,
							primaryKey: statement.columnPk,
							generated: statement.columnGenerated,
						},
						schema: statement.schema,
						type: 'alter_table_add_column',
					}),
				];
			}
		} else {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
			columnGenerated = statement.columnGenerated
				? ` GENERATED ALWAYS AS (${statement.columnGenerated?.as}) ${statement.columnGenerated?.type.toUpperCase()}`
				: '';
		}

		// Seems like getting value from simple json2 shanpshot makes dates be dates
		columnDefault = columnDefault instanceof Date
			? columnDefault.toISOString()
			: columnDefault;

		return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\`${columnType}${columnAutoincrement}${columnGenerated}${columnNotNull}${columnDefault}${columnOnUpdate};`;
	}
}

class SingleStoreAlterTableAlterColumnAlterrGeneratedConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_alter_generated'
			&& dialect === 'singlestore'
		);
	}

	convert(statement: JsonAlterColumnAlterGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnOnUpdate,
			columnAutoIncrement,
			columnPk,
			columnGenerated,
		} = statement;

		const tableNameWithSchema = schema
			? `\`${schema}\`.\`${tableName}\``
			: `\`${tableName}\``;

		const addColumnStatement = new SingleStoreAlterTableAddColumnConvertor().convert({
			schema,
			tableName,
			column: {
				name: columnName,
				type: statement.newDataType,
				notNull,
				default: columnDefault,
				onUpdate: columnOnUpdate,
				autoincrement: columnAutoIncrement,
				primaryKey: columnPk,
				generated: columnGenerated,
			},
			type: 'alter_table_add_column',
		});

		return [
			`ALTER TABLE ${tableNameWithSchema} drop column \`${columnName}\`;`,
			addColumnStatement,
		];
	}
}

// class SingleStoreAlterTableAlterColumnSetDefaultConvertor extends Convertor {
// 	can(statement: JsonStatement, dialect: Dialect): boolean {
// 		return (
// 			statement.type === 'alter_table_alter_column_set_default'
// 			&& dialect === 'singlestore'
// 		);
// 	}

// 	convert(statement: JsonAlterColumnSetDefaultStatement) {
// 		const { tableName, columnName } = statement;
// 		return `ALTER TABLE \`${tableName}\` ALTER COLUMN \`${columnName}\` SET DEFAULT ${statement.newDefaultValue};`;
// 	}
// }

// class SingleStoreAlterTableAlterColumnDropDefaultConvertor extends Convertor {
// 	can(statement: JsonStatement, dialect: Dialect): boolean {
// 		return (
// 			statement.type === 'alter_table_alter_column_drop_default'
// 			&& dialect === 'singlestore'
// 		);
// 	}

// 	convert(statement: JsonAlterColumnDropDefaultStatement) {
// 		const { tableName, columnName } = statement;
// 		return `ALTER TABLE \`${tableName}\` ALTER COLUMN \`${columnName}\` DROP DEFAULT;`;
// 	}
// }

class SingleStoreAlterTableAddPk extends Convertor {
	can(statement: JsonStatement, dialect: string): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_pk'
			&& dialect === 'singlestore'
		);
	}
	convert(statement: JsonAlterColumnSetPrimaryKeyStatement): string {
		return `ALTER TABLE \`${statement.tableName}\` ADD PRIMARY KEY (\`${statement.columnName}\`);`;
	}
}

class SingleStoreAlterTableDropPk extends Convertor {
	can(statement: JsonStatement, dialect: string): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_pk'
			&& dialect === 'singlestore'
		);
	}
	convert(statement: JsonAlterColumnDropPrimaryKeyStatement): string {
		return `ALTER TABLE \`${statement.tableName}\` DROP PRIMARY KEY`;
	}
}

type SingleStoreModifyColumnStatement =
	| JsonAlterColumnDropNotNullStatement
	| JsonAlterColumnSetNotNullStatement
	| JsonAlterColumnTypeStatement
	| JsonAlterColumnDropOnUpdateStatement
	| JsonAlterColumnSetOnUpdateStatement
	| JsonAlterColumnDropAutoincrementStatement
	| JsonAlterColumnSetAutoincrementStatement
	| JsonAlterColumnSetDefaultStatement
	| JsonAlterColumnDropDefaultStatement
	| JsonAlterColumnSetGeneratedStatement
	| JsonAlterColumnDropGeneratedStatement;

class SingleStoreModifyColumn extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			(statement.type === 'alter_table_alter_column_set_type'
				|| statement.type === 'alter_table_alter_column_set_notnull'
				|| statement.type === 'alter_table_alter_column_drop_notnull'
				|| statement.type === 'alter_table_alter_column_drop_on_update'
				|| statement.type === 'alter_table_alter_column_set_on_update'
				|| statement.type === 'alter_table_alter_column_set_autoincrement'
				|| statement.type === 'alter_table_alter_column_drop_autoincrement'
				|| statement.type === 'alter_table_alter_column_set_default'
				|| statement.type === 'alter_table_alter_column_drop_default'
				|| statement.type === 'alter_table_alter_column_set_generated'
				|| statement.type === 'alter_table_alter_column_drop_generated')
			&& dialect === 'singlestore'
		);
	}

	convert(statement: SingleStoreModifyColumnStatement) {
		const { tableName, columnName } = statement;
		let columnType = ``;
		let columnDefault: any = '';
		let columnNotNull = '';
		let columnOnUpdate = '';
		let columnAutoincrement = '';
		// let primaryKey = statement.columnPk ? ' PRIMARY KEY' : '';
		let columnGenerated = '';

		if (statement.type === 'alter_table_alter_column_drop_notnull') {
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_notnull') {
			columnNotNull = ` NOT NULL`;
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_drop_on_update') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnOnUpdate = '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_on_update') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = ` ON UPDATE CURRENT_TIMESTAMP`;
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (
			statement.type === 'alter_table_alter_column_set_autoincrement'
		) {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = ' AUTO_INCREMENT';
		} else if (
			statement.type === 'alter_table_alter_column_drop_autoincrement'
		) {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = '';
		} else if (statement.type === 'alter_table_alter_column_set_default') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = ` DEFAULT ${statement.newDefaultValue}`;
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_drop_default') {
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnType = ` ${statement.newDataType}`;
			columnDefault = '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
		} else if (statement.type === 'alter_table_alter_column_set_generated') {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';

			if (statement.columnGenerated?.type === 'virtual') {
				return [
					new SingleStoreAlterTableDropColumnConvertor().convert({
						type: 'alter_table_drop_column',
						tableName: statement.tableName,
						columnName: statement.columnName,
						schema: statement.schema,
					}),
					new SingleStoreAlterTableAddColumnConvertor().convert({
						tableName,
						column: {
							name: columnName,
							type: statement.newDataType,
							notNull: statement.columnNotNull,
							default: statement.columnDefault,
							onUpdate: statement.columnOnUpdate,
							autoincrement: statement.columnAutoIncrement,
							primaryKey: statement.columnPk,
							generated: statement.columnGenerated,
						},
						schema: statement.schema,
						type: 'alter_table_add_column',
					}),
				];
			} else {
				columnGenerated = statement.columnGenerated
					? ` GENERATED ALWAYS AS (${statement.columnGenerated?.as}) ${statement.columnGenerated?.type.toUpperCase()}`
					: '';
			}
		} else if (statement.type === 'alter_table_alter_column_drop_generated') {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';

			if (statement.oldColumn?.generated?.type === 'virtual') {
				return [
					new SingleStoreAlterTableDropColumnConvertor().convert({
						type: 'alter_table_drop_column',
						tableName: statement.tableName,
						columnName: statement.columnName,
						schema: statement.schema,
					}),
					new SingleStoreAlterTableAddColumnConvertor().convert({
						tableName,
						column: {
							name: columnName,
							type: statement.newDataType,
							notNull: statement.columnNotNull,
							default: statement.columnDefault,
							onUpdate: statement.columnOnUpdate,
							autoincrement: statement.columnAutoIncrement,
							primaryKey: statement.columnPk,
							generated: statement.columnGenerated,
						},
						schema: statement.schema,
						type: 'alter_table_add_column',
					}),
				];
			}
		} else {
			columnType = ` ${statement.newDataType}`;
			columnNotNull = statement.columnNotNull ? ` NOT NULL` : '';
			columnOnUpdate = columnOnUpdate = statement.columnOnUpdate
				? ` ON UPDATE CURRENT_TIMESTAMP`
				: '';
			columnDefault = statement.columnDefault
				? ` DEFAULT ${statement.columnDefault}`
				: '';
			columnAutoincrement = statement.columnAutoIncrement
				? ' AUTO_INCREMENT'
				: '';
			columnGenerated = statement.columnGenerated
				? ` GENERATED ALWAYS AS (${statement.columnGenerated?.as}) ${statement.columnGenerated?.type.toUpperCase()}`
				: '';
		}

		// Seems like getting value from simple json2 shanpshot makes dates be dates
		columnDefault = columnDefault instanceof Date
			? columnDefault.toISOString()
			: columnDefault;

		return `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\`${columnType}${columnAutoincrement}${columnNotNull}${columnDefault}${columnOnUpdate}${columnGenerated};`;
	}
}
// class SqliteAlterTableAlterColumnDropDefaultConvertor extends Convertor {
// 	can(statement: JsonStatement, dialect: Dialect): boolean {
// 		return (
// 			statement.type === 'alter_table_alter_column_drop_default'
// 			&& dialect === 'sqlite'
// 		);
// 	}

// 	convert(statement: JsonAlterColumnDropDefaultStatement) {
// 		return (
// 			'/*\n SQLite does not support "Drop default from column" out of the box, we do not generate automatic migration for that, so it has to be done manually'
// 			+ '\n Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php'
// 			+ '\n                  https://www.sqlite.org/lang_altertable.html'
// 			+ '\n                  https://stackoverflow.com/questions/2083543/modify-a-columns-type-in-sqlite3'
// 			+ "\n\n Due to that we don't generate migration automatically and it has to be done manually"
// 			+ '\n*/'
// 		);
// 	}
// }

class PgAlterTableCreateCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_composite_pk' && dialect === 'postgresql';
	}

	convert(statement: JsonCreateCompositePK) {
		const { columns } = PgSquasher.unsquashPK(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${statement.constraintName}" PRIMARY KEY("${
			columns.join('","')
		}");`;
	}
}
class PgAlterTableDeleteCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_composite_pk' && dialect === 'postgresql';
	}

	convert(statement: JsonDeleteCompositePK) {
		// const { name, columns } = PgSquasher.unsquashPK(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${statement.constraintName}";`;
	}
}

class PgAlterTableAlterCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_composite_pk' && dialect === 'postgresql';
	}

	convert(statement: JsonAlterCompositePK) {
		// const { name, columns } = PgSquasher.unsquashPK(statement.old);
		const { columns: newColumns } = PgSquasher.unsquashPK(
			statement.new,
		);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${statement.oldConstraintName}";\n${BREAKPOINT}ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${statement.newConstraintName}" PRIMARY KEY("${
			newColumns.join('","')
		}");`;
	}
}

class MySqlAlterTableCreateCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_composite_pk' && dialect === 'mysql';
	}

	convert(statement: JsonCreateCompositePK) {
		const { columns } = MySqlSquasher.unsquashPK(statement.data);
		return `ALTER TABLE \`${statement.tableName}\` ADD PRIMARY KEY(\`${columns.join('`,`')}\`);`;
	}
}

class MySqlAlterTableDeleteCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_composite_pk' && dialect === 'mysql';
	}

	convert(statement: JsonDeleteCompositePK) {
		// const { name, columns } = MySqlSquasher.unsquashPK(statement.data);
		return `ALTER TABLE \`${statement.tableName}\` DROP PRIMARY KEY;`;
	}
}

class MySqlAlterTableAlterCompositePrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_composite_pk' && dialect === 'mysql';
	}

	convert(statement: JsonAlterCompositePK) {
		// const { name, columns } = MySqlSquasher.unsquashPK(statement.old);
		const { columns: newColumns } = MySqlSquasher.unsquashPK(
			statement.new,
		);
		return `ALTER TABLE \`${statement.tableName}\` DROP PRIMARY KEY, ADD PRIMARY KEY(\`${newColumns.join('`,`')}\`);`;
	}
}

// class SqliteAlterTableCreateCompositePrimaryKeyConvertor extends Convertor {
// 	can(statement: JsonStatement, dialect: Dialect): boolean {
// 		return statement.type === 'create_composite_pk' && dialect === 'sqlite';
// 	}

// 	convert(statement: JsonCreateCompositePK) {
// 		let msg = '/*\n';
// 		msg += `You're trying to add PRIMARY KEY(${statement.data}) to '${statement.tableName}' table\n`;
// 		msg += 'SQLite does not support adding primary key to an already created table\n';
// 		msg += 'You can do it in 3 steps with drizzle orm:\n';
// 		msg += ' - create new mirror table with needed pk, rename current table to old_table, generate SQL\n';
// 		msg += ' - migrate old data from one table to another\n';
// 		msg += ' - delete old_table in schema, generate sql\n\n';
// 		msg += 'or create manual migration like below:\n\n';
// 		msg += 'ALTER TABLE table_name RENAME TO old_table;\n';
// 		msg += 'CREATE TABLE table_name (\n';
// 		msg += '\tcolumn1 datatype [ NULL | NOT NULL ],\n';
// 		msg += '\tcolumn2 datatype [ NULL | NOT NULL ],\n';
// 		msg += '\t...\n';
// 		msg += '\tPRIMARY KEY (pk_col1, pk_col2, ... pk_col_n)\n';
// 		msg += ' );\n';
// 		msg += 'INSERT INTO table_name SELECT * FROM old_table;\n\n';
// 		msg += "Due to that we don't generate migration automatically and it has to be done manually\n";
// 		msg += '*/\n';
// 		return msg;
// 	}
// }
// class SqliteAlterTableDeleteCompositePrimaryKeyConvertor extends Convertor {
// 	can(statement: JsonStatement, dialect: Dialect): boolean {
// 		return statement.type === 'delete_composite_pk' && dialect === 'sqlite';
// 	}

// 	convert(statement: JsonDeleteCompositePK) {
// 		let msg = '/*\n';
// 		msg += `You're trying to delete PRIMARY KEY(${statement.data}) from '${statement.tableName}' table\n`;
// 		msg += 'SQLite does not supportprimary key deletion from existing table\n';
// 		msg += 'You can do it in 3 steps with drizzle orm:\n';
// 		msg += ' - create new mirror table table without pk, rename current table to old_table, generate SQL\n';
// 		msg += ' - migrate old data from one table to another\n';
// 		msg += ' - delete old_table in schema, generate sql\n\n';
// 		msg += 'or create manual migration like below:\n\n';
// 		msg += 'ALTER TABLE table_name RENAME TO old_table;\n';
// 		msg += 'CREATE TABLE table_name (\n';
// 		msg += '\tcolumn1 datatype [ NULL | NOT NULL ],\n';
// 		msg += '\tcolumn2 datatype [ NULL | NOT NULL ],\n';
// 		msg += '\t...\n';
// 		msg += '\tPRIMARY KEY (pk_col1, pk_col2, ... pk_col_n)\n';
// 		msg += ' );\n';
// 		msg += 'INSERT INTO table_name SELECT * FROM old_table;\n\n';
// 		msg += "Due to that we don't generate migration automatically and it has to be done manually\n";
// 		msg += '*/\n';
// 		return msg;
// 	}
// }

// class SqliteAlterTableAlterCompositePrimaryKeyConvertor extends Convertor {
// 	can(statement: JsonStatement, dialect: Dialect): boolean {
// 		return statement.type === 'alter_composite_pk' && dialect === 'sqlite';
// 	}

// 	convert(statement: JsonAlterCompositePK) {
// 		let msg = '/*\n';
// 		msg += 'SQLite does not support altering primary key\n';
// 		msg += 'You can do it in 3 steps with drizzle orm:\n';
// 		msg += ' - create new mirror table with needed pk, rename current table to old_table, generate SQL\n';
// 		msg += ' - migrate old data from one table to another\n';
// 		msg += ' - delete old_table in schema, generate sql\n\n';
// 		msg += 'or create manual migration like below:\n\n';
// 		msg += 'ALTER TABLE table_name RENAME TO old_table;\n';
// 		msg += 'CREATE TABLE table_name (\n';
// 		msg += '\tcolumn1 datatype [ NULL | NOT NULL ],\n';
// 		msg += '\tcolumn2 datatype [ NULL | NOT NULL ],\n';
// 		msg += '\t...\n';
// 		msg += '\tPRIMARY KEY (pk_col1, pk_col2, ... pk_col_n)\n';
// 		msg += ' );\n';
// 		msg += 'INSERT INTO table_name SELECT * FROM old_table;\n\n';
// 		msg += "Due to that we don't generate migration automatically and it has to be done manually\n";
// 		msg += '*/\n';

// 		return msg;
// 	}
// }

class PgAlterTableAlterColumnSetPrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_pk'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnSetPrimaryKeyStatement) {
		const { columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD PRIMARY KEY ("${columnName}");`;
	}
}

class PgAlterTableAlterColumnDropPrimaryKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_pk'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnDropPrimaryKeyStatement) {
		const { tableName, schema } = statement;
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

class PgAlterTableAlterColumnSetNotNullConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_notnull'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnSetNotNullStatement) {
		const { columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET NOT NULL;`;
	}
}

class PgAlterTableAlterColumnDropNotNullConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_notnull'
			&& dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterColumnDropNotNullStatement) {
		const { columnName } = statement;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP NOT NULL;`;
	}
}

// FK
class PgCreateForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_reference' && dialect === 'postgresql';
	}

	convert(statement: JsonCreateReferenceStatement): string {
		const {
			name,
			tableFrom,
			tableTo,
			columnsFrom,
			columnsTo,
			onDelete,
			onUpdate,
			schemaTo,
		} = PgSquasher.unsquashFK(statement.data);
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
			`ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;

		return alterStatement;
	}
}

class MySqlCreateForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_reference' && dialect === 'mysql';
	}

	convert(statement: JsonCreateReferenceStatement): string {
		const {
			name,
			tableFrom,
			tableTo,
			columnsFrom,
			columnsTo,
			onDelete,
			onUpdate,
		} = MySqlSquasher.unsquashFK(statement.data);
		const onDeleteStatement = onDelete ? ` ON DELETE ${onDelete}` : '';
		const onUpdateStatement = onUpdate ? ` ON UPDATE ${onUpdate}` : '';
		const fromColumnsString = columnsFrom.map((it) => `\`${it}\``).join(',');
		const toColumnsString = columnsTo.map((it) => `\`${it}\``).join(',');

		return `ALTER TABLE \`${tableFrom}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (${fromColumnsString}) REFERENCES \`${tableTo}\`(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;
	}
}

class PgAlterForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'alter_reference' && dialect === 'postgresql';
	}

	convert(statement: JsonAlterReferenceStatement): string {
		const newFk = PgSquasher.unsquashFK(statement.data);
		const oldFk = PgSquasher.unsquashFK(statement.oldFkey);

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
			`ALTER TABLE ${tableFromNameWithSchema} ADD CONSTRAINT "${newFk.name}" FOREIGN KEY (${fromColumnsString}) REFERENCES ${tableToNameWithSchema}(${toColumnsString})${onDeleteStatement}${onUpdateStatement};`;

		sql += alterStatement;
		return sql;
	}
}

class PgDeleteForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_reference' && dialect === 'postgresql';
	}

	convert(statement: JsonDeleteReferenceStatement): string {
		const tableFrom = statement.tableName; // delete fk from renamed table case
		const { name } = PgSquasher.unsquashFK(statement.data);

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${tableFrom}"`
			: `"${tableFrom}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${name}";\n`;
	}
}

class MySqlDeleteForeignKeyConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'delete_reference' && dialect === 'mysql';
	}

	convert(statement: JsonDeleteReferenceStatement): string {
		const tableFrom = statement.tableName; // delete fk from renamed table case
		const { name } = MySqlSquasher.unsquashFK(statement.data);
		return `ALTER TABLE \`${tableFrom}\` DROP FOREIGN KEY \`${name}\`;\n`;
	}
}

class CreatePgIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_index_pg' && dialect === 'postgresql';
	}

	convert(statement: JsonPgCreateIndexStatement): string {
		const {
			name,
			columns,
			isUnique,
			concurrently,
			with: withMap,
			method,
			where,
		} = statement.data;
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
				if (mappedWith.hasOwnProperty(key)) {
					reversedString += `${key}=${mappedWith[key]},`;
				}
			}
			reversedString = reversedString.slice(0, -1);
			return reversedString;
		}

		return `CREATE ${indexPart}${
			concurrently ? ' CONCURRENTLY' : ''
		} "${name}" ON ${tableNameWithSchema} USING ${method} (${value})${
			Object.keys(withMap!).length !== 0
				? ` WITH (${reverseLogic(withMap!)})`
				: ''
		}${where ? ` WHERE ${where}` : ''};`;
	}
}

class PgDropIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_index' && dialect === 'postgresql';
	}

	convert(statement: JsonDropIndexStatement): string {
		const { schema } = statement;
		const { name } = PgSquasher.unsquashIdx(statement.data);

		const indexNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `DROP INDEX ${indexNameWithSchema};`;
	}
}

class PgCreateSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_schema' && dialect === 'postgresql';
	}

	convert(statement: JsonCreateSchema) {
		const { name } = statement;
		return `CREATE SCHEMA "${name}";\n`;
	}
}

class PgRenameSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'rename_schema' && dialect === 'postgresql';
	}

	convert(statement: JsonRenameSchema) {
		const { from, to } = statement;
		return `ALTER SCHEMA "${from}" RENAME TO "${to}";\n`;
	}
}

class PgDropSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_schema' && dialect === 'postgresql';
	}

	convert(statement: JsonCreateSchema) {
		const { name } = statement;
		return `DROP SCHEMA "${name}";\n`;
	}
}

class PgAlterTableSetSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_set_schema' && dialect === 'postgresql'
		);
	}

	convert(statement: JsonAlterTableSetSchema) {
		const { tableName, schemaFrom, schemaTo } = statement;

		return `ALTER TABLE "${schemaFrom}"."${tableName}" SET SCHEMA "${schemaTo}";\n`;
	}
}

class PgAlterTableSetNewSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_set_new_schema'
			&& dialect === 'postgresql'
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

class PgAlterTableRemoveFromSchemaConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return (
			statement.type === 'alter_table_remove_from_schema'
			&& dialect === 'postgresql'
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

export class SqliteDropIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_index' && (dialect === 'sqlite' || dialect === 'turso');
	}

	convert(statement: JsonDropIndexStatement): string {
		const { name } = PgSquasher.unsquashIdx(statement.data);
		return `DROP INDEX \`${name}\`;`;
	}
}

class MySqlDropIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'drop_index' && dialect === 'mysql';
	}

	convert(statement: JsonDropIndexStatement): string {
		const { name } = MySqlSquasher.unsquashIdx(statement.data);
		return `DROP INDEX \`${name}\` ON \`${statement.tableName}\`;`;
	}
}

class CreateMySqlIndexConvertor extends Convertor {
	can(statement: JsonStatement, dialect: Dialect): boolean {
		return statement.type === 'create_index' && dialect === 'mysql';
	}

	convert(statement: JsonCreateIndexStatement): string {
		// should be changed
		const { name, columns, isUnique } = MySqlSquasher.unsquashIdx(
			statement.data,
		);
		const indexPart = isUnique ? 'UNIQUE INDEX' : 'INDEX';
		const uniqueString = columns.join(',');

		return `CREATE ${indexPart} \`${name}\` ON \`${statement.tableName}\` (${uniqueString});`;
	}
}

const convertors: Convertor[] = [];
convertors.push(new PgCreateTableConvertor());
convertors.push(new MySqlCreateTableConvertor());

convertors.push(new PgCreateViewConvertor());
convertors.push(new PgDropViewConvertor());
convertors.push(new PgRenameViewConvertor());
convertors.push(new PgAlterViewSchemaConvertor());
convertors.push(new PgAlterViewAddWithOptionConvertor());
convertors.push(new PgAlterViewDropWithOptionConvertor());
convertors.push(new PgAlterViewAlterTablespaceConvertor());
convertors.push(new PgAlterViewAlterUsingConvertor());

convertors.push(new MySqlCreateViewConvertor());
convertors.push(new MySqlDropViewConvertor());
convertors.push(new MySqlRenameViewConvertor());

convertors.push(new SqliteDropViewConvertor());

convertors.push(new CreateTypeEnumConvertor());
convertors.push(new DropTypeEnumConvertor());
convertors.push(new AlterTypeAddValueConvertor());
convertors.push(new AlterTypeSetSchemaConvertor());
convertors.push(new AlterRenameTypeConvertor());
convertors.push(new AlterTypeDropValueConvertor());

convertors.push(new CreatePgSequenceConvertor());
convertors.push(new DropPgSequenceConvertor());
convertors.push(new RenamePgSequenceConvertor());
convertors.push(new MovePgSequenceConvertor());
convertors.push(new AlterPgSequenceConvertor());

convertors.push(new PgDropTableConvertor());
convertors.push(new MySQLDropTableConvertor());
convertors.push(new SingleStoreDropTableConvertor());
convertors.push(new SQLiteDropTableConvertor());

convertors.push(new PgRenameTableConvertor());
convertors.push(new MySqlRenameTableConvertor());
convertors.push(new SingleStoreRenameTableConvertor());
convertors.push(new SqliteRenameTableConvertor());

convertors.push(new PgAlterTableRenameColumnConvertor());
convertors.push(new MySqlAlterTableRenameColumnConvertor());
convertors.push(new SingleStoreAlterTableRenameColumnConvertor());
convertors.push(new SQLiteAlterTableRenameColumnConvertor());

convertors.push(new PgAlterTableDropColumnConvertor());
convertors.push(new MySqlAlterTableDropColumnConvertor());
convertors.push(new SingleStoreAlterTableDropColumnConvertor());
convertors.push(new SQLiteAlterTableDropColumnConvertor());

convertors.push(new PgAlterTableAddColumnConvertor());
convertors.push(new MySqlAlterTableAddColumnConvertor());
convertors.push(new SingleStoreAlterTableAddColumnConvertor());

convertors.push(new PgAlterTableAlterColumnSetTypeConvertor());

convertors.push(new PgAlterTableAddUniqueConstraintConvertor());
convertors.push(new PgAlterTableDropUniqueConstraintConvertor());

convertors.push(new PgAlterTableAddCheckConstraintConvertor());
convertors.push(new PgAlterTableDeleteCheckConstraintConvertor());
convertors.push(new MySqlAlterTableAddCheckConstraintConvertor());
convertors.push(new MySqlAlterTableDeleteCheckConstraintConvertor());

convertors.push(new MySQLAlterTableAddUniqueConstraintConvertor());
convertors.push(new MySQLAlterTableDropUniqueConstraintConvertor());

convertors.push(new CreatePgIndexConvertor());
convertors.push(new CreateMySqlIndexConvertor());

convertors.push(new PgDropIndexConvertor());
convertors.push(new SqliteDropIndexConvertor());
convertors.push(new MySqlDropIndexConvertor());

convertors.push(new PgAlterTableAlterColumnSetPrimaryKeyConvertor());
convertors.push(new PgAlterTableAlterColumnDropPrimaryKeyConvertor());
convertors.push(new PgAlterTableAlterColumnSetNotNullConvertor());
convertors.push(new PgAlterTableAlterColumnDropNotNullConvertor());
convertors.push(new PgAlterTableAlterColumnSetDefaultConvertor());
convertors.push(new PgAlterTableAlterColumnDropDefaultConvertor());

convertors.push(new PgAlterPolicyConvertor());
convertors.push(new PgCreatePolicyConvertor());
convertors.push(new PgDropPolicyConvertor());
convertors.push(new PgRenamePolicyConvertor());

convertors.push(new PgAlterIndPolicyConvertor());
convertors.push(new PgCreateIndPolicyConvertor());
convertors.push(new PgDropIndPolicyConvertor());
convertors.push(new PgRenameIndPolicyConvertor());

convertors.push(new PgEnableRlsConvertor());
convertors.push(new PgDisableRlsConvertor());

convertors.push(new PgDropRoleConvertor());
convertors.push(new PgAlterRoleConvertor());
convertors.push(new PgCreateRoleConvertor());
convertors.push(new PgRenameRoleConvertor());

/// generated
convertors.push(new PgAlterTableAlterColumnSetExpressionConvertor());
convertors.push(new PgAlterTableAlterColumnDropGeneratedConvertor());
convertors.push(new PgAlterTableAlterColumnAlterrGeneratedConvertor());

convertors.push(new SingleStoreAlterTableAlterColumnAlterrGeneratedConvertor());
convertors.push(new MySqlModifyColumn());
// convertors.push(new MySqlAlterTableAlterColumnSetDefaultConvertor());
// convertors.push(new MySqlAlterTableAlterColumnDropDefaultConvertor());

convertors.push(new SingleStoreModifyColumn());

convertors.push(new PgCreateForeignKeyConvertor());
convertors.push(new MySqlCreateForeignKeyConvertor());

convertors.push(new PgAlterForeignKeyConvertor());

convertors.push(new PgDeleteForeignKeyConvertor());
convertors.push(new MySqlDeleteForeignKeyConvertor());

convertors.push(new PgCreateSchemaConvertor());
convertors.push(new PgRenameSchemaConvertor());
convertors.push(new PgDropSchemaConvertor());
convertors.push(new PgAlterTableSetSchemaConvertor());
convertors.push(new PgAlterTableSetNewSchemaConvertor());
convertors.push(new PgAlterTableRemoveFromSchemaConvertor());

convertors.push(new PgAlterTableAlterColumnDropGenerated());
convertors.push(new PgAlterTableAlterColumnSetGenerated());
convertors.push(new PgAlterTableAlterColumnAlterGenerated());

convertors.push(new PgAlterTableCreateCompositePrimaryKeyConvertor());
convertors.push(new PgAlterTableDeleteCompositePrimaryKeyConvertor());
convertors.push(new PgAlterTableAlterCompositePrimaryKeyConvertor());

convertors.push(new MySqlAlterTableDeleteCompositePrimaryKeyConvertor());
convertors.push(new MySqlAlterTableCreateCompositePrimaryKeyConvertor());
convertors.push(new MySqlAlterTableAlterCompositePrimaryKeyConvertor());

convertors.push(new SingleStoreAlterTableDropPk());
convertors.push(new SingleStoreAlterTableAddPk());

export function fromJson(
	statements: JsonStatement[],
	dialect: Dialect,
	action?: 'push',
) {
	const result = statements
		.flatMap((statement) => {
			const filtered = convertors.filter((it) => {
				return it.can(statement, dialect);
			});

			const convertor = filtered.length === 1 ? filtered[0] : undefined;

			if (!convertor) throw new Error(`Unexpected statement: ${dialect}:${statement.type}`);

			return convertor.convert(statement, action);
		})
		.filter((it) => it !== '');
	return result;
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
