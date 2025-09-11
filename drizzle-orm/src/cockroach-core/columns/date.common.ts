import type { ColumnBuilderBaseConfig, ColumnType } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import { CockroachColumnWithArrayBuilder } from './common.ts';

export abstract class CockroachDateColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends CockroachColumnWithArrayBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'CockroachDateColumnBaseBuilder';

	defaultNow() {
		return this.default(sql`now()`);
	}
}
