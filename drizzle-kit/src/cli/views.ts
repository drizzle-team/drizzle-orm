import chalk from 'chalk';
import { Prompt, render, SelectState, TaskView } from 'hanji';
import type {
	SchemaError as CockroachSchemaError,
	SchemaWarning as CockroachSchemaWarning,
} from 'src/dialects/cockroach/ddl';
import type { SchemaError as MssqlSchemaError } from 'src/dialects/mssql/ddl';
import type { SchemaError as MysqlSchemaError } from 'src/dialects/mysql/ddl';
import type {
	SchemaError as PostgresSchemaError,
	SchemaWarning as PostgresSchemaWarning,
	View,
} from 'src/dialects/postgres/ddl';
import type { JsonStatement as StatementCockraoch } from '../dialects/cockroach/statements';
import type { JsonStatement as StatementMssql } from '../dialects/mssql/statements';
import type { JsonStatement as StatementMysql } from '../dialects/mysql/statements';
import { vectorOps } from '../dialects/postgres/grammar';
import type { JsonStatement as StatementPostgres } from '../dialects/postgres/statements';
import type { SchemaError as SqliteSchemaError } from '../dialects/sqlite/ddl';
import type { JsonStatement as StatementSqlite } from '../dialects/sqlite/statements';
import type { Named, NamedWithSchema } from '../dialects/utils';
import { assertUnreachable } from '../utils';
import { highlightSQL } from './highlighter';
import { withStyle } from './validations/outputs';

export const warning = (msg: string) => {
	render(`[${chalk.yellow('Warning')}] ${msg}`);
};

export const err = (msg: string) => {
	render(`${chalk.bold.red('Error')} ${msg}`);
};

export const info = (msg: string, greyMsg: string = ''): string => {
	return `${chalk.blue.bold('Info:')} ${msg} ${greyMsg ? chalk.grey(greyMsg) : ''}`.trim();
};
export const grey = (msg: string): string => {
	return chalk.grey(msg);
};

export const error = (error: string, greyMsg: string = ''): string => {
	return `${chalk.bgRed.bold(' Error ')} ${error} ${greyMsg ? chalk.grey(greyMsg) : ''}`.trim();
};

export const postgresSchemaWarning = (warning: PostgresSchemaWarning): string => {
	if (warning.type === 'policy_not_linked') {
		return withStyle.errorWarning(
			`"Policy ${warning.policy} was skipped because it was not linked to any table. You should either include the policy in a table or use .link() on the policy to link it to any table you have. For more information, please check:`,
		);
	}

	assertUnreachable(warning.type);
};

export const cockroachSchemaWarning = (warning: CockroachSchemaWarning): string => {
	if (warning.type === 'policy_not_linked') {
		return withStyle.errorWarning(
			`"Policy ${warning.policy} was skipped because it was not linked to any table. You should either include the policy in a table or use .link() on the policy to link it to any table you have. For more information, please check:`,
		);
	}

	assertUnreachable(warning.type);
};

export const sqliteSchemaError = (error: SqliteSchemaError): string => {
	if (error.type === 'conflict_table') {
		return `'${error.table}' table name is a duplicate`;
	}

	if (error.type === 'conflict_check') {
		return `'${error.name}' check constraint name is a duplicate`;
	}

	if (error.type === 'conflict_unique') {
		return `'${error.name}' unique constraint name is a duplicate`;
	}

	if (error.type === 'conflict_view') {
		return `'${error.view}' view name is a duplicate`;
	}

	// assertUnreachable(error.type)
	return '';
};

function formatOptionChanges(
	oldState: Record<string, string | boolean | number | null> | null,
	newState: Record<string, string | boolean | number | null> | null,
): string {
	if (oldState === null && newState) {
		const keys = Object.keys(newState) as Array<keyof View['with']>;
		return keys
			.map((key) => `${key}: null -> ${key}: ${String(newState[key])}`)
			.join('\n');
	}

	if (newState === null && oldState) {
		const keys = Object.keys(oldState) as Array<keyof View['with']>;
		return keys
			.map((key) => `${key}: ${String(oldState[key])} -> ${key}: null`)
			.join('\n');
	}

	if (oldState && newState) {
		const keys = Object.keys(newState) as Array<keyof View['with']>;
		return keys
			.filter((key) => oldState[key] !== newState[key])
			.map((key) => `${key}: ${String(oldState[key])} -> ${key}: ${String(newState[key])}`)
			.join('\n');
	}

	return '';
}

export const explain = (
	dialect: 'postgres' | 'mysql' | 'sqlite' | 'singlestore' | 'mssql' | 'common' | 'gel' | 'cockroach',
	grouped: {
		jsonStatement: StatementPostgres | StatementSqlite | StatementMysql | StatementMssql | StatementCockraoch;
		sqlStatements: string[];
	}[],
	explain: boolean,
	hints: { hint: string; statement?: string }[],
) => {
	const res = [];
	const explains = [];
	for (const { jsonStatement, sqlStatements } of grouped) {
		const res = dialect === 'postgres'
			? psqlExplain(jsonStatement as StatementPostgres)
			: dialect === 'sqlite'
			? sqliteExplain(jsonStatement as StatementSqlite)
			: dialect === 'mysql'
			? mysqlExplain(jsonStatement as StatementMysql)
			: dialect === 'mssql'
			? mssqlExplain(jsonStatement as StatementMssql)
			: dialect === 'cockroach'
			? cockroachExplain(jsonStatement as StatementCockraoch)
			: null;

		if (res) {
			let msg = `┌─── ${res.title}\n`;
			msg += res.cause;
			msg += `├───\n`;
			for (const sql of sqlStatements) {
				msg += `│ ${highlightSQL(sql)}\n`;
			}
			msg += `└───\n`;
			explains.push(msg);
		} else if (explain) {
			explains.push(...sqlStatements.map((x) => highlightSQL(x)));
		}
	}

	if (explains.length > 0) {
		res.push('\n');
		if (explain) res.push(chalk.gray(`--- Generated migration statements ---\n`));
		res.push(explains.join('\n'));
	}

	if (hints.length > 0) {
		res.push('\n\n');
		res.push(withStyle.warning(`There're potential data loss statements:\n`));

		for (const h of hints) {
			res.push(h.hint);
			res.push('\n');
			if (h.statement) res.push(highlightSQL(h.statement), '\n');
		}
	}
	return res.join('');
};

