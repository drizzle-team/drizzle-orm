import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { CheckBuilder } from '~/pg-core/checks.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgDomainColumnBuilderInitial<TName extends string, TType extends string> = PgDomainColumnBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgDomainColumn';
	data: string;
	driverParam: string;
	enumValues: undefined;
	domainType: TType;
}>;

const isPgDomainSym = Symbol.for('drizzle:isPgDomain');
export interface PgDomain<TType extends string> {
	(): PgDomainColumnBuilderInitial<'', TType>;
	<TName extends string>(name: TName): PgDomainColumnBuilderInitial<TName, TType>;
	<TName extends string>(name?: TName): PgDomainColumnBuilderInitial<TName, TType>;

	readonly domainName: string;
	readonly domainType: TType;
	readonly schema: string | undefined;
	readonly notNull: boolean;
	readonly defaultValue?: string;
	readonly checkConstraints?: CheckBuilder[];
	/** @internal */
	[isPgDomainSym]: true;
}

export function isPgDomain(obj: unknown): obj is PgDomain<string> {
	return !!obj && typeof obj === 'function' && isPgDomainSym in obj && obj[isPgDomainSym] === true;
}

export class PgDomainColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'PgDomainColumn'> & { domainType: string },
> extends PgColumnBuilder<T, { domain: PgDomain<T['domainType']> }> {
	static override readonly [entityKind]: string = 'PgDomainColumnBuilder';

	constructor(name: T['name'], domainInstance: PgDomain<T['domainType']>) {
		super(name, 'string', 'PgDomainColumn');
		this.config.domain = domainInstance;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDomainColumn<
		MakeColumnConfig<
			T & { domainType: T['domainType'] },
			TTableName
		> & { domainType: T['domainType'] }
	> {
		return new PgDomainColumn<
			MakeColumnConfig<
				T & { domainType: T['domainType'] },
				TTableName
			> & { domainType: T['domainType'] }
		>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgDomainColumn<
	T extends ColumnBaseConfig<'string', 'PgDomainColumn'> & { domainType: string },
> extends PgColumn<T, { domain: PgDomain<T['domainType']> }> {
	static override readonly [entityKind]: string = 'PgDomainColumn';

	readonly domain = this.config.domain;

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgDomainColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.domain = config.domain;
	}

	getSQLType(): string {
		return this.domain.domainName;
	}
}

export function pgDomain<TType extends string>(
	domainName: string,
	domainType: TType,
	options?: {
		notNull?: boolean;
		defaultValue?: string;
		checkConstraints?: CheckBuilder[];
	},
): PgDomain<TType> {
	return pgDomainWithSchema(domainName, domainType, undefined, options);
}

/** @internal */
export function pgDomainWithSchema<TType extends string>(
	domainName: string,
	domainType: TType,
	schema?: string,
	options?: {
		notNull?: boolean;
		defaultValue?: string;
		checkConstraints?: CheckBuilder[];
	},
): PgDomain<TType> {
	const domainInstance: PgDomain<TType> = Object.assign(
		<TName extends string>(name?: TName): PgDomainColumnBuilderInitial<TName, TType> =>
			new PgDomainColumnBuilder(name ?? '' as TName, domainInstance),
		{
			domainName,
			domainType,
			schema,
			notNull: options?.notNull ?? false,
			defaultValue: options?.defaultValue,
			checkConstraints: options?.checkConstraints,
			[isPgDomainSym]: true,
		} as const,
	);

	return domainInstance;
}
