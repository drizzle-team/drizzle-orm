import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase } from '~/column-builder';
import { sql } from '~/sql';

import { PgColumnBuilder } from './common';

export abstract class PgDateColumnBaseBuilder<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
	TConfig extends Record<string, unknown> = {},
> extends PgColumnBuilder<THKT, T, TConfig> {
	defaultNow() {
		return this.default(sql`now()`);
	}
}
