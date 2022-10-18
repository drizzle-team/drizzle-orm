import { PreparedQuery, SQL, SQLWrapper } from 'drizzle-orm/sql';
import { mapResultRow, tableColumns, tableNameSym } from 'drizzle-orm/utils';

import { PgDialect, PgSession } from '~/connection';
import { PgSelectFields, PgSelectFieldsOrdered, SelectResultFields } from '~/operations';
import { AnyPgTable, GetTableConfig, PgTable } from '~/table';

import {
	AnyPgSelect,
	AppendToJoinsNotNull,
	AppendToResult,
	JoinNullability,
	JoinsValue,
	JoinType,
	PickLimit,
	PickOffset,
	PickOrderBy,
	PickWhere,
	SelectResult,
} from './select.types';

export interface PgSelectConfig {
	fields: PgSelectFieldsOrdered;
	where?: SQL | undefined;
	table: AnyPgTable;
	limit?: number;
	offset?: number;
	joins: { [k: string]: JoinsValue };
	orderBy: SQL[];
}

export class PgSelect<
	TTable extends AnyPgTable,
	TInitialSelectResultFields extends SelectResultFields<PgSelectFields<GetTableConfig<TTable, 'name'>>>,
	TResult = undefined,
	TJoinsNotNullable extends Record<string, JoinNullability> = { [Key in GetTableConfig<TTable, 'name'>]: 'not-null' },
> implements SQLWrapper {
	protected typeKeeper!: {
		table: TTable;
		initialSelect: TInitialSelectResultFields;
		result: TResult;
	};

	private config: PgSelectConfig;
	private joinsNotNullable: Record<string, boolean>;

	constructor(
		table: PgSelectConfig['table'],
		fields: PgSelectConfig['fields'],
		private session: PgSession,
		private dialect: PgDialect,
	) {
		this.config = {
			table,
			fields,
			joins: {},
			orderBy: [],
		};
		this.joinsNotNullable = { [table[tableNameSym]]: true };
	}

	private createJoin<TJoinType extends JoinType>(joinType: TJoinType) {
		const self = this;

		function join<
			TJoinedTable extends AnyPgTable,
			TSelect extends PgSelectFields<string> = GetTableConfig<TJoinedTable, 'columns'>,
			TJoinedName extends GetTableConfig<TJoinedTable, 'name'> = GetTableConfig<TJoinedTable, 'name'>,
		>(table: TJoinedTable, on: SQL, select?: TSelect): PgSelect<
			TTable,
			TInitialSelectResultFields,
			AppendToResult<TResult, TJoinedName, TSelect>,
			AppendToJoinsNotNull<TJoinsNotNullable, TJoinedName, TJoinType>
		>;
		function join(table: AnyPgTable, on: SQL, selection?: PgSelectFields<string>): AnyPgSelect {
			const tableName = table[tableNameSym];
			self.config.fields.push(...self.dialect.orderSelectedFields(selection ?? table[tableColumns], tableName));

			self.config.joins[tableName] = {
				on,
				table,
				joinType,
			};

			switch (joinType) {
				case 'left':
					self.joinsNotNullable[tableName] = false;
					break;
				case 'right':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, false]),
					);
					self.joinsNotNullable[tableName] = true;
					break;
				case 'inner':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, true]),
					);
					self.joinsNotNullable[tableName] = true;
					break;
				case 'full':
					self.joinsNotNullable = Object.fromEntries(
						Object.entries(self.joinsNotNullable).map(([key]) => [key, false]),
					);
					self.joinsNotNullable[tableName] = false;
					break;
			}

			return self;
		}

		return join;
	}

	leftJoin = this.createJoin('left');

	rightJoin = this.createJoin('right');

	innerJoin = this.createJoin('inner');

	fullJoin = this.createJoin('full');

	fields<TSelect extends PgSelectFields<GetTableConfig<TTable, 'name'>>>(
		fields: TSelect,
	): Omit<PgSelect<TTable, SelectResultFields<TSelect>, TResult, TJoinsNotNullable>, 'fields'> {
		this.config.fields = this.dialect.orderSelectedFields(fields, this.config.table[tableNameSym]);
		return this as any;
	}

	where(where: SQL | undefined): PickWhere<this> {
		this.config.where = where;
		return this;
	}

	orderBy(...columns: SQL[]): PickOrderBy<this> {
		this.config.orderBy = columns;
		return this;
	}

	limit(limit: number): PickLimit<this> {
		this.config.limit = limit;
		return this;
	}

	offset(offset: number): PickOffset<this> {
		this.config.offset = offset;
		return this;
	}

	getSQL(): SQL {
		return this.dialect.buildSelectQuery(this.config);
	}

	getQuery(): PreparedQuery {
		const query = this.dialect.buildSelectQuery(this.config);
		return this.dialect.prepareSQL(query);
	}

	async execute(): Promise<
		SelectResult<TTable, TResult, TInitialSelectResultFields, TJoinsNotNullable>
	> {
		const query = this.dialect.buildSelectQuery(this.config);
		const { sql, params } = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		return result.rows.map((row) => mapResultRow(this.config.fields, row, this.joinsNotNullable)) as SelectResult<
			TTable,
			TResult,
			TInitialSelectResultFields,
			TJoinsNotNullable
		>;
	}
}
