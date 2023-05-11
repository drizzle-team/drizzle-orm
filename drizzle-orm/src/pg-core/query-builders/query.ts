import { QueryPromise } from '~/query-promise';
import {
	type BuildRelationalQueryResult,
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

	private mapResults(rows: unknown[][], selection: BuildRelationalQueryResult['selection']): unknown {
		if (this.mode === 'many') {
			return rows.map((row) => mapRelationalRow(this.schema, this.tableConfig, row, selection));
		}

		console.log('rows', rows, rows[0], !rows[0]);

		if (!rows[0]) {
			return undefined;
		}
		return mapRelationalRow(this.schema, this.tableConfig, rows[0], selection);
	}

	prepare(name: string): PreparedQuery<
		PreparedQueryConfig & {
			execute: TResult;
		}
	> {
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
			(rows) => this.mapResults(rows as unknown[][], query.selection),
		);
	}

	override execute(): Promise<TResult> {
		return this.prepare('execute').execute();
	}
}