export const psqlExplain = (st: StatementPostgres) => {
	let title = '';
	let cause = '';

	if (st.type === 'alter_column') {
		const r = st.to;
		const d = st.diff;

		const key = `${r.schema}.${r.table}.${r.name}`;
		title += `${key} column changed:`;
		if (d.default) cause += `│ default: ${d.default.from} -> ${d.default.to}\n`;
		if (d.type) cause += `│ type: ${d.type.from} -> ${d.type.to}\n`;
		if (d.notNull) cause += `│ notNull: ${d.notNull.from} -> ${d.notNull.to}\n`;
		if (d.dimensions) cause += `│ dimensions: ${d.dimensions.from} -> ${d.dimensions.to}\n`;

		// TODO check manually
		if (d.identity) cause += `│ identity: ${formatOptionChanges(d.identity.from, d.identity.to)}\n`;
	}

	if (st.type === 'recreate_column') {
		const { diff: d } = st;

		const key = `${d.$right.schema}.${d.$right.table}.${d.$right.name}`;
		title += `${key} column recreated:`;
		if (d.generated) {
			const from = d.generated.from ? `${d.generated.from.as} ${d.generated.from.type}` : 'null';
			const to = d.generated.to ? `${d.generated.to.as} ${d.generated.to.type}` : 'null';
			cause += `│ generated: ${from} -> ${to}\n`;
		}
	}

	if (st.type === 'recreate_index') {
		const diff = st.diff;
		const idx = diff.$right;
		const key = `${idx.schema}.${idx.table}.${idx.name}`;
		title += `${key} index changed:`;
		if (diff.isUnique) cause += `│ unique: ${diff.isUnique.from} -> ${diff.isUnique.to}\n`;
		if (diff.where) cause += `│ where: ${diff.where.from} -> ${diff.where.to}\n`;
		if (diff.method) cause += `│ where: ${diff.method.from} -> ${diff.method.to}\n`;
	}

	if (st.type === 'recreate_fk') {
		const { fk, diff } = st;
		const key = `${fk.schema}.${fk.table}.${fk.name}`;
		title += `${key} index changed:`;
		if (diff.onUpdate) cause += `│ where: ${diff.onUpdate.from} -> ${diff.onUpdate.to}\n`;
		if (diff.onDelete) cause += `│ onDelete: ${diff.onDelete.from} -> ${diff.onDelete.to}\n`;
	}

	if (st.type === 'recreate_enum') {
		const { to, from } = st;
		title = `${to.schema}.${to.name} enum changed:`;
		cause += `│ values shuffled/removed: [${from.values.join(',')}] -> [${to.values.join(',')}]\n`;
	}

	if (st.type === 'alter_enum') {
		const r = st.to;
		const l = st.from;
		const d = st.diff;

		title = `${r.schema}.${r.name} enum changed:`;
		cause += `│ changes: [${r.values.join(',')}] -> [${l.values.join(',')}]\n`;
		cause += `│ values added: ${d.filter((it) => it.type === 'added').map((it) => it.value).join(',')}\n`;
	}

	if (st.type === 'alter_role') {
		const d = st.diff;
		const to = st.role;

		const key = `${to.name}`;
		title = `${key} role changed:`;
		if (d.bypassRls) cause += `│ bypassRls: ${d.bypassRls.from} -> ${d.bypassRls.to}\n`;
		if (d.canLogin) cause += `│ canLogin: ${d.canLogin.from} -> ${d.canLogin.to}\n`;
		if (d.connLimit) cause += `│ connLimit: ${d.connLimit.from} -> ${d.connLimit.to}\n`;
		if (d.createDb) cause += `│ createDb: ${d.createDb.from} -> ${d.createDb.to}\n`;
		if (d.createRole) cause += `│ createRole: ${d.createRole.from} -> ${d.createRole.to}\n`;
		if (d.inherit) cause += `│ inherit: ${d.inherit.from} -> ${d.inherit.to}\n`;
		if (d.password) cause += `│ password: ${d.password.from} -> ${d.password.to}\n`;
		if (d.replication) cause += `│ replication: ${d.replication.from} -> ${d.replication.to}\n`;
		if (d.superuser) cause += `│ superuser: ${d.superuser.from} -> ${d.superuser.to}\n`;
		if (d.validUntil) cause += `│ validUntil: ${d.validUntil.from} -> ${d.validUntil.to}\n`;
	}

	if (st.type === 'alter_sequence') {
		const d = st.diff;
		const to = st.sequence;

		const key = `${to.schema}.${to.name}`;
		title = `${key} sequence changed:`;
		if (d.cacheSize) cause += `│ cacheSize: ${d.cacheSize.from} -> ${d.cacheSize.to}\n`;
		if (d.cycle) cause += `│ cycle: ${d.cycle.from} -> ${d.cycle.to}\n`;
		if (d.incrementBy) cause += `│ incrementBy: ${d.incrementBy.from} -> ${d.incrementBy.to}\n`;
		if (d.maxValue) cause += `│ maxValue: ${d.maxValue.from} -> ${d.maxValue.to}\n`;
		if (d.minValue) cause += `│ minValue: ${d.minValue.from} -> ${d.minValue.to}\n`;
		if (d.startWith) cause += `│ startWith: ${d.startWith.from} -> ${d.startWith.to}\n`;
	}

	if (st.type === 'alter_rls') {
		const key = `${st.schema}.${st.name}`;
		title = `${key} rls changed:\n`;
		cause += `│ rlsEnabled: ${!st.isRlsEnabled} -> ${st.isRlsEnabled}\n`;
	}

	if (st.type === 'alter_policy' || st.type === 'recreate_policy') {
		const d = st.diff;
		const to = st.policy;

		const key = `${to.schema}.${to.table}.${to.name}`;
		title = `${key} policy changed:`;
		if (d.as) cause += `│ as: ${d.as.from} -> ${d.as.to}\n`;
		if (d.for) cause += `│ for: ${d.for.from} -> ${d.for.to}\n`;
		if (d.roles) cause += `│ roles: [${d.roles.from.join(',')}] -> [${d.roles.to.join(',')}]\n`;
		if (d.using) cause += `│ using: ${d.using.from} -> ${d.using.to}\n`;
		if (d.withCheck) cause += `│ withCheck: ${d.withCheck.from} -> ${d.withCheck.to}\n`;
	}

	if (st.type === 'alter_unique') {
		const d = st.diff;
		const to = d.$right;

		const key = `${to.schema}.${to.table}.${to.name}`;
		title = `${key} unique changed:`;
		if (d.nullsNotDistinct) cause += `│ nullsNotDistinct: ${d.nullsNotDistinct.from} -> ${d.nullsNotDistinct.to}\n`;
		if (d.columns) cause += `│ columns: [${d.columns.from.join(',')}] -> [${d.columns.to.join(',')}]\n`;
	}

	if (st.type === 'alter_check') {
		const d = st.diff;

		const key = `${d.schema}.${d.table}.${d.name}`;
		title = `${key} check changed:`;
		if (d.value) cause += `│ definition: ${d.value.from} -> ${d.value.to}\n`;
	}

	if (st.type === 'alter_pk') {
		const d = st.diff;

		const key = `${d.schema}.${d.table}.${d.name}`;
		title += `${key} pk changed:`;
		if (d.columns) cause += `│ columns: [${d.columns.from.join(',')}] -> [${d.columns.to.join(',')}]\n`;
	}

	if (st.type === 'alter_view') {
		const d = st.diff;

		const key = `${d.schema}.${d.name}`;
		title += `${key} view changed:`;
		// This should trigger recreate_view
		// if (d.definition) msg += `│ definition: ${d.definition.from} -> ${d.definition.to}\n`;

		// TODO alter materialized? Should't it be recreate?
		if (d.materialized) cause += `│ materialized: ${d.materialized.from} -> ${d.materialized.to}\n`;

		if (d.tablespace) cause += `│ tablespace: ${d.tablespace.from} -> ${d.tablespace.to}\n`;
		if (d.using) cause += `│ using: ${d.using.from} -> ${d.using.to}\n`;
		if (d.withNoData) cause += `│ withNoData: ${d.withNoData.from} -> ${d.withNoData.to}\n`;
		if (d.with) cause += `| with: ${formatOptionChanges(d.with.from, d.with.to)}`;
	}

	if (st.type === 'drop_view' && st.cause) {
		const { cause: from, view: to } = st;

		const key = `${to.schema}.${to.name}`;
		title += `${key} view changed:`;
		cause += `│ definition: [${from.definition}] -> [${to.definition}]\n`;
	}

	if (st.type === 'regrant_privilege') {
		const { privilege, diff } = st;

		const key = `${privilege.name}`;
		title += `${key} privilege changed:`;
		if (diff.grantee) cause += `│ grantee: [${diff.grantee.from}] -> [${diff.grantee.to}]\n`;
		if (diff.grantor) cause += `│ grantor: [${diff.grantor.from}] -> [${diff.grantor.to}]\n`;
		if (diff.isGrantable) cause += `│ isGrantable: [${diff.isGrantable.from}] -> [${diff.isGrantable.to}]\n`;
		if (diff.type) cause += `│ type: [${diff.type.from}] -> [${diff.type.to}]\n`;
	}

	if (title) return { title, cause };

	return null;
};

