import { entityKind } from '~/entity.ts';
import type { CockroachSequenceOptions } from '../sequence.ts';
import type { CockroachColumnBuilderConfig, HasIdentity } from './common.ts';
import { CockroachColumnBuilder } from './common.ts';

export abstract class CockroachIntColumnBaseBuilder<
	out T extends CockroachColumnBuilderConfig = CockroachColumnBuilderConfig,
	out TRuntimeConfig extends object = object,
> extends CockroachColumnBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'CockroachIntColumnBaseBuilder';

	generatedAlwaysAsIdentity(
		sequence?: CockroachSequenceOptions,
	): HasIdentity<this, 'always'> {
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

		return this as HasIdentity<this, 'always'>;
	}

	generatedByDefaultAsIdentity(
		sequence?: CockroachSequenceOptions,
	): HasIdentity<this, 'byDefault'> {
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

		return this as HasIdentity<this, 'byDefault'>;
	}
}
