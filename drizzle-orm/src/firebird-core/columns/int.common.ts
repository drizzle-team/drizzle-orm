import type { ColumnBuilderBaseConfig, ColumnDataType, GeneratedIdentityConfig, IsIdentity } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { FirebirdColumnBuilder } from './common.ts';

export abstract class FirebirdIntColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends FirebirdColumnBuilder<
	T,
	{ generatedIdentity: GeneratedIdentityConfig }
> {
	static override readonly [entityKind]: string = 'FirebirdIntColumnBaseBuilder';

	generatedAlwaysAsIdentity(
		sequence?: { name?: string },
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
		sequence?: { name?: string },
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