export const cockroachExplain = (st: StatementCockraoch) => {
	let title = '';
	let cause = '';

	if (st.type === 'alter_column') {
		const r = st.to;
		const d = st.diff;

		const key = `${r.schema}.${r.table}.${r.name}`;
		title += `${key} column changed:`;
		if (d.default) cause += `│ default: ${d.default.from} -> ${d.default.to}\n`;
		if (d.type) cause += `│ type: ${d.type.from} -> ${d.type.to}\n`;
		if (d.notNull) cause += `│ notNull: ${d.notNull.from} -> ${d.notNull.to}\n`;
		if (d.dimensions) cause += `│ dimensions: ${d.dimensions.from} -> ${d.dimensions.to}\n`;

		// TODO check manually
		if (d.identity) cause += `│ identity: ${formatOptionChanges(d.identity.from, d.identity.to)}\n`;
	}

	if (st.type === 'recreate_column') {
		const { diff: d } = st;

		const key = `${d.$right.schema}.${d.$right.table}.${d.$right.name}`;
		title += `${key} column recreated:`;
		if (d.generated) {
			const from = d.generated.from ? `${d.generated.from.as} ${d.generated.from.type}` : 'null';
			const to = d.generated.to ? `${d.generated.to.as} ${d.generated.to.type}` : 'null';
			cause += `│ generated: ${from} -> ${to}\n`;
		}
	}

	if (st.type === 'recreate_index') {
		const diff = st.diff;
		const idx = diff.$right;
		const key = `${idx.schema}.${idx.table}.${idx.name}`;
		title += `${key} index changed:`;
		if (diff.isUnique) cause += `│ unique: ${diff.isUnique.from} -> ${diff.isUnique.to}\n`;
		if (diff.where) cause += `│ where: ${diff.where.from} -> ${diff.where.to}\n`;
		if (diff.method) cause += `│ method: ${diff.method.from} -> ${diff.method.to}\n`;
	}

	if (st.type === 'recreate_fk') {
		const { fk, diff } = st;
		const key = `${fk.schema}.${fk.table}.${fk.name}`;
		title += `${key} index changed:`;
		if (diff.onUpdate) cause += `│ where: ${diff.onUpdate.from} -> ${diff.onUpdate.to}\n`;
		if (diff.onDelete) cause += `│ onDelete: ${diff.onDelete.from} -> ${diff.onDelete.to}\n`;
	}

	if (st.type === 'recreate_enum') {
		const { to, from } = st;
		title = `${to.schema}.${to.name} enum changed:`;
		cause += `│ values shuffled/removed: [${from.values.join(',')}] -> [${to.values.join(',')}]\n`;
	}

	if (st.type === 'alter_enum') {
		const r = st.to;
		const l = st.from;
		const d = st.diff;

		title = `${r.schema}.${r.name} enum changed:`;
		cause += `│ changes: [${r.values.join(',')}] -> [${l.values.join(',')}]\n`;
		cause += `│ values added: ${d.filter((it) => it.type === 'added').map((it) => it.value).join(',')}\n`;
	}

	if (st.type === 'alter_role') {
		const d = st.diff;
		const to = st.role;

		const key = `${to.name}`;
		title = `${key} role changed:`;
		if (d.createDb) cause += `│ createDb: ${d.createDb.from} -> ${d.createDb.to}\n`;
		if (d.createRole) cause += `│ createRole: ${d.createRole.from} -> ${d.createRole.to}\n`;
	}

	if (st.type === 'alter_sequence') {
		const d = st.diff;
		const to = st.sequence;

		const key = `${to.schema}.${to.name}`;
		title = `${key} sequence changed:`;
		if (d.cacheSize) cause += `│ cacheSize: ${d.cacheSize.from} -> ${d.cacheSize.to}\n`;
		if (d.incrementBy) cause += `│ incrementBy: ${d.incrementBy.from} -> ${d.incrementBy.to}\n`;
		if (d.maxValue) cause += `│ maxValue: ${d.maxValue.from} -> ${d.maxValue.to}\n`;
		if (d.minValue) cause += `│ minValue: ${d.minValue.from} -> ${d.minValue.to}\n`;
		if (d.startWith) cause += `│ startWith: ${d.startWith.from} -> ${d.startWith.to}\n`;
	}

	if (st.type === 'alter_rls') {
		const key = `${st.schema}.${st.name}`;
		title = `${key} rls changed:\n`;
		cause += `│ rlsEnabled: ${!st.isRlsEnabled} -> ${st.isRlsEnabled}\n`;
	}

	if (st.type === 'alter_policy' || st.type === 'recreate_policy') {
		const d = st.diff;
		const to = st.policy;

		const key = `${to.schema}.${to.table}.${to.name}`;
		title = `${key} policy changed:`;
		if (d.as) cause += `│ as: ${d.as.from} -> ${d.as.to}\n`;
		if (d.for) cause += `│ for: ${d.for.from} -> ${d.for.to}\n`;
		if (d.roles) cause += `│ roles: [${d.roles.from.join(',')}] -> [${d.roles.to.join(',')}]\n`;
		if (d.using) cause += `│ using: ${d.using.from} -> ${d.using.to}\n`;
		if (d.withCheck) cause += `│ withCheck: ${d.withCheck.from} -> ${d.withCheck.to}\n`;
	}

	if (st.type === 'alter_check') {
		const d = st.diff;

		const key = `${d.schema}.${d.table}.${d.name}`;
		title = `${key} check changed:`;
		if (d.value) cause += `│ definition: ${d.value.from} -> ${d.value.to}\n`;
	}

	if (st.type === 'alter_pk') {
		const d = st.diff;

		const key = `${d.schema}.${d.table}.${d.name}`;
		title += `${key} pk changed:`;
		if (d.columns) cause += `│ columns: [${d.columns.from.join(',')}] -> [${d.columns.to.join(',')}]\n`;
	}

	if (st.type === 'recreate_view') {
		const { from, to } = st;

		const key = `${to.schema}.${to.name}`;
		title += `${key} view changed:`;
		cause += `│ definition: [${from.definition}] -> [${to.definition}]\n`;
	}

	if (title) return { title, cause };

	return null;
};

export const mysqlExplain = (
	st: StatementMysql,
) => {
	let title = '';
	let cause = '';

	if (st.type === 'alter_column') {
		const r = st.diff.$right;
		const d = st.diff;

		const key = `${r.table}.${r.name}`;
		title += `${key} column changed:\n`;
		if (d.default) cause += `│ default: ${d.default.from} -> ${d.default.to}\n`;
		if (d.type) cause += `│ type: ${d.type.from} -> ${d.type.to}\n`;
		if (d.notNull) cause += `│ notNull: ${d.notNull.from} -> ${d.notNull.to}\n`;
		if (d.autoIncrement) cause += `│ autoIncrement: ${d.autoIncrement.from} -> ${d.autoIncrement.to}\n`;
		if (d.charSet) cause += `│ charSet: ${d.charSet.from} -> ${d.charSet.to}\n`;
		if (d.collation) cause += `│ collation: ${d.collation.from} -> ${d.collation.to}\n`;
		if (d.onUpdateNow) cause += `│ onUpdateNow: ${d.onUpdateNow.from} -> ${d.onUpdateNow.to}\n`;
		if (d.onUpdateNowFsp) cause += `│ onUpdateNowFsp: ${d.onUpdateNowFsp.from} -> ${d.onUpdateNowFsp.to}\n`;
	}

	if (st.type === 'recreate_column') {
		const { column, diff } = st;

		const key = `${column.table}.${column.name}`;
		title += `${key} column recreated:\n`;
		if (diff.generated) {
			const from = diff.generated.from ? `${diff.generated.from.as} ${diff.generated.from.type}` : 'null';
			const to = diff.generated.to ? `${diff.generated.to.as} ${diff.generated.to.type}` : 'null';
			cause += `│ generated: ${from} -> ${to}\n`;
		}
	}

	if (st.type === 'alter_view') {
		const { diff, view } = st;

		const key = `${view.name}`;
		title += `${key} view changed:\n`;
		if (diff.algorithm) cause += `│ algorithm: ${diff.algorithm.from} -> ${diff.algorithm.to}\n`;
		if (diff.definition) cause += `│ definition: ${diff.definition.from} -> ${diff.definition.to}\n`;
		if (diff.sqlSecurity) cause += `│ sqlSecurity: ${diff.sqlSecurity.from} -> ${diff.sqlSecurity.to}\n`;
		if (diff.withCheckOption) {
			cause += `│ withCheckOption: ${diff.withCheckOption.from} -> ${diff.withCheckOption.to}\n`;
		}
	}

	if (title) return { title, cause };

	return null;
};

