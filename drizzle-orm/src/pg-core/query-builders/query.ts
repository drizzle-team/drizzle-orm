import { QueryPromise } from '~/query-promise';
import {
	type DBQueryConfig,
	mapRelationalRow,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations';
import { type PgDialect } from '../dialect';
import { type PgSession, type PreparedQuery, type PreparedQueryConfig } from '../session';
import { type AnyPgTable } from '../table';

export class PgRelationalQuery<TResult> extends QueryPromise<TResult> {
	declare protected $brand: 'PgRelationalQuery';

	constructor(
		private fullSchema: Record<string, unknown>,
		private schema: TablesRelationalConfig,
		private tableNamesMap: Record<string, string>,
		private table: AnyPgTable,
		private tableConfig: TableRelationalConfig,
		private dialect: PgDialect,
		private session: PgSession,
		private config: DBQueryConfig<'many', true> | true,
		private mode: 'many' | 'first',
	) {
		super();
	}

	private _prepare(name?: string): PreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		const query = this.dialect.buildRelationalQuery(
			this.fullSchema,
			this.schema,
			this.tableNamesMap,
			this.table,
			this.tableConfig,
			this.config,
			this.tableConfig.tsName,
			[],
			true,
		);

		const builtQuery = this.dialect.sqlToQuery(query.sql);
		return this.session.prepareQuery(
			builtQuery,
			undefined,
			name,
			(rawRows) => {
				const rows = rawRows.map((row) => mapRelationalRow(this.schema, this.tableConfig, row, query.selection));
				if (this.mode === 'first') {
					return rows[0] as TResult;
				}
				return rows as TResult;
			},
		);
	}

	prepare(name: string): PreparedQuery<PreparedQueryConfig & { execute: TResult }> {
		return this._prepare(name);
	}

	override execute(): Promise<TResult> {
		return this._prepare().execute();
	}
}
