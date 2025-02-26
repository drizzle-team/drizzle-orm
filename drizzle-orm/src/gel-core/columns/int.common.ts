import type { ColumnBuilderBaseConfig, ColumnDataType, GeneratedIdentityConfig, IsIdentity } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { GelSequenceOptions } from '../sequence.ts';
import { GelColumnBuilder } from './common.ts';

export abstract class GelIntColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends GelColumnBuilder<
	T,
	{ generatedIdentity: GeneratedIdentityConfig }
> {
	static override readonly [entityKind]: string = 'GelIntColumnBaseBuilder';

	generatedAlwaysAsIdentity(
		sequence?: GelSequenceOptions & { name?: string },
	): IsIdentity<this, 'always'> {
		if (sequence) {
			const { name, ...options } = sequence;
			this.config.generatedIdentity = {
				type: 'always',
				sequenceName: name,
				sequenceOptions: options,
			};
		} else {
			this.config.generatedIdentity = {
				type: 'always',
			};
		}

		this.config.hasDefault = true;
		this.config.notNull = true;

		return this as IsIdentity<this, 'always'>;
	}

	generatedByDefaultAsIdentity(
		sequence?: GelSequenceOptions & { name?: string },
	): IsIdentity<this, 'byDefault'> {
		if (sequence) {
			const { name, ...options } = sequence;
			this.config.generatedIdentity = {
				type: 'byDefault',
				sequenceName: name,
				sequenceOptions: options,
			};
		} else {
			this.config.generatedIdentity = {
				type: 'byDefault',
			};
		}

		this.config.hasDefault = true;
		this.config.notNull = true;

		return this as IsIdentity<this, 'byDefault'>;
	}
}