export const mssqlExplain = (
	st: StatementMssql,
) => {
	let title = '';
	let cause = '';

	if (st.type === 'alter_column') {
		const r = st.diff.$right;
		const d = st.diff;

		const key = `${r.schema}.${r.table}.${r.name}`;
		title += `${key} column changed:\n`;
		if (d.type) cause += `│ type: ${d.type.from} -> ${d.type.to}\n`;
		if (d.notNull) cause += `│ notNull: ${d.notNull.from} -> ${d.notNull.to}\n`;
	}

	if (st.type === 'recreate_column') {
		const { diff } = st;

		const key = `${diff.$right.schema}.${diff.$right.table}.${diff.$right.name}`;
		title += `${key} column recreated:\n`;
		if (diff.generated) {
			const from = diff.generated.from ? `${diff.generated.from.as} ${diff.generated.from.type}` : 'null';
			const to = diff.generated.to ? `${diff.generated.to.as} ${diff.generated.to.type}` : 'null';
			cause += `│ generated: ${from} -> ${to}\n`;
		}
	}
	if (st.type === 'recreate_identity_column') {
		const { column } = st;

		const key = `${column.$right.schema}.${column.$right.table}.${column.$right.name}`;
		title += `${key} column recreated:\n`;
		if (column.identity) {
			const from = column.identity.from ? `${column.identity.from.increment} ${column.identity.from.seed}` : 'null';
			const to = column.identity.to ? `${column.identity.to.increment} ${column.identity.to.seed}` : 'null';
			cause += `│ identity: ${from} -> ${to}\n`;
		}
	}

	if (st.type === 'alter_view') {
		const { diff, view } = st;

		const key = `${view.schema}.${view.name}`;
		title += `${key} view changed:\n`;
		if (diff.checkOption) cause += `│ checkOption: ${diff.checkOption.from} -> ${diff.checkOption.to}\n`;
		if (diff.definition) cause += `│ definition: ${diff.definition.from} -> ${diff.definition.to}\n`;
		if (diff.encryption) cause += `│ encryption: ${diff.encryption.from} -> ${diff.encryption.to}\n`;
		if (diff.schemaBinding) {
			cause += `│ schemaBinding: ${diff.schemaBinding.from} -> ${diff.schemaBinding.to}\n`;
		}
		if (diff.viewMetadata) {
			cause += `│ viewMetadata: ${diff.viewMetadata.from} -> ${diff.viewMetadata.to}\n`;
		}
	}

	if (st.type === 'recreate_default') {
		const { from, to } = st;

		const key = `${to.schema}.${to.name}`;
		title += `${key} default changed:\n`;
		cause += `│ default: ${from.default} -> ${to.default}\n`;
	}

	if (title) return { title, cause };

	return null;
};

export const sqliteExplain = (
	st: StatementSqlite,
) => {
	let title = '';
	let cause = '';

	if (st.type === 'recreate_table') {
		const {
			to,
			alteredColumnsBecameGenerated,
			checkDiffs,
			checksAlters,
			columnAlters,
			fksAlters,
			fksDiff,
			indexesDiff,
			newStoredColumns,
			pksAlters,
			pksDiff,
			uniquesAlters,
			uniquesDiff,
		} = st;

		const key = `${to.name}`;

		title += `${key} table recreated:\n`;

		const blocks: string[][] = [];

		if (alteredColumnsBecameGenerated.length) {
			blocks.push([
				`│ Columns become generated stored: ${alteredColumnsBecameGenerated.map((it) => `${it.name}`).join(', ')}\n`,
				`│ It is not possible to make existing column as generated STORED\n`,
			]);
		}

		if (checkDiffs.length) {
			const createdChecks = checkDiffs.filter((it) => it.$diffType === 'create');
			const droppedChecks = checkDiffs.filter((it) => it.$diffType === 'drop');

			if (createdChecks.length) {
				blocks.push([`| Check constraints added: ${createdChecks.map((it) => `${it.name}`).join(', ')}\n`]);
			}

			if (droppedChecks.length) {
				blocks.push([`| Check constraints dropped: ${droppedChecks.map((it) => `${it.name}`).join(', ')}\n`]);
			}
		}

		if (checksAlters.length) {
			blocks.push([
				`│ Check constraints altered definition:\n`,
				`│ ${checksAlters.map((it) => `${it.name}: ${it.$left.value} -> ${it.$right.value}`).join(',\n')}\n`,
			]);
		}

		if (columnAlters.filter((it) => it.type || it.default || it.autoincrement || it.notNull).length) {
			let res: string = '';
			const alteredNotNull = columnAlters.filter((it) => it.notNull);
			const alteredType = columnAlters.filter((it) => it.type);
			const alteredDefault = columnAlters.filter((it) => it.default);
			const alteredAutoincrement = columnAlters.filter((it) => it.autoincrement);

			res += `│ Columns altered:\n`;
			if (alteredNotNull.length) {
				res += `${
					alteredNotNull.map((it) => `│ ${it.name} => notNull: ${it.notNull?.from} -> ${it.notNull?.to}`).join(
						'\n',
					)
				}\n`;
			}
			if (alteredType.length) {
				res += `${alteredType.map((it) => `│ ${it.name} => type: ${it.type?.from} -> ${it.type?.to}`).join('\n')}\n`;
			}
			if (alteredDefault.length) {
				res += `${
					alteredDefault.map((it) => `│ ${it.name} => default: ${it.default?.from} -> ${it.default?.to}`).join(
						'\n',
					)
				}\n`;
			}
			if (alteredAutoincrement.length) {
				res += `${
					alteredAutoincrement.map((it) =>
						`│ ${it.name} => autoincrement: ${it.autoincrement?.from} -> ${it.autoincrement?.to}`
					).join('\n')
				}\n`;
			}

			blocks.push([res]);
		}

		if (uniquesDiff.length) {
			const uniquesCreated = uniquesDiff.filter((it) => it.$diffType === 'create');
			const uniquesDropped = uniquesDiff.filter((it) => it.$diffType === 'drop');
			if (uniquesCreated.length) {
				blocks.push([`│ Unique constraints added: ${uniquesCreated.map((it) => `${it.name}`).join(', ')}\n`]);
			}
			if (uniquesDropped.length) {
				blocks.push([`│ Unique constraints dropped: ${uniquesDropped.map((it) => `${it.name}`).join(', ')}\n`]);
			}
		}

		if (pksDiff.length) {
			const pksCreated = pksDiff.filter((it) => it.$diffType === 'create');
			const pksDropped = pksDiff.filter((it) => it.$diffType === 'drop');

			if (pksCreated.length) {
				blocks.push([`│ Primary key constraints added: ${pksCreated.map((it) => `${it.name}`).join(', ')}\n`]);
			}
			if (pksDropped.length) {
				blocks.push([`│ Primary key constraints dropped: ${pksDropped.map((it) => `${it.name}`).join(', ')}\n`]);
			}
		}

		if (newStoredColumns.length) {
			blocks.push([
				`| Stored columns added: ${newStoredColumns.map((it) => `${it.name}`).join(', ')}\n`,
			]);
		}

		if (pksAlters.length) {
			blocks.push([
				`│ Primary key was altered:\n`,
				`${
					pksAlters.filter((it) => it.columns).map((it) =>
						`[${it.columns?.from.join(',')}] -> [${it.columns?.to.join(',')}]\n`
					)
				}\n`,
			]);
		}

		if (uniquesAlters.length) {
			blocks.push([
				`│ Unique constraint was altered:\n`,
				`${
					uniquesAlters.filter((it) => it.columns).map((it) =>
						`│ name: ${it.name} => columns: [${it.columns?.from.join(',')}] -> [${it.columns?.to.join(',')}]\n`
					)
				}\n`,
			]);
		}

		if (fksAlters.length) {
			let res: string = '';

			const columnsAltered = fksAlters.filter((it) => it.columns);
			const columnsToAltered = fksAlters.filter((it) => it.columnsTo);
			const tablesToAltered = fksAlters.filter((it) => it.tableTo);
			const onUpdateAltered = fksAlters.filter((it) => it.onUpdate);
			const onDeleteAltered = fksAlters.filter((it) => it.onDelete);

			res += columnsAltered.length > 0 && columnsToAltered.length > 0 && tablesToAltered.length > 0
					&& onUpdateAltered.length > 0 && onDeleteAltered.length > 0
				? `│ Foreign key constraint was altered:\n`
				: '';
			if (columnsAltered.length) {
				res += `${
					columnsAltered.map((it) =>
						`│ name: ${it.name} => columns: [${it.columns?.from.join(',')}] -> [${it.columns?.to.join(',')}]`
					)
				}\n`;
			}
			if (columnsToAltered.length) {
				res += ` ${
					columnsToAltered.map((it) =>
						`│ name: ${it.name} => columnsTo: [${it.columnsTo?.from.join(',')}] -> [${it.columnsTo?.to.join(',')}]`
					)
				}\n`;
			}
			if (tablesToAltered.length) {
				res += `${
					tablesToAltered.map((it) => `│ name: ${it.name} => tableTo: [${it.tableTo?.from}] -> [${it.tableTo?.to}]`)
				}\n`;
			}
			if (onUpdateAltered.length) {
				res += `${
					onUpdateAltered.map((it) => `│ name: ${it.name} => onUpdate: [${it.onUpdate?.from}] -> [${it.onUpdate?.to}]`)
				}\n`;
			}
			if (onDeleteAltered.length) {
				res += `${
					onDeleteAltered.map((it) => `│ name: ${it.name} => onDelete: [${it.onDelete?.from}] -> [${it.onDelete?.to}]`)
				}\n`;
			}

			if (res) blocks.push([res]);
		}

		if (fksDiff.length) {
			const fksCreated = fksDiff.filter((it) => it.$diffType === 'create');
			const fksDropped = fksDiff.filter((it) => it.$diffType === 'drop');
			if (fksCreated.length) {
				blocks.push([`| Foreign key constraints added: ${fksCreated.map((it) => `${it.name}`).join(', ')}\n`]);
			}
			if (fksDropped.length) {
				blocks.push([`| Foreign key constraints dropped: ${fksDropped.map((it) => `${it.name}`).join(', ')}\n`]);
			}
		}

		if (indexesDiff.filter((it) => it.isUnique && it.origin === 'auto').length) {
			const indexCreated = indexesDiff.filter((it) => it.$diffType === 'create');
			const indexDropped = indexesDiff.filter((it) => it.$diffType === 'drop');
			if (indexCreated.length) {
				blocks.push([`| System generated index added: ${indexCreated.map((it) => `${it.name}`).join(', ')}\n`]);
			}
			if (indexDropped.length) {
				blocks.push([`| System generated index dropped: ${indexDropped.map((it) => `${it.name}`).join(', ')}\n`]);
			}
		}

		cause += blocks.map((it) => it.join('')).join('├─\n');
	}

	if (st.type === 'recreate_column') {
		const {
			column,
			diffGenerated,
		} = st;

		const key = `${column.name}`;

		title += `${key} column recreated:\n`;

		cause += `| generated: ${
			diffGenerated && diffGenerated.from ? diffGenerated.from.as + ' ' + diffGenerated.from.type : 'null'
		} -> ${diffGenerated && diffGenerated.to ? diffGenerated.to.as + ' ' + diffGenerated.to.type : 'null'}`;
	}

	if (title) return { title, cause };

	return null;
};

