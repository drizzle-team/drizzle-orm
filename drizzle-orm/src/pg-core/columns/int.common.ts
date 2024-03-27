import type { ColumnBuilderBaseConfig, ColumnDataType, IsIdentityByDefault } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { PgSequence } from '../sequence.ts';
import { PgColumnBuilder } from './common.ts';

export abstract class PgIntColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends PgColumnBuilder<
	T,
	{ generatedIdentity: { sequence?: PgSequence; type: 'always' | 'byDefault' } }
> {
	static readonly [entityKind]: string = 'PgIntColumnBaseBuilder';

	generatedAlwaysAsIdentity(
		sequence?: PgSequence,
	): IsIdentityByDefault<this, 'always'> {
		this.config.generatedIdentity = {
			type: 'always',
			sequence,
		};
		return this as any;
	}

	generatedByDefaultAsIdentity(
		sequence?: PgSequence,
	): IsIdentityByDefault<this, 'byDefault'> {
		this.config.generatedIdentity = {
			type: 'byDefault',
			sequence,
		};
		return this as any;
	}
}
