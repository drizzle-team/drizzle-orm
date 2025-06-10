import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasDefault,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig, ColumnRuntimeConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { extensionColumnConfig, requiredExtension } from '~/extension-core/index.ts';
import {
	type PgArrayBuilder,
	type PgArrayColumnBuilderBaseConfig,
	PgColumn,
	PgColumnBuilder,
} from '~/pg-core/index.ts';
import type { AnyPgTable, PgTable } from '~/pg-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import { type Assume, getColumnNameAndConfig } from '~/utils.ts';
import {
	type DrizzleS3FetchMode,
	type DrizzleS3FileMode,
	type DrizzleS3FileModeToData,
	type DrizzleS3ObjectFile,
	type DrizzleS3ObjectIdentification,
	objectIdToText,
	type RequestPresigningArguments,
} from '../common.ts';
import { DrizzlePgS3Extension } from './extension.ts';

export type PgS3FileBuilderInitial<TName extends string, TMode extends DrizzleS3FileMode> = PgS3FileBuilder<{
	name: TName;
	dataType: 'custom';
	columnType: 'PgS3File';
	data: DrizzleS3ObjectFile<DrizzleS3FileModeToData[TMode]>;
	enumValues: undefined;
	driverParam: string;
}>;

export interface PgS3FileArrayBuilder<
	T extends PgArrayColumnBuilderBaseConfig,
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string> | PgArrayColumnBuilderBaseConfig,
> extends PgArrayBuilder<T, TBase> {
	default(value: SQL<unknown>): HasDefault<this>;
	generatedAlwaysAs(as: SQL<unknown> | (() => SQL)): HasGenerated<this, { type: 'always' }>;
	array<TSize extends number | undefined = undefined>(size?: TSize): PgS3FileArrayBuilder<
		& {
			name: T['name'];
			dataType: 'array';
			columnType: 'PgArray';
			data: T['data'][];
			driverParam: T['driverParam'][] | string;
			enumValues: T['enumValues'];
			size: TSize;
			baseBuilder: T;
		}
		& (T extends { notNull: true } ? { notNull: true } : {})
		& (T extends { hasDefault: true } ? { hasDefault: true } : {}),
		T
	>;
}

export class PgS3FileBuilder<
	T extends ColumnBuilderBaseConfig<'custom', 'PgS3File'>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends PgColumnBuilder<T, TRuntimeConfig, TTypeConfig> {
	static override readonly [entityKind]: string = 'PgS3FileBuilder';
	readonly [extensionColumnConfig]: PgS3FileExtensionColumnConfig;

	constructor(
		name: T['name'],
		config: PgS3FileConfig,
	) {
		super(name, 'custom', 'PgS3File');
		this[extensionColumnConfig] = {
			fileMode: config.mode,
			fetchMode: 'file',
		};
	}

	override array<TSize extends number | undefined = undefined>(size?: TSize): PgS3FileArrayBuilder<
		& {
			name: T['name'];
			dataType: 'array';
			columnType: 'PgArray';
			data: T['data'][];
			driverParam: T['driverParam'][] | string;
			enumValues: T['enumValues'];
			size: TSize;
			baseBuilder: T;
		}
		& (T extends { notNull: true } ? { notNull: true } : {})
		& (T extends { hasDefault: true } ? { hasDefault: true } : {}),
		T
	> {
		return super.array(size) as any;
	}

	/**
	 * Allows to set default to an existing file
	 *
	 * @example
	 * ```
	 * fileColumn: s3File().default(sql`${bucket}:${key}`)
	 * ```
	 *
	 * @returns
	 */
	override default(value: SQL<unknown>): HasDefault<this> {
		return super.default(value);
	}

	override generatedAlwaysAs(as: SQL<unknown> | (() => SQL)): HasGenerated<this, { type: 'always' }> {
		return super.generatedAlwaysAs(as);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgS3File<MakeColumnConfig<T, TTableName>> {
		return new PgS3File<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			this[extensionColumnConfig],
		);
	}
}

export type PgS3FileExtensionColumnConfig = {
	fetchMode: DrizzleS3FetchMode;
	fileMode: DrizzleS3FileMode;
	options?: RequestPresigningArguments;
};

export class PgS3File<T extends ColumnBaseConfig<'custom', 'PgS3File'> = ColumnBaseConfig<'custom', 'PgS3File'>>
	extends PgColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'PgS3File';
	override [requiredExtension] = DrizzlePgS3Extension;
	[extensionColumnConfig]: PgS3FileExtensionColumnConfig;

	constructor(
		table: PgTable,
		config: ColumnBuilderRuntimeConfig<T['data'], T>,
		extensionConfig?: PgS3FileExtensionColumnConfig,
	) {
		super(table, config);

		this[extensionColumnConfig] = extensionConfig ?? {
			fileMode: 'buffer',
			fetchMode: 'file',
		};
	}

	override mapToDriverValue(value: unknown): string {
		if (typeof value === 'string') return value;

		return objectIdToText(value as DrizzleS3ObjectIdentification);
	}

	data(): PgColumn<Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }> {
		return new PgS3File(
			this.table,
			this.config as ColumnRuntimeConfig<
				DrizzleS3ObjectFile['data'],
				Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }
			>,
			{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'data' },
		);
	}

	// meta(): Omit<PgS3File<Omit<T, 'data'> & { data: DrizzleS3ObjectMeta }>, 'data' | 'meta' | 'presigned'> {
	// 	return new PgS3File(
	// 		this.table,
	// 		this.config as ColumnRuntimeConfig<
	// 			DrizzleS3ObjectMeta,
	// 			Omit<T, 'data'> & { data: DrizzleS3ObjectMeta }
	// 		>,
	// 		{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'meta' },
	// 	);
	// }

	presigned(options?: RequestPresigningArguments): PgColumn<Omit<T, 'data'> & { data: string }> {
		return new PgS3File(
			this.table,
			this.config as ColumnRuntimeConfig<
				string,
				Omit<T, 'data'> & { data: string }
			>,
			{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'presigned', options },
		);
	}

	getSQLType(): string {
		return 'text';
	}
}

export interface PgS3FileConfig<
	TMode extends DrizzleS3FileMode = DrizzleS3FileMode,
> {
	mode: TMode;
}

export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	config: PgS3FileConfig<TMode>,
): PgS3FileBuilderInitial<TName, TMode>;
export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	name: TName,
	config: PgS3FileConfig<TMode>,
): PgS3FileBuilderInitial<TName, TMode>;
export function s3File(a: string | PgS3FileConfig, b?: PgS3FileConfig): any {
	const { name, config } = getColumnNameAndConfig<PgS3FileConfig>(a, b);
	return new PgS3FileBuilder(name, config);
}