export const postgresSchemaError = (error: PostgresSchemaError): string => {
	if (error.type === 'constraint_name_duplicate') {
		const { name, schema, table } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		const constraintName = chalk.underline.blue(`'${name}'`);
		return withStyle.errorWarning(
			`There's a duplicate constraint name ${constraintName} in ${tableName} table`,
		);
	}

	if (error.type === 'index_duplicate') {
		// check for index names duplicates
		const { schema, table, name } = error;
		const sch = chalk.underline.blue(`"${schema}"`);
		const idx = chalk.underline.blue(`'${name}'`);
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		return withStyle.errorWarning(
			`There's a duplicate index name ${idx} in ${sch} schema in ${tableName}`,
		);
	}

	if (error.type === 'index_no_name') {
		const { schema, table, sql } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		return withStyle.errorWarning(
			`Please specify an index name in ${tableName} table that has "${sql}" expression.\n\nWe can generate index names for indexes on columns only; for expressions in indexes, you need to specify index name yourself.`,
		);
	}

	if (error.type === 'pgvector_index_noop') {
		const { table, indexName, column, method } = error;
		return withStyle.errorWarning(
			`You are specifying an index on the ${
				chalk.blueBright(
					column,
				)
			} column inside the ${
				chalk.blueBright(
					table,
				)
			} table with the ${
				chalk.blueBright(
					'vector',
				)
			} type without specifying an operator class. Vector extension doesn't have a default operator class, so you need to specify one of the available options. Here is a list of available op classes for the vector extension: [${
				vectorOps
					.map((it) => `${chalk.underline(`${it}`)}`)
					.join(', ')
			}].\n\nYou can specify it using current syntax: ${
				chalk.underline(
					`index("${indexName}").using("${method}", table.${column}.op("${vectorOps[0]}"))`,
				)
			}\n\nYou can check the "pg_vector" docs for more info: https://github.com/pgvector/pgvector?tab=readme-ov-file#indexing\n`,
		);
	}

	if (error.type === 'policy_duplicate') {
		const { schema, table, policy } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);

		return withStyle.errorWarning(
			`We've found duplicated policy name across ${tableName} table. Please rename one of the policies with ${
				chalk.underline.blue(
					policy,
				)
			} name`,
		);
	}

	if (error.type === 'view_name_duplicate') {
		const schema = chalk.underline.blue(error.schema ?? 'public');
		const name = chalk.underline.blue(error.name);
		return withStyle.errorWarning(
			`There's a view duplicate name ${name} in ${schema} schema`,
		);
	}

	if (error.type === 'sequence_name_duplicate') {
		return withStyle.errorWarning(`There's a sequence name duplicate '${error.name}' in '${error.schema}' schema`);
	}

	// assertUnreachable(error);
	return '';
};

