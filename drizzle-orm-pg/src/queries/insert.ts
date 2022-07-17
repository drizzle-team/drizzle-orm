import { Name, SQL, sql } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';

import { AnyPgDialect, PgDriverParam, PgSession } from '~/connection';
import { AnyPgSQL } from '~/sql';
import { AnyPgTable, InferType, TableConflictConstraints } from '~/table';
import { getTableColumns, tableConflictConstraints } from '~/utils';
import { Constraint } from '..';
import { PgUpdateSet } from './update';

export interface PgInsertConfig<TTable extends AnyPgTable> {
	table: TTable;
	values: Record<string, unknown | SQL<TableName<TTable>, PgDriverParam>>[];
	onConflict: SQL<TableName<TTable>, PgDriverParam> | undefined;
	returning: boolean | undefined;
}

export type AnyPgInsertConfig = PgInsertConfig<any>;

export class PgInsert<TTable extends AnyPgTable> {
	protected enforceCovariance!: {
		table: TTable;
	};

	private config: PgInsertConfig<TTable> = {} as PgInsertConfig<TTable>;

	constructor(
		table: TTable,
		values: InferType<TTable, 'insert'>[],
		private session: PgSession,
		private map: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
	) {
		this.config.table = table;
		this.config.values = values;
	}

	returning(): Pick<this, 'execute'> {
		this.config.returning = true;
		return this;
	}

	onConflictDoNothing(
		target?:
			| SQL<TableName<TTable>, PgDriverParam>
			| ((
				constraints: TableConflictConstraints<TTable>,
			) => TableConflictConstraints<TTable>[keyof TableConflictConstraints<TTable>]),
	): Pick<this, 'returning' | 'execute'> {
		if (typeof target === 'undefined') {
			this.config.onConflict = sql`do nothing`;
		} else if (target instanceof SQL) {
			this.config.onConflict = sql`${target} do nothing`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql`on constraint ${targetSql} do nothing`;
		}
		return this;
	}

	onConflictDoUpdate(
		target:
			| SQL<TableName<TTable>, PgDriverParam>
			| ((
				constraints: TableConflictConstraints<TTable>,
			) => Constraint<TableName<TTable>>),
		set: PgUpdateSet<TTable>,
	): Pick<this, 'returning' | 'execute'> {
		const setLength = Object.keys(set).length;
		const setSql: AnyPgSQL<TableName<TTable>>[] = [];
		Object.entries(set).forEach(([key, value], i) => {
			const col = getTableColumns(this.config.table)[key]!;
			setSql.push(sql<TableName<TTable>, unknown[]>`${new Name(col.name)} = ${value}`);
			if (i !== setLength - 1) {
				setSql.push(sql`, `);
			}
		});

		if (target instanceof SQL) {
			this.config.onConflict = sql<TableName<TTable>, unknown[]>`${target} do update set ${sql.fromList(setSql)}`;
		} else {
			const targetSql = new Name(target(this.config.table[tableConflictConstraints]).name);
			this.config.onConflict = sql<TableName<TTable>, unknown[]>`on constraint ${targetSql} do update set ${
				sql.fromList(setSql)
			}`;
		}
		return this;
	}

	async execute(): Promise<InferType<TTable>> {
		const query = this.dialect.buildInsertQuery(this.config);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		return this.map(result.rows) as unknown as InferType<TTable>;
	}
}
