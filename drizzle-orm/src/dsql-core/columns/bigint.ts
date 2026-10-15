import type { GeneratedIdentityConfig } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import { type DSQLSequenceOptions, validateDSQLCache } from '../sequence.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder, type HasIdentity } from './common.ts';

export class DSQLBigIntBuilder extends DSQLColumnBuilder<{
	dataType: 'bigint';
	data: bigint;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLBigIntBuilder';

	constructor(name: string) {
		super(name, 'bigint', 'DSQLBigInt');
	}

	/**
	 * Adds an `ALWAYS AS IDENTITY` clause to the column definition.
	 *
	 * DSQL-specific requirements:
	 * - Identity columns are only supported on `bigint` columns
	 * - `cache` defaults to 65536 (DSQL requires cache to be 1 or >= 65536)
	 */
	generatedAlwaysAsIdentity(
		sequence?: DSQLSequenceOptions & { name?: string },
	): HasIdentity<this, 'always'> {
		if (sequence) {
			const { name, ...options } = sequence;
			validateDSQLCache(options.cache);
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
	 *
	 * DSQL-specific requirements:
	 * - Identity columns are only supported on `bigint` columns
	 * - `cache` defaults to 65536 (DSQL requires cache to be 1 or >= 65536)
	 */
	generatedByDefaultAsIdentity(
		sequence?: DSQLSequenceOptions & { name?: string },
	): HasIdentity<this, 'byDefault'> {
		if (sequence) {
			const { name, ...options } = sequence;
			validateDSQLCache(options.cache);
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

	/** @internal */
	override build(table: DSQLTable): DSQLBigInt {
		return new DSQLBigInt(table, this.config as any);
	}
}

export class DSQLBigInt extends DSQLColumn<'bigint'> {
	static override readonly [entityKind]: string = 'DSQLBigInt';

	getSQLType(): string {
		return 'bigint';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export function bigint(name?: string): DSQLBigIntBuilder {
	return new DSQLBigIntBuilder(name ?? '');
}
