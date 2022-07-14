import { InferType } from 'drizzle-orm';

import { AnyPgDialect, PgSession } from '~/connection';
import { AnyPgTable } from '~/table';

export interface PgInsertConfig<TTable extends AnyPgTable> {
	table: TTable;
	values: InferType<TTable, 'insert'>[];
	returning?: boolean;
}

export type AnyPgInsertConfig = PgInsertConfig<AnyPgTable>;

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

	async execute(): Promise<InferType<TTable>> {
		const query = this.dialect.buildInsertQuery(this.config);
		const [sql, params] = this.dialect.prepareSQL(query);
		const result = await this.session.query(sql, params);
		// mapping from driver response to return type
		return this.map(result.rows) as unknown as InferType<TTable>;
	}
}
