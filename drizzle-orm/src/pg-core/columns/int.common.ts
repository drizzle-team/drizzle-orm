import type {
	ColumnBuilderBaseConfig,
	ColumnDataType,
	GeneratedIdentityConfig,
	IsIdentity,
} from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { PgSequenceOptions } from '../sequence.ts';
import { PgColumnBuilder } from './common.ts';
import type { PgIntegerBuilderInitial } from './integer.ts';
// import type { Simplify } from '~/index.ts';


// type a = Simplify<IsIdentity<PgIntegerBuilderInitial<"always_as_identity">, "always">>;
type a = IsIdentity<PgIntegerBuilderInitial<"always_as_identity">, "always">;

type a1 = {'_': {
	identity: undefined
}}

type a2 = a1 & {'_': {
	identity: 'always'
}}

let b: a2;
b._


export abstract class PgIntColumnBaseBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
> extends PgColumnBuilder<
	T,
	{ generatedIdentity: GeneratedIdentityConfig }
> {
	static override readonly [entityKind]: string = 'PgIntColumnBaseBuilder';

	generatedAlwaysAsIdentity(
		sequence?: PgSequenceOptions & { name?: string },
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

		return this as any;
	}

	generatedByDefaultAsIdentity(
		sequence?: PgSequenceOptions & { name?: string },
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

		return this as any;
	}
}
