import { stat } from 'fs/promises';
import { BREAKPOINT } from '../../global';
import { escapeSingleQuotes } from '../../utils';
import type {
	JsonAddColumnStatement,
	JsonAddValueToEnumStatement,
	JsonAlterColumnAlterGeneratedStatement,
	JsonAlterColumnAlterIdentityStatement,
	JsonAlterColumnDropDefaultStatement,
	JsonAlterColumnDropGeneratedStatement,
	JsonAlterColumnDropIdentityStatement,
	JsonAlterColumnDropNotNullStatement,
	JsonAlterColumnDropPrimaryKeyStatement,
	JsonAlterColumnSetDefaultStatement,
	JsonAlterColumnSetGeneratedStatement,
	JsonAlterColumnSetIdentityStatement,
	JsonAlterColumnSetNotNullStatement,
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
	JsonMoveTable,
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
	JsonCreatePolicyStatement,
	JsonCreateReferenceStatement,
	JsonCreateRoleStatement,
	JsonCreateSchema,
	JsonCreateSequenceStatement,
	JsonCreateTableStatement,
	JsonCreateUnique,
	JsonCreateView,
	JsonDeleteCheckConstraint,
	JsonDropCompositePK,
	JsonDeleteReferenceStatement,
	JsonDeleteUnique,
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
	JsonRecreateViewDefinitionStatement,
	JsonRenameColumnStatement,
	JsonRenameEnumStatement,
	JsonRenamePolicyStatement,
	JsonRenameRoleStatement,
	JsonRenameSchema,
	JsonRenameSequenceStatement,
	JsonRenameTableStatement,
	JsonRenameUnique,
	JsonRenameViewStatement,
	JsonStatement,
} from './statements';

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

class CreateRoleConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_role';
	}
	convert(statement: JsonCreateRoleStatement): string | string[] {
		return `CREATE ROLE "${statement.name}"${
			statement.values.createDb || statement.values.createRole || !statement.values.inherit
				? ` WITH${statement.values.createDb ? ' CREATEDB' : ''}${statement.values.createRole ? ' CREATEROLE' : ''}${
					statement.values.inherit ? '' : ' NOINHERIT'
				}`
				: ''
		};`;
	}
}

class DropRoleConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_role';
	}
	convert(statement: JsonDropRoleStatement): string | string[] {
		return `DROP ROLE "${statement.name}";`;
	}
}

class RenameRoleConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_role';
	}
	convert(statement: JsonRenameRoleStatement): string | string[] {
		return `ALTER ROLE "${statement.nameFrom}" RENAME TO "${statement.nameTo}";`;
	}
}

class AlterRoleConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_role';
	}
	convert(statement: JsonAlterRoleStatement): string | string[] {
		return `ALTER ROLE "${statement.name}"${` WITH${statement.values.createDb ? ' CREATEDB' : ' NOCREATEDB'}${
			statement.values.createRole ? ' CREATEROLE' : ' NOCREATEROLE'
		}${statement.values.inherit ? ' INHERIT' : ' NOINHERIT'}`};`;
	}
}

class CreatePolicyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_policy';
	}
	convert(statement: JsonCreatePolicyStatement): string | string[] {
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

class DropPolicyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_policy';
	}
	convert(statement: JsonDropPolicyStatement): string | string[] {
		const policy = statement.data;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `DROP POLICY "${policy.name}" ON ${tableNameWithSchema} CASCADE;`;
	}
}

class RenamePolicyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_policy';
	}
	convert(statement: JsonRenamePolicyStatement): string | string[] {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER POLICY "${statement.oldName}" ON ${tableNameWithSchema} RENAME TO "${statement.newName}";`;
	}
}

class AlterPolicyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_policy';
	}
	convert(statement: JsonAlterPolicyStatement): string | string[] {
		const { oldPolicy, newPolicy } = statement;

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

class CreateIndPolicyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_ind_policy';
	}
	convert(statement: JsonCreateIndPolicyStatement): string | string[] {
		const policy = statement.data;

		const usingPart = policy.using ? ` USING (${policy.using})` : '';

		const withCheckPart = policy.withCheck ? ` WITH CHECK (${policy.withCheck})` : '';

		const policyToPart = policy.to?.map((v) =>
			['current_user', 'current_role', 'session_user', 'public'].includes(v) ? v : `"${v}"`
		).join(', ');

		return `CREATE POLICY "${policy.name}" ON ${policy.on} AS ${policy.as?.toUpperCase()} FOR ${policy.for?.toUpperCase()} TO ${policyToPart}${usingPart}${withCheckPart};`;
	}
}

class DropIndPolicyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_ind_policy';
	}
	convert(statement: JsonDropIndPolicyStatement): string | string[] {
		const policy = statement.data;

		return `DROP POLICY "${policy.name}" ON ${policy.on} CASCADE;`;
	}
}

class RenameIndPolicyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_ind_policy';
	}
	convert(statement: JsonIndRenamePolicyStatement): string | string[] {
		return `ALTER POLICY "${statement.oldName}" ON ${statement.tableKey} RENAME TO "${statement.newName}";`;
	}
}

class AlterIndPolicyConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_ind_policy';
	}
	convert(statement: JsonAlterIndPolicyStatement): string | string[] {
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

class EnableRlsConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'enable_rls';
	}
	convert(statement: JsonEnableRLSStatement): string {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ENABLE ROW LEVEL SECURITY;`;
	}
}

class DisableRlsConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'disable_rls';
	}
	convert(statement: JsonDisableRLSStatement): string {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DISABLE ROW LEVEL SECURITY;`;
	}
}

class CreateTableConvertor implements Convertor {
	constructor(private readonly rlsConvertor: EnableRlsConvertor) {}

	can(statement: JsonStatement): boolean {
		return statement.type === 'create_table';
	}

	convert(st: JsonCreateTableStatement) {
		const { tableName, schema, columns, compositePKs, uniqueConstraints, checkConstraints, policies, isRLSEnabled } =
			st;

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

		const enableRls = this.rlsConvertor.convert({
			type: 'enable_rls',
			tableName,
			schema,
		});

		return [statement, ...(policies && policies.length > 0 || isRLSEnabled ? [enableRls] : [])];
	}
}

class CreateViewConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_view';
	}

	convert(st: JsonCreateView) {
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

class DropViewConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_view';
	}

	convert(st: JsonDropViewStatement) {
		const { name: viewName, schema, materialized, soft } = st;

		const ifExistsPrefix = soft ? 'IF EXISTS ' : '';
		const name = schema ? `"${schema}"."${viewName}"` : `"${viewName}"`;

		return `DROP${materialized ? ' MATERIALIZED' : ''} VIEW ${ifExistsPrefix}${name};`;
	}
}

class RecreateViewConvertor implements Convertor {
	constructor(
		private readonly createConvertor: CreateViewConvertor,
		private readonly dropConvertor: DropViewConvertor,
	) {}

	can(statement: JsonStatement): boolean {
		return statement.type === 'recreate_view_definition';
	}

	convert(st: JsonRecreateViewDefinitionStatement) {
		const statement1 = this.dropConvertor.convert(st.drop);
		const statement2 = this.createConvertor.convert(st.create);
		return [statement1, statement2];
	}
}

class RenameViewConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_view';
	}

	convert(st: JsonRenameViewStatement) {
		const { nameFrom: from, nameTo: to, schema, materialized } = st;

		const nameFrom = `"${schema}"."${from}"`;

		return `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW ${nameFrom} RENAME TO "${to}";`;
	}
}

class AlterViewSchemaConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_view_alter_schema';
	}

	convert(st: JsonAlterViewAlterSchemaStatement) {
		const { fromSchema, toSchema, name, materialized } = st;

		const statement = `ALTER${
			materialized ? ' MATERIALIZED' : ''
		} VIEW "${fromSchema}"."${name}" SET SCHEMA "${toSchema}";`;

		return statement;
	}
}

class AlterViewAddWithOptionConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_view_add_with_option';
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

class AlterViewDropWithOptionConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_view_drop_with_option';
	}

	convert(st: JsonAlterViewDropWithOptionStatement) {
		const { schema, name, materialized, with: withOptions } = st;

		let statement = `ALTER${materialized ? ' MATERIALIZED' : ''} VIEW "${schema}"."${name}" RESET (`;

		const options: string[] = [];

		Object.entries(withOptions).forEach(([key, value]) => {
			options.push(`${key.snake_case()}`);
		});

		statement += options.join(', ');

		statement += ');';

		return statement;
	}
}

class AlterViewAlterTablespaceConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_view_alter_tablespace';
	}

	convert(st: JsonAlterViewAlterTablespaceStatement) {
		const { schema, name, toTablespace } = st;

		const statement = `ALTER MATERIALIZED VIEW "${schema}"."${name}" SET TABLESPACE ${toTablespace};`;

		return statement;
	}
}

class AlterViewAlterUsingConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_view_alter_using';
	}

	convert(st: JsonAlterViewAlterUsingStatement) {
		const { schema, name, toUsing } = st;

		const statement = `ALTER MATERIALIZED VIEW "${schema}"."${name}" SET ACCESS METHOD "${toUsing}";`;

		return statement;
	}
}

class AlterTableAlterColumnSetGenerated implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_identity'
		);
	}
	convert(
		statement: JsonAlterColumnSetIdentityStatement,
	): string | string[] {
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
	}
}

class AlterTableAlterColumnDroenerated implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_identity'
		);
	}
	convert(
		statement: JsonAlterColumnDropIdentityStatement,
	): string | string[] {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" DROP IDENTITY;`;
	}
}

