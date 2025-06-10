import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { extensionColumnConfig, extensionName, requiredExtension } from '~/extension-core/index.ts';
import { DrizzlePgExtension, type DrizzlePgHookContext } from '~/extension-core/pg/index.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
import { PgArray, PgColumn, type PgInsertConfig } from '~/pg-core/index.ts';
import {
	type BuildRelationalQueryResult,
	One,
	type TableRelationalConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { ExtensionParam, Placeholder } from '~/sql/index.ts';
import { orderSelectedFields } from '~/utils.ts';
import {
	buildDecoder,
	buildEncoder,
	downloadFile,
	// downloadFileMeta,
	mapParams,
	objectIdToText,
	presignDownload,
	textToObjectId,
	uploadFile,
} from '../common.ts';
import type {
	DrizzleS3FileInputMappingInstruction,
	DrizzleS3FileOutputMappingInstruction,
	DrizzleS3FileOutputMappingInstructionIterableNode,
	DrizzleS3FilePlaceholderMappingInstruction,
	S3ExtMeta,
} from '../common.ts';
import type { PgS3File } from './column.ts';

export class DrizzlePgS3Extension extends DrizzlePgExtension<S3ExtMeta> {
	static override readonly [entityKind]: string = 'DrizzlePgS3Extension';

	static override readonly [extensionName] = 'Drizzle PostgreSQL S3 Extension';

	private s3: S3Client;

	constructor(client: S3Client | S3ClientConfig) {
		super();

		// eslint-disable-next-line no-instanceof/no-instanceof
		this.s3 = typeof client === 'object' && (client instanceof S3Client || client.constructor.name !== 'Object')
			? client as S3Client
			: new S3Client(client);
	}

	private buildOutputMappingInstructions(selection: SelectedFieldsOrdered<PgColumn>) {
		const paths: DrizzleS3FileOutputMappingInstruction[] = [];

		for (const f of selection) {
			if (
				!is(f.field, PgColumn) || !(<PgColumn> f.field)[requiredExtension]
				|| !is(this, f.field[requiredExtension]!)
			) continue;

			let field = f.field as PgColumn;
			let dimensions = 0;
			while (is(field, PgArray)) {
				field = field.baseColumn;
				++dimensions;
			}

			const column = field as PgS3File;

			const { fetchMode, fileMode, options } = column[extensionColumnConfig];

			paths.push({
				path: f.path.map((p) => `[${JSON.stringify(p)}]`),
				fetchMode: fetchMode,
				fileMode: fileMode,
				options: options,
				arrayDimensions: dimensions,
			});
		}

		return paths;
	}

	private buildRqbOutputMappingInstructions(
		schema: TablesRelationalConfig,
		table: TableRelationalConfig,
		selection: BuildRelationalQueryResult['selection'],
		parent?: DrizzleS3FileOutputMappingInstructionIterableNode,
		prefix: string[] = [],
	) {
		const p: DrizzleS3FileOutputMappingInstructionIterableNode = parent ?? {
			path: [],
			subinstructions: [],
		};

		for (const s of selection) {
			if (is(s.field, PgColumn)) {
				if (!s.field[requiredExtension] || !is(this, s.field[requiredExtension])) continue;

				let column = s.field;
				let dimensions = 0;
				while (is(column, PgArray)) {
					column = column.baseColumn;
					++dimensions;
				}

				const extCol = column as PgS3File;

				(p.subinstructions ??= []).push({
					path: [...prefix, `[${JSON.stringify(s.tsKey)}]`],
					arrayDimensions: dimensions,
					fileMode: extCol[extensionColumnConfig].fileMode,
					fetchMode: extCol[extensionColumnConfig].fetchMode,
					options: extCol[extensionColumnConfig].options,
				});

				continue;
			}

			if (s.selection) {
				const relation = schema[s.relationTableTsKey!]!;

				if (is(table.relations[s.tsKey]!, One)) {
					this.buildRqbOutputMappingInstructions(schema, relation, s.selection, p, [
						...prefix,
						`[${JSON.stringify(s.tsKey)}]`,
					]);

					continue;
				}

				const nestedSubs = this.buildRqbOutputMappingInstructions(schema, relation, s.selection);
				if (!nestedSubs.length) continue;

				(p.subinstructions ??= []).push({
					path: [...prefix, `[${JSON.stringify(s.tsKey)}]`],
					subinstructions: nestedSubs,
				});
			}
		}

		return p.subinstructions;
	}

	private buildParamMappingInstructions(params: unknown[]) {
		const indexes: DrizzleS3FileInputMappingInstruction[] = [];
		const placeholders: DrizzleS3FilePlaceholderMappingInstruction[] = [];
		let i = 0;
		for (const item of params) {
			if (!is(item, ExtensionParam) || !is(this, item.extension)) {
				++i;
				continue;
			}

			let dimensions = 0;
			let column = item.encoder;
			while (is(column, PgArray)) {
				column = column.baseColumn;
				++dimensions;
			}

			if (is(item.value, Placeholder)) {
				placeholders.push({
					key: item.value.name,
					mode: (column as PgS3File)[extensionColumnConfig].fileMode,
					arrayDimensions: dimensions,
				});
				++i;
				continue;
			}

			indexes.push({
				index: i++,
				mode: (column as PgS3File)[extensionColumnConfig].fileMode,
				arrayDimensions: dimensions,
			});
		}

		return {
			placeholders,
			indexes,
		};
	}

	private async hookBefore(context: DrizzlePgHookContext<S3ExtMeta> & { stage: 'before' }) {
		if (!context?.params?.length) return;

		let indexes: DrizzleS3FileInputMappingInstruction[] = [];
		let placeholders: DrizzleS3FilePlaceholderMappingInstruction[] = [];
		const errors: unknown[] = [];

		switch (context.query) {
			case 'select':
			case 'delete': {
				break;
			}

			case 'update':
			case 'insert': {
				if ((context.config as PgInsertConfig).select) {
					break;
				}

				const instr = this.buildParamMappingInstructions(context.params);

				indexes = instr.indexes;
				placeholders = instr.placeholders;

				break;
			}
		}

		await mapParams(this.s3, context.params, indexes, errors);

		if (errors.length) {
			throw new DrizzleError({
				message: `Error${
					errors.length > 1 ? 's' : ''
				} occured during S3 file upload.\nLog "(e as DrizzleError).cause" for details.`,
				cause: errors,
			});
		}

		if (!context.metadata?.encoder) {
			context.metadata = context.metadata ?? {};

			context.metadata.encoder = buildEncoder(placeholders);
		}

		await context.metadata.encoder(this.s3, context.placeholders, errors, uploadFile, objectIdToText);

		if (errors.length) {
			throw new DrizzleError({
				message: `Error${
					errors.length > 1 ? 's' : ''
				} occured during S3 file upload.\nLog "(e as DrizzleError).cause" for details.`,
				cause: errors,
			});
		}

		return;
	}

	private async hookAfter(context: DrizzlePgHookContext<S3ExtMeta> & { stage: 'after' }) {
		const errors: unknown[] = [];
		const data = context.data as Record<string, unknown>[];

		switch (context.query) {
			case 'select': {
				if (!data.length) return;

				if (!context.metadata?.decoder) {
					const fields = context.fieldsOrdered ?? context.config.fieldsFlat
						?? orderSelectedFields<PgColumn>(context.config.fields);

					const instructions = this.buildOutputMappingInstructions(fields);

					const decoder = buildDecoder(instructions);

					context.metadata = context.metadata ?? {};
					context.metadata.decoder = decoder;
				}

				break;
			}

			case '_query': {
				if ((context.mode === 'first' && !data) || (context.mode === 'many' && !data.length)) return;

				if (!context.metadata?.decoder) {
					const instructions = this.buildRqbOutputMappingInstructions(
						context.tablesConfig,
						context.tableConfig,
						context.config.selection,
					);

					const decoder = buildDecoder(instructions, context.mode);

					context.metadata = context.metadata ?? {};
					context.metadata.decoder = decoder;
				}

				break;
			}

			case 'update':
			case 'delete':
			case 'insert': {
				if (!data.length) return;

				if (!context.metadata?.decoder) {
					if (!(context.config.returning ?? context.config.returningFields)) {
						const decoder = buildDecoder([]);

						context.metadata = context.metadata ?? {};
						context.metadata.decoder = decoder;

						break;
					}

					const fields = context.config.returning ?? orderSelectedFields<PgColumn>(context.config.returningFields!);

					const instructions = this.buildOutputMappingInstructions(fields);

					const decoder = buildDecoder(instructions);

					context.metadata = context.metadata ?? {};
					context.metadata.decoder = decoder;
				}
				break;
			}
		}

		await context.metadata.decoder(
			this.s3,
			data,
			errors,
			downloadFile,
			// downloadFileMeta,
			presignDownload,
			textToObjectId,
		);

		if (errors.length) {
			throw new DrizzleError({
				message: `Error${
					errors.length > 1 ? 's' : ''
				} occured during S3 file download.\nLog "(e as DrizzleError).cause" for details.`,
				cause: errors,
			});
		}

		return;
	}

	override async hook(context: DrizzlePgHookContext<S3ExtMeta>) {
		return context.stage === 'before' ? await this.hookBefore(context) : await this.hookAfter(context);
	}
}

export function s3FileExt(client: S3Client | S3ClientConfig): DrizzlePgS3Extension {
	return new DrizzlePgS3Extension(client);
}
