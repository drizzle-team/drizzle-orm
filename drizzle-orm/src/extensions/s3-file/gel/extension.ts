import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { DrizzleGelExtension, type DrizzleGelHookContext } from '~/extension-core/gel/index.ts';
import { extensionColumnConfig, extensionName, requiredExtension } from '~/extension-core/index.ts';
import { GelArray, GelColumn, type GelInsertConfig } from '~/gel-core/index.ts';
import type { SelectedFieldsOrdered } from '~/operations.ts';
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
import type { GelS3File } from './column.ts';

export class DrizzleGelS3Extension extends DrizzleGelExtension<S3ExtMeta> {
	static override readonly [entityKind]: string = 'DrizzleGelS3Extension';

	static override readonly [extensionName] = 'Drizzle Gel S3 Extension';

	private s3: S3Client;

	constructor(client: S3Client | S3ClientConfig) {
		super();

		// eslint-disable-next-line no-instanceof/no-instanceof
		this.s3 = typeof client === 'object' && (client instanceof S3Client || client.constructor.name !== 'Object')
			? client as S3Client
			: new S3Client(client);
	}

	private buildOutputMappingInstructions(selection: SelectedFieldsOrdered<GelColumn>) {
		const paths: DrizzleS3FileOutputMappingInstruction[] = [];

		for (const f of selection) {
			if (
				!is(f.field, GelColumn) || !(<GelColumn> f.field)[requiredExtension]
				|| !is(this, f.field[requiredExtension]!)
			) continue;

			let field = f.field as GelColumn;
			let dimensions = 0;
			while (is(field, GelArray)) {
				field = field.baseColumn;
				++dimensions;
			}

			const column = field as GelS3File;

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
			if (is(s.field, GelColumn)) {
				if (!s.field[requiredExtension] || !is(this, s.field[requiredExtension])) continue;

				let column = s.field;
				let dimensions = 0;
				while (is(column, GelArray)) {
					column = column.baseColumn;
					++dimensions;
				}

				const extCol = column as GelS3File;

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
			while (is(column, GelArray)) {
				column = column.baseColumn;
				++dimensions;
			}

			if (is(item.value, Placeholder)) {
				placeholders.push({
					key: item.value.name,
					mode: (column as GelS3File)[extensionColumnConfig].fileMode,
					arrayDimensions: dimensions,
				});
				++i;
				continue;
			}

			indexes.push({
				index: i++,
				mode: (column as GelS3File)[extensionColumnConfig].fileMode,
				arrayDimensions: dimensions,
			});
		}

		return {
			placeholders,
			indexes,
		};
	}

	private async hookBefore(context: DrizzleGelHookContext<S3ExtMeta> & { stage: 'before' }) {
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
				if ((context.config as GelInsertConfig).select) break;

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

	private async hookAfter(context: DrizzleGelHookContext<S3ExtMeta> & { stage: 'after' }) {
		const errors: unknown[] = [];
		const data = context.data as Record<string, unknown>[];

		switch (context.query) {
			case 'select': {
				if (!data.length) return;

				if (!context.metadata?.decoder) {
					const fields = context.fieldsOrdered ?? context.config.fieldsFlat
						?? orderSelectedFields<GelColumn>(context.config.fields);

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
			case 'insert':
			case 'delete': {
				if (!data.length) return;

				if (!context.metadata?.decoder) {
					if (!(context.config.returning)) {
						const decoder = buildDecoder([]);

						context.metadata = context.metadata ?? {};
						context.metadata.decoder = decoder;

						break;
					}

					const fields = context.config.returning;

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

	override async hook(context: DrizzleGelHookContext<S3ExtMeta>) {
		return context.stage === 'before' ? await this.hookBefore(context) : await this.hookAfter(context);
	}
}

export function s3FileExt(client: S3Client | S3ClientConfig): DrizzleGelS3Extension {
	return new DrizzleGelS3Extension(client);
}
