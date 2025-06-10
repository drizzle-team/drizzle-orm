import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasDefault,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig, /*, ColumnRuntimeConfig*/ ColumnRuntimeConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { extensionColumnConfig, requiredExtension } from '~/extension-core/index.ts';
import {
	type GelArrayBuilder,
	type GelArrayColumnBuilderBaseConfig,
	GelColumn,
	GelColumnBuilder,
} from '~/gel-core/index.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import { type Assume, getColumnNameAndConfig } from '~/utils.ts';
import {
	type DrizzleS3FetchMode,
	type DrizzleS3FileMode,
	type DrizzleS3FileModeToData,
	type DrizzleS3ObjectFile,
	type DrizzleS3ObjectIdentification,
	// type DrizzleS3ObjectMeta,
	objectIdToText,
	type RequestPresigningArguments,
} from '../common.ts';
import { DrizzleGelS3Extension } from './extension.ts';

export type GelS3FileBuilderInitial<TName extends string, TMode extends DrizzleS3FileMode> = GelS3FileBuilder<{
	name: TName;
	dataType: 'custom';
	columnType: 'GelS3File';
	data: DrizzleS3ObjectFile<DrizzleS3FileModeToData[TMode]>;
	enumValues: undefined;
	driverParam: string;
}>;

export interface GelS3FileArrayBuilder<
	T extends GelArrayColumnBuilderBaseConfig,
	TBase extends ColumnBuilderBaseConfig<ColumnDataType, string> | GelArrayColumnBuilderBaseConfig,
> extends GelArrayBuilder<T, TBase> {
	default(value: SQL<unknown>): HasDefault<this>;
	generatedAlwaysAs(as: SQL<unknown> | (() => SQL)): HasGenerated<this, { type: 'always' }>;
	array<TSize extends number | undefined = undefined>(size?: TSize): GelS3FileArrayBuilder<
		& {
			name: T['name'];
			dataType: 'array';
			columnType: 'GelArray';
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

export class GelS3FileBuilder<
	T extends ColumnBuilderBaseConfig<'custom', 'GelS3File'>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends GelColumnBuilder<T, TRuntimeConfig, TTypeConfig> {
	static override readonly [entityKind]: string = 'GelS3FileBuilder';
	readonly [extensionColumnConfig]: GelS3FileExtensionColumnConfig;

	constructor(
		name: T['name'],
		config: GelS3FileConfig,
	) {
		super(name, 'custom', 'GelS3File');
		this[extensionColumnConfig] = {
			fileMode: config.mode,
			fetchMode: 'file',
		};
	}

	override array<TSize extends number | undefined = undefined>(size?: TSize): GelS3FileArrayBuilder<
		& {
			name: T['name'];
			dataType: 'array';
			columnType: 'GelArray';
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
		table: AnyGelTable<{ name: TTableName }>,
	): GelS3File<MakeColumnConfig<T, TTableName>> {
		return new GelS3File<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			this[extensionColumnConfig],
		);
	}
}

export type GelS3FileExtensionColumnConfig = {
	fetchMode: DrizzleS3FetchMode;
	fileMode: DrizzleS3FileMode;
	options?: RequestPresigningArguments;
};

export class GelS3File<T extends ColumnBaseConfig<'custom', 'GelS3File'> = ColumnBaseConfig<'custom', 'GelS3File'>>
	extends GelColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'GelS3File';
	override [requiredExtension] = DrizzleGelS3Extension;
	[extensionColumnConfig]: GelS3FileExtensionColumnConfig;

	constructor(
		table: GelTable,
		config: ColumnBuilderRuntimeConfig<T['data'], T>,
		extensionConfig?: GelS3FileExtensionColumnConfig,
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

	data(): GelColumn<Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }> {
		return new GelS3File(
			this.table,
			this.config as ColumnRuntimeConfig<
				DrizzleS3ObjectFile['data'],
				Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }
			>,
			{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'data' },
		);
	}

	// meta(): Omit<GelS3File<Omit<T, 'data'> & { data: DrizzleS3ObjectMeta }>, 'data' | 'meta' | 'presigned'> {
	// 	return new GelS3File(
	// 		this.table,
	// 		this.config as ColumnRuntimeConfig<
	// 			DrizzleS3ObjectMeta,
	// 			Omit<T, 'data'> & { data: DrizzleS3ObjectMeta }
	// 		>,
	// 		{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'meta' },
	// 	);
	// }

	presigned(options?: RequestPresigningArguments): GelColumn<Omit<T, 'data'> & { data: string }> {
		return new GelS3File(
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

export interface GelS3FileConfig<
	TMode extends DrizzleS3FileMode = DrizzleS3FileMode,
> {
	mode: TMode;
}

export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	config: GelS3FileConfig<TMode>,
): GelS3FileBuilderInitial<TName, TMode>;
export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	name: TName,
	config: GelS3FileConfig<TMode>,
): GelS3FileBuilderInitial<TName, TMode>;
export function s3File(a: string | GelS3FileConfig, b?: GelS3FileConfig): any {
	const { name, config } = getColumnNameAndConfig<GelS3FileConfig>(a, b);
	return new GelS3FileBuilder(name, config);
}
