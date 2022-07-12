import { InferType } from 'drizzle-orm';
import { SQL } from 'drizzle-orm/sql';
import { TableName } from 'drizzle-orm/utils';

import { AnyPgDialect } from '~/connection';
import { AnyPgSession } from '~/operations';
import { AnyPgTable } from '~/table';

export interface PgInsertConfig<TTable extends AnyPgTable> {
	table: TTable;
	values: InferType<TTable, 'insert'>[];
	returning?: boolean;
}

export type AnyPgInsertConfig = PgInsertConfig<AnyPgTable>;

export class PgInsert<TTable extends AnyPgTable> {
	private config: PgInsertConfig<TTable> = {} as PgInsertConfig<TTable>;

	constructor(
		private table: TTable,
		private session: AnyPgSession,
		private map: (rows: any[]) => InferType<TTable>[],
		private dialect: AnyPgDialect,
	) {}

	values(
		values: InferType<TTable, 'insert'> | InferType<TTable, 'insert'>[],
	): Pick<this, 'returning' | 'execute'> {
		this.config.values = Array.isArray(values) ? values : [values];
		return this;
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
