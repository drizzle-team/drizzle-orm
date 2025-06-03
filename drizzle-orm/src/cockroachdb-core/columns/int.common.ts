import type { ColumnBuilderBaseConfig, ColumnDataType, GeneratedIdentityConfig, IsIdentity } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { CockroachDbSequenceOptions } from '../sequence.ts';
import { CockroachDbColumnWithArrayBuilder } from './common.ts';

export abstract class CockroachDbIntColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends CockroachDbColumnWithArrayBuilder<
	T,
	{ generatedIdentity: GeneratedIdentityConfig }
> {
	static override readonly [entityKind]: string = 'CockroachDbIntColumnBaseBuilder';

	generatedAlwaysAsIdentity(
		sequence?: CockroachDbSequenceOptions,
	): IsIdentity<this, 'always'> {
		this.config.generatedIdentity = sequence
			? {
				type: 'always',
				sequenceOptions: sequence,
			}
			: {
				type: 'always',
			};

		this.config.hasDefault = true;
		this.config.notNull = true;

		return this as IsIdentity<this, 'always'>;
	}

	generatedByDefaultAsIdentity(
		sequence?: CockroachDbSequenceOptions,
	): IsIdentity<this, 'byDefault'> {
		this.config.generatedIdentity = sequence
			? {
				type: 'byDefault',
				sequenceOptions: sequence,
			}
			: {
				type: 'byDefault',
			};

		this.config.hasDefault = true;
		this.config.notNull = true;

		return this as IsIdentity<this, 'byDefault'>;
	}
}
