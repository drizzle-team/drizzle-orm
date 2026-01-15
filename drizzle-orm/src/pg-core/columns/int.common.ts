import type { GeneratedIdentityConfig } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { PgSequenceOptions } from '../sequence.ts';
import type { HasIdentity, PgColumnBuilderConfig } from './common.ts';
import { PgColumnBuilder } from './common.ts';

export abstract class PgIntColumnBuilder<
	out T extends PgColumnBuilderConfig = PgColumnBuilderConfig,
	out TRuntimeConfig extends object = object,
> extends PgColumnBuilder<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'PgIntColumnBaseBuilder';

	/**
	 * Adds an `ALWAYS AS IDENTITY` clause to the column definition.
	 * Available for integer column types.
	 */
	generatedAlwaysAsIdentity(
		sequence?: PgSequenceOptions & { name?: string },
	): HasIdentity<this, 'always'> {
		if (sequence) {
			const { name, ...options } = sequence;
			(this.config as any).generatedIdentity = {
				type: 'always',
				sequenceName: name,
				sequenceOptions: options,
			} satisfies GeneratedIdentityConfig;
		} else {
			(this.config as any).generatedIdentity = {
				type: 'always',
			} satisfies GeneratedIdentityConfig;
		}
		this.config.hasDefault = true;
		this.config.notNull = true;
		return this as HasIdentity<this, 'always'>;
	}

	/**
	 * Adds a `BY DEFAULT AS IDENTITY` clause to the column definition.
	 * Available for integer column types.
	 */
	generatedByDefaultAsIdentity(
		sequence?: PgSequenceOptions & { name?: string },
	): HasIdentity<this, 'byDefault'> {
		if (sequence) {
			const { name, ...options } = sequence;
			(this.config as any).generatedIdentity = {
				type: 'byDefault',
				sequenceName: name,
				sequenceOptions: options,
			} satisfies GeneratedIdentityConfig;
		} else {
			(this.config as any).generatedIdentity = {
				type: 'byDefault',
			} satisfies GeneratedIdentityConfig;
		}
		this.config.hasDefault = true;
		this.config.notNull = true;
		return this as HasIdentity<this, 'byDefault'>;
	}
}
