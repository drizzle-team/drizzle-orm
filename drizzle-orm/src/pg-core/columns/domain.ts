import { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { CheckBuilder } from '~/pg-core/checks.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

type PgTypeToTsType<T extends string> = T extends 'text' | 'varchar' | 'citext' ? string
	: T extends 'integer' | 'int' | 'serial' ? number
	: T extends 'boolean' | 'bool' ? boolean
	: T extends 'jsonb' ? object // Add more mappings as needed
	: any; // Fallback

export type PgDomainColumnBuilderInitial<TName extends string, TType extends string, TNotNull extends boolean = false> =
	PgDomainColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'PgDomainColumn';
		data: PgTypeToTsType<TType>;
		driverParam: string;
		enumValues: undefined;
		domainType: TType;
		notNull: TNotNull;
	}>;

const isPgDomainSym = Symbol.for('drizzle:isPgDomain');
export interface PgDomain<TType extends string, TNotNull extends boolean = false> {
	(): PgDomainColumnBuilderInitial<'', TType, TNotNull>;
	<TName extends string>(name: TName): PgDomainColumnBuilderInitial<TName, TType, TNotNull>;
	<TName extends string>(name?: TName): PgDomainColumnBuilderInitial<TName, TType, TNotNull>;

	readonly domainName: string;
	readonly domainType: TType;
	readonly schema: string | undefined;
	readonly notNull: TNotNull;
	readonly defaultValue?: string;
	readonly checkConstraints?: CheckBuilder[];
	/** @internal */
	[isPgDomainSym]: true;
}

export function isPgDomain(obj: unknown): obj is PgDomain<string, boolean> {
	return !!obj && typeof obj === 'function' && isPgDomainSym in obj && obj[isPgDomainSym] === true;
}

export class PgDomainColumnBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'PgDomainColumn'> & { domainType: string; notNull: boolean },
> extends PgColumnBuilder<T, { domain: PgDomain<T['domainType'], T['notNull']> }> {
	static override readonly [entityKind]: string = 'PgDomainColumnBuilder';

	constructor(name: T['name'], domainInstance: PgDomain<T['domainType'], T['notNull']>) {
		super(name, 'string', 'PgDomainColumn');
		this.config.domain = domainInstance;
		this.config.notNull = domainInstance.notNull;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgDomainColumn<
		MakeColumnConfig<
			T & { domainType: T['domainType']; notNull: T['notNull'] },
			TTableName
		> & { domainType: T['domainType']; notNull: T['notNull'] }
	> {
		return new PgDomainColumn<
			MakeColumnConfig<
				T & { domainType: T['domainType']; notNull: T['notNull'] },
				TTableName
			> & { domainType: T['domainType']; notNull: T['notNull'] }
		>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgDomainColumn<
	T extends ColumnBaseConfig<'string', 'PgDomainColumn'> & { domainType: string; notNull: boolean },
> extends PgColumn<T, { domain: PgDomain<T['domainType'], T['notNull']> }> {
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

export function pgDomain<TType extends string, TNotNull extends boolean = false>(
	domainName: string,
	domainType: TType,
	options?: {
		notNull?: TNotNull;
		defaultValue?: string;
		checkConstraints?: CheckBuilder[];
	},
): PgDomain<TType, TNotNull> {
	return pgDomainWithSchema(domainName, domainType, undefined, options);
}

/** @internal */
export function pgDomainWithSchema<TType extends string, TNotNull extends boolean = false>(
	domainName: string,
	domainType: TType,
	schema?: string,
	options?: {
		notNull?: TNotNull;
		defaultValue?: string;
		checkConstraints?: CheckBuilder[];
	},
): PgDomain<TType, TNotNull> {
	const domainInstance = Object.assign(
		<TName extends string = ''>(name?: TName): PgDomainColumnBuilderInitial<TName, TType, TNotNull> =>
			new PgDomainColumnBuilder(name ?? '' as TName, domainInstance),
		{
			domainName,
			domainType,
			schema,
			notNull: (options?.notNull ?? false) as TNotNull,
			defaultValue: options?.defaultValue,
			checkConstraints: options?.checkConstraints,
			[isPgDomainSym]: true,
		} as const,
	) as PgDomain<TType, TNotNull>;

	return domainInstance;
}
