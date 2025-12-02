import type { ColumnBuilderBaseConfig, ColumnType, GeneratedIdentityConfig, IsIdentity } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { CockroachSequenceOptions } from '../sequence.ts';
import { CockroachColumnWithArrayBuilder } from './common.ts';

export abstract class CockroachIntColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType>,
> extends CockroachColumnWithArrayBuilder<
	T,
	{ generatedIdentity: GeneratedIdentityConfig }
> {
	static override readonly [entityKind]: string = 'CockroachIntColumnBaseBuilder';

	generatedAlwaysAsIdentity(
		sequence?: CockroachSequenceOptions,
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
		sequence?: CockroachSequenceOptions,
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
