import type {
	ColumnBuilderBaseConfig,
	ColumnDataType,
	GeneratedIdentityConfig,
	IsIdentityByDefault,
} from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { PgSequenceOptions } from '../sequence.ts';
import { PgColumnBuilder } from './common.ts';

export abstract class PgIntColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends PgColumnBuilder<
	T,
	{ generatedIdentity: GeneratedIdentityConfig }
> {
	static override readonly [entityKind]: string = 'PgIntColumnBaseBuilder';

	generatedAlwaysAsIdentity(
		sequence?: PgSequenceOptions & { name?: string },
	): IsIdentityByDefault<this, 'always'> {
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

		return this as any;
	}

	generatedByDefaultAsIdentity(
		sequence?: PgSequenceOptions & { name?: string },
	): IsIdentityByDefault<this, 'byDefault'> {
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

		return this as any;
	}
}