export const cockraochSchemaError = (error: CockroachSchemaError): string => {
	if (error.type === 'constraint_name_duplicate') {
		const { name, schema, table } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		const constraintName = chalk.underline.blue(`'${name}'`);
		return withStyle.errorWarning(
			`There's a duplicate constraint name ${constraintName} in ${tableName} table`,
		);
	}

	if (error.type === 'index_duplicate') {
		// check for index names duplicates
		const { schema, table, name } = error;
		const sch = chalk.underline.blue(`"${schema}"`);
		const idx = chalk.underline.blue(`'${name}'`);
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		return withStyle.errorWarning(
			`There's a duplicate index name ${idx} in ${sch} schema in ${tableName}`,
		);
	}

	if (error.type === 'index_no_name') {
		const { schema, table, sql } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		return withStyle.errorWarning(
			`Please specify an index name in ${tableName} table that has "${sql}" expression.\n\nWe can generate index names for indexes on columns only; for expressions in indexes, you need to specify index name yourself.`,
		);
	}

	if (error.type === 'pgvector_index_noop') {
		const { table, indexName, column, method } = error;
		return withStyle.errorWarning(
			`You are specifying an index on the ${
				chalk.blueBright(
					`"${column}"`,
				)
			} column inside the ${
				chalk.blueBright(
					`"${table}"`,
				)
			} table with the ${
				chalk.blueBright(
					'vector',
				)
			} type without specifying an operator class. Vector extension doesn't have a default operator class, so you need to specify one of the available options. Here is a list of available op classes for the vector extension: [${
				vectorOps
					.map((it) => `${chalk.underline(`${it}`)}`)
					.join(', ')
			}].\n\nYou can specify it using current syntax: ${
				chalk.underline(
					`index("${indexName}").using("${method}", table.${column}.op("${vectorOps[0]}"))`,
				)
			}\n\nYou can check the "pg_vector" docs for more info: https://github.com/pgvector/pgvector?tab=readme-ov-file#indexing\n`,
		);
	}

	if (error.type === 'policy_duplicate') {
		const { schema, table, policy } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);

		return withStyle.errorWarning(
			`We've found duplicated policy name across ${tableName} table. Please rename one of the policies with ${
				chalk.underline.blue(
					`"${policy}"`,
				)
			} name`,
		);
	}

	if (error.type === 'view_name_duplicate') {
		const schema = chalk.underline.blue(`"${error.schema ?? 'public'}"`);
		const name = chalk.underline.blue(`"${error.name}"`);
		return withStyle.errorWarning(
			`There's a view duplicate name ${name} in ${schema} schema`,
		);
	}

	if (error.type === 'sequence_name_duplicate') {
		return withStyle.errorWarning(`There's a sequence name duplicate '${error.name}' in '${error.schema}' schema`);
	}

	if (error.type === 'column_name_duplicate') {
		const { name, schema, table } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		const columnName = chalk.underline.blue(`'${name}'`);
		return withStyle.errorWarning(
			`There's a duplicate column name ${columnName} in ${tableName} table`,
		);
	}

	if (error.type === 'enum_name_duplicate') {
		const { name, schema } = error;
		const schemaName = chalk.underline.blue(`"${schema}"`);
		const enumName = chalk.underline.blue(`'${name}'`);
		return withStyle.errorWarning(
			`There's a duplicate enum name ${enumName} in ${schemaName} schema`,
		);
	}

	if (error.type === 'table_name_duplicate') {
		const { name, schema } = error;
		const schemaName = chalk.underline.blue(`"${schema}"`);
		const tableName = chalk.underline.blue(`"${name}"`);
		return withStyle.errorWarning(
			`There's a duplicate table name ${tableName} in ${schemaName} schema`,
		);
	}

	if (error.type === 'schema_name_duplicate') {
		const { name } = error;
		const schemaName = chalk.underline.blue(`"${name}"`);
		return withStyle.errorWarning(
			`There's a duplicate schema name ${schemaName}`,
		);
	}

	if (error.type === 'role_duplicate') {
		const { name } = error;
		const roleName = chalk.underline.blue(`"${name}"`);
		return withStyle.errorWarning(
			`There's a duplicate role name ${roleName}`,
		);
	}
	return '';
};

export const mysqlSchemaError = (error: MysqlSchemaError): string => {
	if (error.type === 'column_name_conflict') {
		const { name, table } = error;
		const tableName = chalk.underline.blue(`\`${table}\``);
		const columnName = chalk.underline.blue(`\`${name}\``);
		return withStyle.errorWarning(
			`There's a duplicate column name ${columnName} in ${tableName} table`,
		);
	}

	if (error.type === 'table_name_conflict') {
		const { name: table } = error;
		const tableName = chalk.underline.blue(`\`${table}\``);
		return withStyle.errorWarning(
			`There's a duplicate table name ${tableName}`,
		);
	}

	if (error.type === 'column_unsupported_unique') {
		const { table, columns } = error;
		const tableName = chalk.underline.blue(`\`${table}\``);
		const columnsName = chalk.underline.blue(`\`${columns.join('`, `')}\``);

		const warningText = `You tried to add${columns.length > 1 ? ` COMPOSITE` : ''} UNIQUE on ${columnsName} ${
			columns.length > 1 ? 'columns' : 'column'
		} in ${tableName} table
It's not currently possible to create a UNIQUE constraint on BLOB/TEXT column type.
To enforce uniqueness, create a UNIQUE INDEX instead, specifying a prefix length with sql\`\`
Ex. 
const users = mysqlTable('users', {
	username: text()
}, (t) => [${chalk.underline.green('uniqueIndex("name").on(sql`username(10)`)')}]`;

		return withStyle.errorWarning(warningText);
	}

	if (error.type === 'column_unsupported_default_on_autoincrement') {
		const { table, column } = error;
		const tableName = chalk.underline.blue(`\`${table}\``);
		const columnName = chalk.underline.blue(`\`${column}\``);

		const warningText =
			`You tried to add DEFAULT value to ${columnName} in ${tableName}. AUTO_INCREMENT or SERIAL automatically generate their values. You can not set a default for it`;

		return withStyle.errorWarning(warningText);
	}

	assertUnreachable(error);
	return '';
};

export const mssqlSchemaError = (error: MssqlSchemaError): string => {
	if (error.type === 'constraint_duplicate') {
		const { name, schema } = error;
		const constraintName = chalk.underline.blue(`'${name}'`);
		const schemaName = chalk.underline.blue(`'${schema}'`);

		return withStyle.errorWarning(
			`There's a duplicate constraint name ${constraintName} across ${schemaName} schema`,
		);
	}

	if (error.type === 'index_duplicate') {
		// check for index names duplicates
		const { schema, table, name } = error;
		const sch = chalk.underline.blue(`"${schema}"`);
		const idx = chalk.underline.blue(`'${name}'`);
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		return withStyle.errorWarning(
			`There's a duplicate index name ${idx} in ${sch} schema in ${tableName}`,
		);
	}

	if (error.type === 'index_no_name') {
		const { schema, table, sql } = error;
		const tableName = chalk.underline.blue(`"${schema}"."${table}"`);
		return withStyle.errorWarning(
			`Please specify an index name in ${tableName} table that has "${sql}" expression.\n\nWe can generate index names for indexes on columns only; for expressions in indexes, you need to specify index name yourself.`,
		);
	}

	if (error.type === 'view_name_duplicate') {
		const schema = chalk.underline.blue(error.schema);
		const name = chalk.underline.blue(error.name);
		return withStyle.errorWarning(
			`There's a view duplicate name ${name} across ${schema} schema`,
		);
	}

	if (error.type === 'column_duplicate') {
		const schema = chalk.underline.blue(error.schema);
		const name = chalk.underline.blue(error.name);
		const tableName = chalk.underline.blue(`"${schema}"."${error.table}"`);
		return withStyle.errorWarning(
			`There's a column duplicate name ${name} in ${tableName} table`,
		);
	}

	if (error.type === 'schema_duplicate') {
		const schemaName = chalk.underline.blue(error.name);
		return withStyle.errorWarning(
			`There's a schema duplicate name ${schemaName}`,
		);
	}

	if (error.type === 'table_duplicate') {
		const schema = chalk.underline.blue(error.schema);
		const tableName = chalk.underline.blue(`"${schema}"."${error.name}"`);

		return withStyle.errorWarning(
			`There's a table duplicate name ${tableName} across ${schema} schema`,
		);
	}

	assertUnreachable(error);
};

export interface RenamePropmtItem<T> {
	from: T;
	to: T;
}

export const isRenamePromptItem = <T extends EntityBase>(
	item: RenamePropmtItem<T> | T,
): item is RenamePropmtItem<T> => {
	return 'from' in item && 'to' in item;
};

export class ResolveColumnSelect<T extends Named> extends Prompt<
	RenamePropmtItem<T> | T