class AlterTableAlterColumnAlterGenerated implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_change_identity'
		);
	}

	convert(
		statement: JsonAlterColumnAlterIdentityStatement,
	): string | string[] {
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
	}
}

class AlterTableAddUniqueConstraintConvertor implements Convertor {
	can(statement: JsonCreateUnique): boolean {
		return (
			statement.type === 'add_unique'
		);
	}
	convert(statement: JsonCreateUnique): string {
		const unique = statement.unique;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${unique.name}" UNIQUE${
			unique.nullsNotDistinct ? ' NULLS NOT DISTINCT' : ''
		}("${unique.columns.join('","')}");`;
	}
}

class AlterTableDropUniqueConstraintConvertor implements Convertor {
	can(statement: JsonDeleteUnique): boolean {
		return (
			statement.type === 'delete_unique_constraint'
		);
	}
	convert(statement: JsonDeleteUnique): string {
		const unsquashed = statement.data;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${unsquashed.name}";`;
	}
}

class AlterTableRenameUniqueConstraintConvertor implements Convertor {
	can(statement: JsonRenameUnique): boolean {
		return (
			statement.type === 'rename_unique_constraint'
		);
	}
	convert(statement: JsonRenameUnique): string {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} RENAME CONSTRAINT "${statement.from}" TO "${statement.to}";`;
	}
}

class AlterTableAddCheckConstraintConvertor implements Convertor {
	can(statement: JsonCreateCheckConstraint): boolean {
		return (
			statement.type === 'create_check_constraint'
		);
	}
	convert(statement: JsonCreateCheckConstraint): string {
		const check = statement.check;

		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ADD CONSTRAINT "${check.name}" CHECK (${check.value});`;
	}
}

class AlterTableDeleteCheckConstraintConvertor implements Convertor {
	can(statement: JsonDeleteCheckConstraint): boolean {
		return (
			statement.type === 'delete_check_constraint'
		);
	}
	convert(statement: JsonDeleteCheckConstraint): string {
		const tableNameWithSchema = statement.schema
			? `"${statement.schema}"."${statement.tableName}"`
			: `"${statement.tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP CONSTRAINT "${statement.constraintName}";`;
	}
}

class CreateSequenceConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'create_sequence';
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

class DropSequenceConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_sequence';
	}

	convert(st: JsonDropSequenceStatement) {
		const { name, schema } = st;

		const sequenceWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `DROP SEQUENCE ${sequenceWithSchema};`;
	}
}

class RenameSequenceConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_sequence';
	}

	convert(st: JsonRenameSequenceStatement) {
		const { nameFrom, nameTo, schema } = st;

		const sequenceWithSchemaFrom = schema
			? `"${schema}"."${nameFrom}"`
			: `"${nameFrom}"`;
		const sequenceWithSchemaTo = schema
			? `"${schema}"."${nameTo}"`
			: `"${nameTo}"`;

		return `ALTER SEQUENCE ${sequenceWithSchemaFrom} RENAME TO "${nameTo}";`;
	}
}

class MoveSequenceConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'move_sequence';
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

class AlterSequenceConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_sequence';
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

class CreateTypeEnumConvertor implements Convertor {
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

class DropTypeEnumConvertor implements Convertor {
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

class AlterTypeAddValueConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_type_add_value';
	}

	convert(st: JsonAddValueToEnumStatement) {
		const { name, schema, value, before } = st;

		const enumNameWithSchema = schema ? `"${schema}"."${name}"` : `"${name}"`;

		return `ALTER TYPE ${enumNameWithSchema} ADD VALUE '${value}'${before.length ? ` BEFORE '${before}'` : ''};`;
	}
}

class AlterTypeSetSchemaConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'move_type_enum';
	}

	convert(st: JsonMoveEnumStatement) {
		const { name, schemaFrom, schemaTo } = st;

		const enumNameWithSchema = schemaFrom ? `"${schemaFrom}"."${name}"` : `"${name}"`;

		return `ALTER TYPE ${enumNameWithSchema} SET SCHEMA "${schemaTo}";`;
	}
}

class AlterRenameTypeConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_type_enum';
	}

	convert(st: JsonRenameEnumStatement) {
		const { nameTo, nameFrom, schema } = st;

		const enumNameWithSchema = schema ? `"${schema}"."${nameFrom}"` : `"${nameFrom}"`;

		return `ALTER TYPE ${enumNameWithSchema} RENAME TO "${nameTo}";`;
	}
}

class AlterTypeDropValueConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'alter_type_drop_value';
	}

	convert(st: JsonDropValueFromEnumStatement) {
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
	}
}

class DropTableConvertor implements Convertor {
	constructor(private readonly dropPolicyConvertor: DropPolicyConvertor) {}

	can(statement: JsonStatement): boolean {
		return statement.type === 'drop_table';
	}

	convert(statement: JsonDropTableStatement) {
		const { tableName, schema, policies } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const droppedPolicies = policies.map((policy) => {
			return this.dropPolicyConvertor.convert({
				type: 'drop_policy',
				tableName,
				data: policy,
				schema,
			}) as string;
		}) ?? [];

		return [
			...droppedPolicies,
			`DROP TABLE ${tableNameWithSchema} CASCADE;`,
		];
	}
}

class RenameTableConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return statement.type === 'rename_table';
	}

	convert(statement: JsonRenameTableStatement) {
		const { tableNameFrom, tableNameTo, toSchema, fromSchema } = statement;
		const from = fromSchema
			? `"${fromSchema}"."${tableNameFrom}"`
			: `"${tableNameFrom}"`;
		const to = `"${tableNameTo}"`;
		return `ALTER TABLE ${from} RENAME TO ${to};`;
	}
}

class AlterTableRenameColumnConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_rename_column'
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

class AlterTableDropColumnConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_drop_column'
		);
	}

	convert(statement: JsonDropColumnStatement) {
		const { tableName, columnName, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} DROP COLUMN IF EXISTS "${columnName}";`;
	}
}

class AlterTableAddColumnConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_add_column'
		);
	}

	convert(statement: JsonAddColumnStatement) {
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
	}
}

class AlterTableAlterColumnSetTypeConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_type'
		);
	}

	convert(statement: JsonAlterColumnTypeStatement) {
		const { tableName, columnName, newDataType, schema } = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		return `ALTER TABLE ${tableNameWithSchema} ALTER COLUMN "${columnName}" SET DATA TYPE ${newDataType};`;
	}
}

class AlterTableAlterColumnSetDefaultConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_default'
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

class AlterTableAlterColumnDropDefaultConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_default'
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

class AlterTableAlterColumnDroeneratedConvertor implements Convertor {
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_drop_generated'
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

class AlterTableAlterColumnSetExpressionConvertor implements Convertor {
	constructor(private readonly addColumnConvertor: AlterTableAddColumnConvertor) {}
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_set_generated'
		);
	}

	convert(statement: JsonAlterColumnSetGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnPk,
			columnGenerated,
		} = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const addColumnStatement = this.addColumnConvertor.convert({
			schema,
			tableName,
			column: {
				name: columnName,
				type: statement.newDataType,
				notNull,
				default: columnDefault,
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

class AlterTableAlterColumnAlterGeneratedConvertor implements Convertor {
	constructor(private readonly conv: AlterTableAddColumnConvertor) {}
	can(statement: JsonStatement): boolean {
		return (
			statement.type === 'alter_table_alter_column_alter_generated'
		);
	}

	convert(statement: JsonAlterColumnAlterGeneratedStatement) {
		const {
			tableName,
			columnName,
			schema,
			columnNotNull: notNull,
			columnDefault,
			columnPk,
			columnGenerated,
		} = statement;

		const tableNameWithSchema = schema
			? `"${schema}"."${tableName}"`
			: `"${tableName}"`;

		const addColumnStatement = this.conv.convert({
			schema,
			tableName,
			column: {
				name: columnName,
				type: statement.newDataType,
				notNull,
				default: columnDefault,
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
const postgresEnableRlsConvertor = new EnableRlsConvertor();
const postgresDropPolicyConvertor = new DropPolicyConvertor();

convertors.push(postgresEnableRlsConvertor);

const createViewConvertor = new CreateViewConvertor();
const dropViewConvertor = new DropViewConvertor();
convertors.push(new CreateTableConvertor(postgresEnableRlsConvertor));
convertors.push(createViewConvertor);
convertors.push(dropViewConvertor);
convertors.push(new RecreateViewConvertor(createViewConvertor, dropViewConvertor));
convertors.push(new RenameViewConvertor());
convertors.push(new AlterViewSchemaConvertor());
convertors.push(new AlterViewAddWithOptionConvertor());
convertors.push(new AlterViewDropWithOptionConvertor());
convertors.push(new AlterViewAlterTablespaceConvertor());
convertors.push(new AlterViewAlterUsingConvertor());

convertors.push(new CreateTypeEnumConvertor());
convertors.push(new DropTypeEnumConvertor());
convertors.push(new AlterTypeAddValueConvertor());
convertors.push(new AlterTypeSetSchemaConvertor());
convertors.push(new AlterRenameTypeConvertor());
convertors.push(new AlterTypeDropValueConvertor());

convertors.push(new CreateSequenceConvertor());
convertors.push(new DropSequenceConvertor());
convertors.push(new RenameSequenceConvertor());
convertors.push(new MoveSequenceConvertor());
convertors.push(new AlterSequenceConvertor());

convertors.push(new DropTableConvertor(postgresDropPolicyConvertor));

convertors.push(new RenameTableConvertor());

const alterTableAddColumnConvertor = new AlterTableAddColumnConvertor();
convertors.push(new AlterTableRenameColumnConvertor());
convertors.push(new AlterTableDropColumnConvertor());
convertors.push(alterTableAddColumnConvertor);
convertors.push(new AlterTableAlterColumnSetTypeConvertor());
convertors.push(new AlterTableRenameUniqueConstraintConvertor());
convertors.push(new AlterTableAddUniqueConstraintConvertor());
convertors.push(new AlterTableDropUniqueConstraintConvertor());
convertors.push(new AlterTableAddCheckConstraintConvertor());
convertors.push(new AlterTableDeleteCheckConstraintConvertor());

convertors.push(new CreateIndexConvertor());
convertors.push(new DropIndexConvertor());

convertors.push(new AlterTableAlterColumnSetPrimaryKeyConvertor());
convertors.push(new AlterTableAlterColumnDropPrimaryKeyConvertor());
convertors.push(new AlterTableAlterColumnSetNotNullConvertor());
convertors.push(new AlterTableAlterColumnDropNotNullConvertor());
convertors.push(new AlterTableAlterColumnSetDefaultConvertor());
convertors.push(new AlterTableAlterColumnDropDefaultConvertor());

convertors.push(new AlterPolicyConvertor());
convertors.push(new CreatePolicyConvertor());
convertors.push(postgresDropPolicyConvertor);
convertors.push(new RenamePolicyConvertor());

convertors.push(new AlterIndPolicyConvertor());
convertors.push(new CreateIndPolicyConvertor());
convertors.push(new DropIndPolicyConvertor());
convertors.push(new RenameIndPolicyConvertor());

convertors.push(postgresEnableRlsConvertor);
convertors.push(new DisableRlsConvertor());

convertors.push(new DropRoleConvertor());
convertors.push(new AlterRoleConvertor());
convertors.push(new CreateRoleConvertor());
convertors.push(new RenameRoleConvertor());

/// generated
convertors.push(new AlterTableAlterColumnSetExpressionConvertor(alterTableAddColumnConvertor));
convertors.push(new AlterTableAlterColumnDroeneratedConvertor());
convertors.push(new AlterTableAlterColumnAlterGeneratedConvertor(alterTableAddColumnConvertor));

convertors.push(new CreateForeignKeyConvertor());
convertors.push(new AlterForeignKeyConvertor());
convertors.push(new DeleteForeignKeyConvertor());

convertors.push(new CreateSchemaConvertor());
convertors.push(new RenameSchemaConvertor());
convertors.push(new DropSchemaConvertor());
convertors.push(new AlterTableSetSchemaConvertor());
convertors.push(new AlterTableSetNewSchemaConvertor());
convertors.push(new AlterTableRemoveFromSchemaConvertor());

convertors.push(new AlterTableAlterColumnDroenerated());
convertors.push(new AlterTableAlterColumnSetGenerated());
convertors.push(new AlterTableAlterColumnAlterGenerated());

convertors.push(new AlterTableCreateCompositePrimaryKeyConvertor());
convertors.push(new AlterTableDeleteCompositePrimaryKeyConvertor());
convertors.push(new AlterTableAlterCompositePrimaryKeyConvertor());

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