> {
	private readonly data: SelectState<RenamePropmtItem<T> | T>;

	constructor(
		private readonly tableName: string,
		private readonly base: Named,
		data: (RenamePropmtItem<T> | T)[],
	) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.data = new SelectState(data);
		this.data.bind(this);
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '\n';
		}

		let text = `\nIs ${
			chalk.bold.blue(
				this.base.name,
			)
		} column in ${
			chalk.bold.blue(
				this.tableName,
			)
		} table created or renamed from another column?\n`;

		const isSelectedRenamed = isRenamePromptItem(
			this.data.items[this.data.selectedIdx],
		);

		const selectedPrefix = isSelectedRenamed
			? chalk.yellow('❯ ')
			: chalk.green('❯ ');

		const labelLength: number = this.data.items
			.filter((it) => isRenamePromptItem(it))
			.map((it: RenamePropmtItem<T>) => {
				return this.base.name.length + 3 + it['from'].name.length;
			})
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		this.data.items.forEach((it, idx) => {
			const isSelected = idx === this.data.selectedIdx;
			const isRenamed = isRenamePromptItem(it);
			const title = isRenamed
				? `${it.from.name} › ${it.to.name}`.padEnd(labelLength, ' ')
				: it.name.padEnd(labelLength, ' ');
			const label = isRenamed
				? `${chalk.yellow('~')} ${title} ${chalk.gray('rename column')}`
				: `${chalk.green('+')} ${title} ${chalk.gray('create column')}`;

			text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
			text += idx !== this.data.items.length - 1 ? '\n' : '';
		});
		return text;
	}

	result(): RenamePropmtItem<T> | T {
		return this.data.items[this.data.selectedIdx]!;
	}
}

export const tableKey = (it: NamedWithSchema) => {
	return it.schema === 'public' || !it.schema
		? it.name
		: `${it.schema}.${it.name}`;
};

export class ResolveSelectNamed<T extends Named> extends Prompt<
	RenamePropmtItem<T> | T
> {
	private readonly state: SelectState<RenamePropmtItem<T> | T>;

	constructor(
		private readonly base: T,
		data: (RenamePropmtItem<T> | T)[],
		private readonly entityType: 'role' | 'policy',
	) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.state = new SelectState(data);
		this.state.bind(this);
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '';
		}
		const key = this.base.name;

		let text = `\nIs ${chalk.bold.blue(key)} ${this.entityType} created or renamed from another ${this.entityType}?\n`;

		const isSelectedRenamed = isRenamePromptItem(
			this.state.items[this.state.selectedIdx],
		);

		const selectedPrefix = isSelectedRenamed
			? chalk.yellow('❯ ')
			: chalk.green('❯ ');

		const labelLength: number = this.state.items
			.filter((it) => isRenamePromptItem(it))
			.map((_) => {
				const it = _ as RenamePropmtItem<T>;
				const keyFrom = it.from.name;
				return key.length + 3 + keyFrom.length;
			})
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		const entityType = this.entityType;
		this.state.items.forEach((it, idx) => {
			const isSelected = idx === this.state.selectedIdx;
			const isRenamed = isRenamePromptItem(it);

			const title = isRenamed
				? `${it.from.name} › ${it.to.name}`.padEnd(labelLength, ' ')
				: it.name.padEnd(labelLength, ' ');

			const label = isRenamed
				? `${chalk.yellow('~')} ${title} ${chalk.gray(`rename ${entityType}`)}`
				: `${chalk.green('+')} ${title} ${chalk.gray(`create ${entityType}`)}`;

			text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
			text += idx !== this.state.items.length - 1 ? '\n' : '';
		});
		return text;
	}

	result(): RenamePropmtItem<T> | T {
		return this.state.items[this.state.selectedIdx]!;
	}
}

type EntityBase = { schema?: string; table?: string; name: string };

const keyFor = (it: EntityBase, defaultSchema: 'dbo' | 'public' = 'public') => {
	const schemaPrefix = it.schema && it.schema !== defaultSchema ? `${it.schema}.` : '';
	const tablePrefix = it.table ? `${it.table}.` : '';
	return `${schemaPrefix}${tablePrefix}${it.name}`;
};

export class ResolveSelect<T extends EntityBase> extends Prompt<
	RenamePropmtItem<T> | T
> {
	private readonly state: SelectState<RenamePropmtItem<T> | T>;

	constructor(
		private readonly base: T,
		data: (RenamePropmtItem<T> | T)[],
		private readonly entityType:
			| 'schema'
			| 'enum'
			| 'table'
			| 'column'
			| 'sequence'
			| 'view'
			| 'privilege'
			| 'policy'
			| 'role'
			| 'check'
			| 'index'
			| 'unique'
			| 'primary key'
			| 'foreign key'
			| 'default',
		private defaultSchema: 'dbo' | 'public' = 'public',
	) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.state = new SelectState(data);
		this.state.bind(this);
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '';
		}

		const key = keyFor(this.base, this.defaultSchema);
		let text = `\nIs ${chalk.bold.blue(key)} ${this.entityType} created or renamed from another ${this.entityType}?\n`;

		const isSelectedRenamed = isRenamePromptItem(
			this.state.items[this.state.selectedIdx],
		);

		const selectedPrefix = isSelectedRenamed
			? chalk.yellow('❯ ')
			: chalk.green('❯ ');

		const labelLength: number = this.state.items
			.filter((it) => isRenamePromptItem(it))
			.map((_) => {
				const it = _ as RenamePropmtItem<T>;
				const keyFrom = keyFor(it.from);
				return key.length + 3 + keyFrom.length;
			})
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		const entityType = this.entityType;
		this.state.items.forEach((it, idx) => {
			const isSelected = idx === this.state.selectedIdx;
			const isRenamed = isRenamePromptItem(it);

			const title = isRenamed
				? `${keyFor(it.from, this.defaultSchema)} › ${keyFor(it.to, this.defaultSchema)}`.padEnd(labelLength, ' ')
				: keyFor(it, this.defaultSchema).padEnd(labelLength, ' ');

			const label = isRenamed
				? `${chalk.yellow('~')} ${title} ${chalk.gray(`rename ${entityType}`)}`
				: `${chalk.green('+')} ${title} ${chalk.gray(`create ${entityType}`)}`;

			text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
			text += idx !== this.state.items.length - 1 ? '\n' : '';
		});
		return text;
	}

	result(): RenamePropmtItem<T> | T {
		return this.state.items[this.state.selectedIdx]!;
	}
}

export class ResolveSchemasSelect<T extends Named> extends Prompt<
	RenamePropmtItem<T> | T
> {
	private readonly state: SelectState<RenamePropmtItem<T> | T>;

	constructor(private readonly base: Named, data: (RenamePropmtItem<T> | T)[]) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.state = new SelectState(data);
		this.state.bind(this);
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '';
		}

		let text = `\nIs ${
			chalk.bold.blue(
				this.base.name,
			)
		} schema created or renamed from another schema?\n`;
		const isSelectedRenamed = isRenamePromptItem(
			this.state.items[this.state.selectedIdx],
		);
		const selectedPrefix = isSelectedRenamed
			? chalk.yellow('❯ ')
			: chalk.green('❯ ');

		const labelLength: number = this.state.items
			.filter((it) => isRenamePromptItem(it))
			.map((it: RenamePropmtItem<T>) => {
				return this.base.name.length + 3 + it['from'].name.length;
			})
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		this.state.items.forEach((it, idx) => {
			const isSelected = idx === this.state.selectedIdx;
			const isRenamed = isRenamePromptItem(it);
			const title = isRenamed
				? `${it.from.name} › ${it.to.name}`.padEnd(labelLength, ' ')
				: it.name.padEnd(labelLength, ' ');
			const label = isRenamed
				? `${chalk.yellow('~')} ${title} ${chalk.gray('rename schema')}`
				: `${chalk.green('+')} ${title} ${chalk.gray('create schema')}`;

			text += isSelected ? `${selectedPrefix}${label}` : `  ${label}`;
			text += idx !== this.state.items.length - 1 ? '\n' : '';
		});
		return text;
	}

	result(): RenamePropmtItem<T> | T {
		return this.state.items[this.state.selectedIdx]!;
	}
}

class Spinner {
	private offset: number = 0;
	private readonly iterator: () => void;

	constructor(private readonly frames: string[]) {
		this.iterator = () => {
			this.offset += 1;
			this.offset %= frames.length - 1;
		};
	}

	public tick = () => {
		this.iterator();
	};

	public value = () => {
		return this.frames[this.offset];
	};
}

// const frames = function(values: string[]): () => string {
// 	let index = 0;
// 	const iterator = () => {
// 		const frame = values[index];
// 		index += 1;
// 		index %= values.length;
// 		return frame!;
// 	};
// 	return iterator;
// };

type ValueOf<T> = T[keyof T];
export type IntrospectStatus = 'fetching' | 'done';
export type IntrospectStage =
	| 'tables'
	| 'columns'
	| 'enums'
	| 'indexes'
	| 'policies'
	| 'checks'
	| 'fks'
	| 'views';

type IntrospectState = {
	[key in IntrospectStage]: {
		count: number;
		name: string;
		status: IntrospectStatus;
	};
};

export class IntrospectProgress extends TaskView {
	private readonly spinner: Spinner = new Spinner('⣷⣯⣟⡿⢿⣻⣽⣾'.split(''));
	private timeout: NodeJS.Timeout | undefined;

	private state: IntrospectState = {
		tables: {
			count: 0,
			name: 'tables',
			status: 'fetching',
		},
		columns: {
			count: 0,
			name: 'columns',
			status: 'fetching',
		},
		enums: {
			count: 0,
			name: 'enums',
			status: 'fetching',
		},
		indexes: {
			count: 0,
			name: 'indexes',
			status: 'fetching',
		},
		fks: {
			count: 0,
			name: 'foreign keys',
			status: 'fetching',
		},
		policies: {
			count: 0,
			name: 'policies',
			status: 'fetching',
		},
		checks: {
			count: 0,
			name: 'check constraints',
			status: 'fetching',
		},
		views: {
			count: 0,
			name: 'views',
			status: 'fetching',
		},
	};

	constructor(private readonly hasEnums: boolean = false) {
		super();
		this.timeout = setInterval(() => {
			this.spinner.tick();
			this.requestLayout();
		}, 128);

		this.on('detach', () => clearInterval(this.timeout));
	}

	public update(
		stage: IntrospectStage,
		count: number,
		status: IntrospectStatus,
	) {
		this.state[stage].count = count;
		this.state[stage].status = status;
		this.requestLayout();
	}

	private formatCount = (count: number) => {
		const width: number = Math.max.apply(
			null,
			Object.values(this.state).map((it) => it.count.toFixed(0).length),
		);

		return count.toFixed(0).padEnd(width, ' ');
	};

	private statusText = (spinner: string, stage: ValueOf<IntrospectState>) => {
		const { name, count } = stage;
		const isDone = stage.status === 'done';

		const prefix = isDone ? `[${chalk.green('✓')}]` : `[${spinner}]`;

		const formattedCount = this.formatCount(count);
		const suffix = isDone
			? `${formattedCount} ${name} fetched`
			: `${formattedCount} ${name} fetching`;

		return `${prefix} ${suffix}\n`;
	};

	render(): string {
		let info = '';
		const spin = this.spinner.value();
		info += this.statusText(spin, this.state.tables);
		info += this.statusText(spin, this.state.columns);
		info += this.hasEnums ? this.statusText(spin, this.state.enums) : '';
		info += this.statusText(spin, this.state.indexes);
		info += this.statusText(spin, this.state.fks);
		info += this.statusText(spin, this.state.policies);
		info += this.statusText(spin, this.state.checks);
		info += this.statusText(spin, this.state.views);

		return info;
	}
}

export class MigrateProgress extends TaskView {
	private readonly spinner: Spinner = new Spinner('⣷⣯⣟⡿⢿⣻⣽⣾'.split(''));
	private timeout: NodeJS.Timeout | undefined;

	constructor() {
		super();
		this.timeout = setInterval(() => {
			this.spinner.tick();
			this.requestLayout();
		}, 128);

		this.on('detach', () => clearInterval(this.timeout));
	}

	render(status: 'pending' | 'done'): string {
		if (status === 'pending') {
			const spin = this.spinner.value();
			return `[${spin}] applying migrations...`;
		}
		return `[${chalk.green('✓')}] migrations applied successfully!`;
	}
}

export class EmptyProgressView extends TaskView {
	override render(): string {
		return '';
	}
}

export class ProgressView extends TaskView {
	private readonly spinner: Spinner = new Spinner('⣷⣯⣟⡿⢿⣻⣽⣾'.split(''));
	private timeout: NodeJS.Timeout | undefined;

	constructor(
		private readonly progressText: string,
		private readonly successText: string,
	) {
		super();
		this.timeout = setInterval(() => {
			this.spinner.tick();
			this.requestLayout();
		}, 128);

		this.on('detach', () => clearInterval(this.timeout));
	}

	render(status: 'pending' | 'done'): string {
		if (status === 'pending') {
			const spin = this.spinner.value();
			return `[${spin}] ${this.progressText}\n`;
		}
		return `[${chalk.green('✓')}] ${this.successText}\n`;
	}
}

export class DropMigrationView<T extends { tag: string }> extends Prompt<T> {
	private readonly data: SelectState<T>;

	constructor(data: T[]) {
		super();
		this.on('attach', (terminal) => terminal.toggleCursor('hide'));
		this.data = new SelectState(data);
		this.data.selectedIdx = data.length - 1;
		this.data.bind(this);
	}

	render(status: 'idle' | 'submitted' | 'aborted'): string {
		if (status === 'submitted' || status === 'aborted') {
			return '\n';
		}

		let text = chalk.bold('Please select migration to drop:\n');
		const selectedPrefix = chalk.yellow('❯ ');

		const data = trimmedRange(this.data.items, this.data.selectedIdx, 9);
		const labelLength: number = data.trimmed
			.map((it) => it.tag.length)
			.reduce((a, b) => {
				if (a > b) {
					return a;
				}
				return b;
			}, 0);

		text += data.startTrimmed ? '  ...\n' : '';

		data.trimmed.forEach((it, idx) => {
			const isSelected = idx === this.data.selectedIdx - data.offset;
			let title = it.tag.padEnd(labelLength, ' ');
			title = isSelected ? chalk.yellow(title) : title;

			text += isSelected ? `${selectedPrefix}${title}` : `  ${title}`;
			text += idx !== this.data.items.length - 1 ? '\n' : '';
		});

		text += data.endTrimmed ? '  ...\n' : '';
		return text;
	}

	result(): T {
		return this.data.items[this.data.selectedIdx]!;
	}
}

export const trimmedRange = <T>(
	arr: T[],
	index: number,
	limitLines: number,
): {
	trimmed: T[];
	offset: number;
	startTrimmed: boolean;
	endTrimmed: boolean;
} => {
	const limit = limitLines - 2;
	const sideLimit = Math.round(limit / 2);

	const endTrimmed = arr.length - sideLimit > index;
	const startTrimmed = index > sideLimit - 1;

	const paddingStart = Math.max(index + sideLimit - arr.length, 0);
	const paddingEnd = Math.min(index - sideLimit + 1, 0);

	const d1 = endTrimmed ? 1 : 0;
	const d2 = startTrimmed ? 0 : 1;

	const start = Math.max(0, index - sideLimit + d1 - paddingStart);
	const end = Math.min(arr.length, index + sideLimit + d2 - paddingEnd);

	return {
		trimmed: arr.slice(start, end),
		offset: start,
		startTrimmed,
		endTrimmed,
	};
};
