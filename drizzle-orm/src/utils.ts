import { View } from '~/view.ts';
import { type CodecsCollection, jsonObjectCodecs } from './codecs.ts';
import type { AnyColumn } from './column.ts';
import { Column } from './column.ts';
import { is } from './entity.ts';
import type { Logger } from './logger.ts';
import type {
	SelectedFieldsFlat,
	SelectedFieldsOrdered,
	SelectedJsonField,
	SelectedJsonFieldsOrdered,
} from './operations.ts';
import type { TableLike } from './query-builders/select.types.ts';
import type { AnyRelations, EmptyRelations } from './relations.ts';
import { chunkKindOf, chunkKinds, isChunk, type JsonArray, type JsonObject, Param, type SQL } from './sql/sql.ts';
import type { DriverValueDecoder, SQLWrapper } from './sql/sql.ts';
import type { Subquery } from './subquery.ts';
import { getTableName, Table } from './table.ts';
import { ViewBaseConfig } from './view-common.ts';

/** @internal */
export function resolveNullableObjectPaths(
	columns: SelectedFieldsOrdered<AnyColumn>,
	joinsNotNullableMap: Record<string, boolean> | undefined,
): string[] | undefined {
	if (!joinsNotNullableMap) return undefined;

	// prefix -> table
	const tableOf = new Map<string, string | false>();
	const order: string[] = [];
	const seen = new Set<string>();

	for (const { path, field, fieldType } of columns) {
		if (path.length < 2) continue;
		const key = path[0]!;
		if (!seen.has(key)) {
			seen.add(key);
			order.push(key);
		}
		let tableName: string;
		if (fieldType === 'Column') tableName = getTableName(field.table);
		else if ((fieldType === 'JsonObject' || fieldType === 'JsonArray') && field.origin !== undefined) {
			tableName = field.origin;
		} else continue;
		const current = tableOf.get(key);
		if (current === undefined) tableOf.set(key, tableName);
		else if (current !== false && current !== tableName) tableOf.set(key, false);
	}

	const result: string[] = [];
	for (const key of order) {
		const table = tableOf.get(key);
		// sql field only group remains not nullable due to lack of table to be bound to
		if (typeof table === 'string' && !joinsNotNullableMap[table]) result.push(key);
	}

	return result;
}

function nullablePathTargets(
	columns: SelectedFieldsOrdered<AnyColumn>,
	nullableObjectPaths: string[],
): { key: string; leaves: number[] }[] {
	const targets: {
		key: string;
		leaves: number[];
	}[] = new Array(nullableObjectPaths.length);

	for (let i = 0; i < nullableObjectPaths.length; ++i) {
		const key = nullableObjectPaths[i]!;
		const leaves: number[] = [];
		for (let j = 0; j < columns.length; ++j) {
			const cp = columns[j]!.path;
			if (cp.length > 1 && cp[0] === key) leaves.push(j);
		}

		targets[i] = { key, leaves };
	}

	return targets;
}

/** @internal bypass bundle-time filtering */
export const FnConstructor = Object.getPrototypeOf(() => null).constructor as typeof Function;

type JsonObjectSelectionItem = SelectedJsonField<AnyColumn>;
type JsonPlainItem = Exclude<JsonObjectSelectionItem, { fieldType: 'JsonObject' | 'JsonArray' }>;

function jsonSelectionOf(
	item: SelectedFieldsOrdered<AnyColumn>[number] | JsonObjectSelectionItem,
): SelectedJsonFieldsOrdered<AnyColumn> | undefined {
	return item.fieldType === 'JsonObject' || item.fieldType === 'Subquery' ? item.selection : undefined;
}

function jsonElementOf(
	item: SelectedFieldsOrdered<AnyColumn>[number] | JsonObjectSelectionItem,
): JsonObjectSelectionItem | undefined {
	return item.fieldType === 'JsonArray' || item.fieldType === 'Subquery' ? item.element : undefined;
}

/** JSON objects, JSON arrays and subqueries selecting either of them */
function isJsonNode(item: SelectedFieldsOrdered<AnyColumn>[number] | JsonObjectSelectionItem): boolean {
	return jsonSelectionOf(item) !== undefined || jsonElementOf(item) !== undefined;
}

function jsonFieldDecoderSource(
	item: JsonPlainItem,
): DriverValueDecoder<unknown, unknown> & { mapFromJsonValue?: (value: unknown) => unknown } {
	switch (item.fieldType) {
		case 'Column':
			return item.field;
		case 'SQL':
			return item.field.decoder;
		case 'SQL.Aliased':
			return item.field.sql.decoder;
		case 'Subquery':
			return item.field._.sql.decoder;
	}
}

/** Decoder of JSON object or array, `codec` parses the node itself when it's selected outside of JSON */
function makeJsonNodeDecoder(
	item: SelectedFieldsOrdered<AnyColumn>[number] | JsonObjectSelectionItem,
): ((v: any) => any) | undefined {
	const { codec, arrayDimensions } = item;
	const selection = jsonSelectionOf(item);
	const inner = selection ? makeJsonObjectDecoder(selection) : makeJsonArrayDecoder(jsonElementOf(item)!);
	if (!codec) return inner;
	if (!inner) return (v: any) => codec(v, arrayDimensions!);

	return (v: any) => {
		const parsed = codec(v, arrayDimensions!);
		return parsed === null ? parsed : inner(parsed);
	};
}

function makeJsonFieldDecoder(item: JsonObjectSelectionItem): ((v: any) => any) | undefined {
	if (isJsonNode(item)) return makeJsonNodeDecoder(item);

	const { codec, arrayDimensions } = item;
	const decoderSrc = jsonFieldDecoderSource(item as JsonPlainItem);
	if (decoderSrc.mapFromJsonValue) return (v: any) => decoderSrc.mapFromJsonValue!(v);

	if (decoderSrc.mapFromDriverValue.isNoop) {
		return codec ? (v: any) => codec(v, arrayDimensions!) : undefined;
	}

	return codec
		? (v: any) => decoderSrc.mapFromDriverValue(codec(v, arrayDimensions!))
		: (v: any) => decoderSrc.mapFromDriverValue(v);
}

/** Maps JSON object's values in place, returns `undefined` if there's nothing to map */
function makeJsonObjectDecoder(
	selection: SelectedJsonFieldsOrdered<AnyColumn>,
): ((v: Record<string, unknown>) => Record<string, unknown>) | undefined {
	const keys: string[] = [];
	const decoders: ((v: any) => any)[] = [];
	for (const item of selection) {
		const decoder = makeJsonFieldDecoder(item);
		if (!decoder) continue;

		keys.push(item.key);
		decoders.push(decoder);
	}

	if (!decoders.length) return undefined;

	return (obj) => {
		for (let i = 0; i < keys.length; ++i) {
			const key = keys[i]!;
			const value = obj[key];
			if (value === null || value === undefined) continue;

			obj[key] = decoders[i]!(value);
		}

		return obj;
	};
}

/**
 * @internal
 * Maps JSON array's elements in place, returns `undefined` if there's nothing to map
 */
export function makeJsonArrayDecoder(element: JsonObjectSelectionItem): ((v: unknown[]) => unknown[]) | undefined {
	const decoder = makeJsonFieldDecoder(element);
	if (!decoder) return undefined;

	return (arr) => {
		for (let i = 0; i < arr.length; ++i) {
			const value = arr[i];
			if (value === null || value === undefined) continue;

			arr[i] = decoder(value);
		}

		return arr;
	};
}

/** Expression decoding non-null plain JSON value held in `slot`, `undefined` if there's nothing to decode */
function makeJitJsonLeaf(
	item: JsonPlainItem,
	slot: string,
	itemExpr: string,
	preFn: string[],
	counter: { n: number },
): string | undefined {
	const { codec, arrayDimensions } = item;
	const decoderSrc = jsonFieldDecoderSource(item);
	const decVar = `jdec${counter.n++}`;
	let destructure: string;
	switch (item.fieldType) {
		case 'Column':
			destructure = `field: ${decVar}`;
			break;
		case 'SQL':
			destructure = `field: { decoder: ${decVar} }`;
			break;
		case 'SQL.Aliased':
			destructure = `field: { sql: { decoder: ${decVar} } }`;
			break;
		case 'Subquery':
			destructure = `field: { _: { sql: { decoder: ${decVar} } } }`;
			break;
	}

	let decoderExpr = '';
	let codecVar = '';
	if (decoderSrc.mapFromJsonValue) {
		// Legacy custom column JSON api bypasses codecs
		decoderExpr = `${decVar}.mapFromJsonValue`;
	} else {
		if (!decoderSrc.mapFromDriverValue.isNoop) decoderExpr = `${decVar}.mapFromDriverValue`;
		if (codec) codecVar = `jcodec${counter.n++}`;
	}

	const parts: string[] = [];
	if (decoderExpr) parts.push(destructure);
	if (codecVar) parts.push(`codec: ${codecVar}`);
	if (!parts.length) return undefined;

	preFn.push(`const { ${parts.join(', ')} } = ${itemExpr};`);

	let decoded = slot;
	if (codecVar) decoded = `${codecVar}(${decoded}, ${arrayDimensions})`;
	if (decoderExpr) decoded = `${decoderExpr}(${decoded})`;
	return decoded;
}

/** Statements decoding non-null JSON object or array held in `slot` in place */
function makeJitJsonNode(
	item: SelectedFieldsOrdered<AnyColumn>[number] | JsonObjectSelectionItem,
	slot: string,
	itemExpr: string,
	preFn: string[],
	counter: { n: number },
): string[] {
	const { codec, arrayDimensions } = item;
	const stmts: string[] = [];
	if (codec) {
		const codecVar = `jcodec${counter.n++}`;
		preFn.push(`const { codec: ${codecVar} } = ${itemExpr};`);
		stmts.push(`${slot} = ${codecVar}(${slot}, ${arrayDimensions});`);
	}

	const inner: string[] = [];
	const savedPreFnLen = preFn.length;
	const selection = jsonSelectionOf(item);
	if (selection) {
		const selVar = `jsel${counter.n++}`;
		preFn.push(`const { selection: ${selVar} } = ${itemExpr};`);

		const object = makeJitJsonObjectInner(selection, slot, selVar, preFn, counter);
		if (object.hasWork) inner.push(...object.bodyStmts, `${slot} = ${object.literal};`);
	} else {
		const element = jsonElementOf(item)!;
		const elementVar = `jel${counter.n++}`;
		const value = `je${counter.n++}`;
		const idx = `jk${counter.n++}`;
		preFn.push(`const { element: ${elementVar} } = ${itemExpr};`);

		const decode = makeJitJsonValue(element, value, elementVar, preFn, counter);
		if (decode.length) {
			inner.push(
				`for (let ${idx} = 0; ${idx} < ${slot}.length; ++${idx}) {`,
				`\tlet ${value} = ${slot}[${idx}];`,
				`\tif (${value} === null) continue;`,
				...decode.map((s) => `\t${s}`),
				`\t${slot}[${idx}] = ${value};`,
				`}`,
			);
		}
	}

	if (!inner.length) {
		preFn.splice(savedPreFnLen, 1);
		return stmts;
	}

	// Codec may decode JSON to null
	if (codec) stmts.push(`if (${slot} !== null) {`, ...inner.map((s) => `\t${s}`), `}`);
	else stmts.push(...inner);

	return stmts;
}

/** Statements decoding non-null JSON value held in `slot` in place */
function makeJitJsonValue(
	item: JsonObjectSelectionItem,
	slot: string,
	itemExpr: string,
	preFn: string[],
	counter: { n: number },
): string[] {
	if (isJsonNode(item)) return makeJitJsonNode(item, slot, itemExpr, preFn, counter);

	const decoded = makeJitJsonLeaf(item as JsonPlainItem, slot, itemExpr, preFn, counter);
	return decoded ? [`${slot} = ${decoded};`] : [];
}

function makeJitJsonObjectInner(
	selection: SelectedJsonFieldsOrdered<AnyColumn>,
	valueExpr: string,
	selectionVar: string,
	preFn: string[],
	counter: { n: number },
): { bodyStmts: string[]; literal: string; hasWork: boolean } {
	const bodyStmts: string[] = [];
	const literalEntries: string[] = [];
	let hasWork = false;

	const vars = selection.map(() => `j${counter.n++}`);
	bodyStmts.push(
		`let { ${selection.map((item, i) => `${JSON.stringify(item.key)}: ${vars[i]}`).join(', ')} } = ${valueExpr};`,
	);

	for (let idx = 0; idx < selection.length; ++idx) {
		const item = selection[idx]!;
		const sel = `${selectionVar}[${idx}]`;
		const keyStr = JSON.stringify(item.key);
		const slot = vars[idx]!;

		if (isJsonNode(item)) {
			const stmts = makeJitJsonNode(item, slot, sel, preFn, counter);
			if (stmts.length) {
				hasWork = true;
				bodyStmts.push(`if (${slot} !== null) {`);
				for (const s of stmts) bodyStmts.push(`\t${s}`);
				bodyStmts.push(`}`);
			}

			literalEntries.push(`${keyStr}: ${slot}`);
			continue;
		}

		const decoded = makeJitJsonLeaf(item as JsonPlainItem, slot, sel, preFn, counter);
		if (!decoded) {
			literalEntries.push(`${keyStr}: ${slot}`);
			continue;
		}

		hasWork = true;
		literalEntries.push(`${keyStr}: ${slot} === null ? null : ${decoded}`);
	}

	return { bodyStmts, literal: `{ ${literalEntries.join(', ')} }`, hasWork };
}

/** @internal */
function makeJitQueryMapperInner(
	columns: SelectedFieldsOrdered<AnyColumn>,
	nullableObjectPaths?: string[],
): string {
	const preFn = [] as string[];
	const fn = [] as string[];
	fn.push(`const [ ${columns.map((_, i) => `c${i}`).join(', ')} ] = rows[i];`);

	// top-level key -> the c-ids of every leaf nested under it, so a nullable group can test them all at once.
	const descendantIds: Record<string, string[]> = {};
	const nullableKeys = new Set(nullableObjectPaths ?? []);
	const decodes = new Array<string>(columns.length);
	const jsonCounter = { n: 0 };

	for (let idx = 0; idx < columns.length; ++idx) {
		const column = columns[idx]!;
		const { field, fieldType, path, codec, arrayDimensions } = column;
		if (path.length > 1) (descendantIds[path[0]!] ??= []).push(`c${idx}`);

		if (isJsonNode(column)) {
			const colStr = `c${idx}`;
			const objStr = `o${idx}`;
			const stmts = makeJitJsonNode(column, objStr, `columns[${idx}]`, preFn, jsonCounter);
			if (!stmts.length) {
				decodes[idx] = colStr;
				continue;
			}

			fn.push(`let ${objStr} = ${colStr};`, `if (${objStr} !== null) {`);
			for (const s of stmts) fn.push(`\t${s}`);
			fn.push(`}`);

			decodes[idx] = objStr;
			continue;
		}

		let decoder: DriverValueDecoder<unknown, unknown>;
		let decoderStr: string;
		let decoderFieldDestructure: string;
		switch (fieldType) {
			case 'Column':
				decoder = field;
				decoderFieldDestructure = `field: decoder${idx}`;
				break;
			case 'SQL':
				decoder = field.decoder;
				decoderFieldDestructure = `field: { decoder: decoder${idx} }`;
				break;
			case 'Subquery':
				decoder = field._.sql.decoder;
				decoderFieldDestructure = `field: { _: { sql: { decoder: decoder${idx} } } }`;
				break;
			case 'SQL.Aliased':
				decoder = field.sql.decoder;
				decoderFieldDestructure = `field: { sql: { decoder: decoder${idx} } }`;
				break;
			case 'JsonObject':
			case 'JsonArray':
				throw new Error(`Unexpected ${fieldType}`);
			default:
				assertUnreachable(fieldType);
		}
		decoderStr = `decoder${idx}.mapFromDriverValue`;
		if (decoder.mapFromDriverValue.isNoop) decoderStr = '';
		if (decoderStr) {
			preFn.push(`const { ${decoderFieldDestructure}${codec ? `, codec: codec${idx}` : ''} } = columns[${idx}];`);
		} else if (codec) {
			preFn.push(`const { codec: codec${idx} } = columns[${idx}];`);
		}

		const colStr = `c${idx}`;
		let decodedValue = colStr;
		if (codec) decodedValue = `codec${idx}(${decodedValue}, ${arrayDimensions})`;
		if (decoderStr) decodedValue = `${decoderStr}(${decodedValue})`;
		decodes[idx] = colStr === decodedValue
			? `${colStr}`
			: `${colStr} === null ? ${colStr} : ${decodedValue}`;
	}

	fn.push(`mapped[i] = {`);
	let currentObjectPath: string[] = [];
	for (let idx = 0; idx < columns.length; ++idx) {
		const { path } = columns[idx]!;
		const jsonPath = path.map((e) => JSON.stringify(e));
		const decodedValue = decodes[idx]!;

		const objectPath = path.slice(0, -1);
		let commonLen = 0;
		while (
			commonLen < currentObjectPath.length
			&& commonLen < objectPath.length
			&& currentObjectPath[commonLen] === objectPath[commonLen]
		) commonLen++;

		for (let d = currentObjectPath.length - 1; d >= commonLen; --d) {
			fn.push(`${'\t'.repeat(d + 1)}},`);
		}

		for (let d = commonLen; d < objectPath.length; ++d) {
			const nullable = d === 0 && nullableKeys.has(path[0]!);
			fn.push(
				`${'\t'.repeat(d + 1)}${jsonPath[d]}: ${
					nullable
						? `${descendantIds[path[0]!]!.map((c) => `${c} === null`).join(' && ')} ? null : {`
						: '{'
				}`,
			);
		}

		currentObjectPath = objectPath;
		fn.push(`${'\t'.repeat(path.length)}${jsonPath[path.length - 1]}: ${decodedValue},`);
	}

	for (let d = currentObjectPath.length - 1; d >= 0; --d) {
		fn.push(`${'\t'.repeat(d + 1)}},`);
	}
	fn.push(`};`);

	return `${preFn.length ? `${preFn.join('\n\t')}\n\t` : ''}for (let i = 0; i < length; ++i) {
		${fn.join('\n\t\t')}
	}`;
}

export type RowsMapperGenerator = <TResult = any>(
	columns: SelectedFieldsOrdered<AnyColumn>,
	nullableObjectPaths: string[] | undefined,
) => RowsMapper<TResult> | undefined;
export interface RowsMapper<TResult = Record<string, unknown>[]> {
	(rows: unknown[][]): TResult;
	/** @internal jit mapper's function body for debugging */
	body?: string;
}

export function makeJitQueryMapper<TResult>(
	columns: SelectedFieldsOrdered<AnyColumn>,
	nullableObjectPaths: string[] | undefined,
): RowsMapper<TResult> {
	const internals = `\t"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = new Array(length);
	${makeJitQueryMapperInner(columns, nullableObjectPaths)}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper`;

	const fn = Object.assign(
		new FnConstructor(
			'rows',
			internals,
		).bind({
			columns,
		}),
		{ body: `function jitQueryMapper (rows) {\n${internals}\n}` },
	) as RowsMapper<TResult>;

	return fn;
}

/** @internal */
export function jitCompatCheck(isEnabled?: boolean): boolean {
	if (!isEnabled) return false;

	try {
		const res = new FnConstructor('input', '"use strict"; return input;')(true);
		if (res !== true) {
			// In case it's broken in runtime but not forbidden
			console.warn(
				'Unable to use jit mappers due to incompatibility: corrupted jit function output.\nFalling back to premade mappers.\nError details:',
			);
			console.error(`Expected to receive \`true\`, got: ${res}`);
		}
		return true;
	} catch (e) {
		console.warn(
			'Unable to use jit mappers due to incompatibility.\nFalling back to premade mappers.\nError details:',
		);
		console.error(e);
		return false;
	}
}

export function makeDefaultQueryMapper<TResult>(
	columns: SelectedFieldsOrdered<AnyColumn>,
	nullableObjectPaths: string[] | undefined,
): RowsMapper<TResult> {
	const interpretedData: (((v: any) => any) | undefined)[] = new Array(columns.length);
	for (let i = 0; i < columns.length; ++i) {
		const column = columns[i]!;
		const { field, fieldType, codec, arrayDimensions } = column;

		if (isJsonNode(column)) {
			interpretedData[i] = makeJsonNodeDecoder(column);
			continue;
		}

		let decoderSrc: DriverValueDecoder<unknown, unknown>;
		switch (fieldType) {
			case 'Column':
				decoderSrc = field;
				break;
			case 'SQL':
				decoderSrc = field.decoder;
				break;
			case 'Subquery':
				decoderSrc = field._.sql.decoder;
				break;
			case 'SQL.Aliased':
				decoderSrc = field.sql.decoder;
				break;
			case 'JsonObject':
			case 'JsonArray':
				throw new Error(`Unexpected ${fieldType}`);
			default:
				assertUnreachable(fieldType);
		}

		let decoder: ((v: any) => any) | undefined;
		if (decoderSrc.mapFromDriverValue.isNoop) {
			decoder = codec ? (v: any) => codec(v, arrayDimensions!) : undefined;
		} else {
			decoder = codec
				? (v: any) => decoderSrc.mapFromDriverValue(codec(v, arrayDimensions!))
				: (v: any) => decoderSrc.mapFromDriverValue(v);
		}

		interpretedData[i] = decoder;
	}

	const targets = nullableObjectPaths?.length
		? nullablePathTargets(columns, nullableObjectPaths)
		: undefined;

	return ((rows) => {
		const { length: rowLength } = rows;
		const output: TResult[] = new Array(rowLength);
		for (let j = 0; j < rowLength; ++j) {
			const row = rows[j]!;

			const result: Record<string, any> = {};

			for (let i = 0; i < columns.length; ++i) {
				const { path } = columns[i]!;

				let node = result;
				for (let p = 0; p < path.length; ++p) {
					const pathChunk = path[p]!;
					if (p < path.length - 1) {
						if (!(pathChunk in node)) {
							node[pathChunk] = {};
						}
						node = node[pathChunk];
					} else {
						const decoder = interpretedData[i]!;
						const rawValue = row[i]!;
						node[pathChunk] = rawValue === null
							? null
							: decoder
							? decoder(rawValue)
							: rawValue;
					}
				}
			}

			// Nullify every top-level nullable group whose leaves are all null on this row.
			if (targets) {
				for (let i = 0; i < targets.length; ++i) {
					const { key, leaves }: { key: string; leaves: number[] } = targets[i]!;

					let allNull = true;
					for (let j = 0; j < leaves.length; ++j) {
						const i = leaves[j]!;

						if (row[i] !== null) {
							allNull = false;
							break;
						}
					}
					if (allNull) result[key] = null;
				}
			}

			output[j] = result as TResult;
		}

		return output;
	}) as RowsMapper<TResult>;
}

export function make$ReturningResponseMapper(
	returningIds: SelectedFieldsOrdered<Column> | undefined,
	generatedIds?: Record<string, unknown>[],
) {
	if (!returningIds) return;

	return ({ insertId, affectedRows }: {
		insertId: number;
		affectedRows: number;
	}) => {
		const returningResponse = [];
		let j = 0;
		for (let i = insertId; i < insertId + affectedRows; i++) {
			for (const column of returningIds) {
				const key = returningIds[0]!.path[0]!;
				if (is(column.field, Column)) {
					// @ts-ignore
					if (column.field.primary && column.field.autoIncrement) {
						returningResponse.push({ [key]: i });
					}
					if (column.field.defaultFn && generatedIds) {
						// generatedIds[rowIdx][key]
						returningResponse.push({ [key]: generatedIds[j]![key] });
					}
				}
			}
			j++;
		}

		return returningResponse;
	};
}

/** Decoder of JSON object selected outside of JSON - nested ones are embedded as JSON and need none */
function topLevelJsonObjectCodec(codecs: CodecsCollection | undefined) {
	if (!codecs) return;

	const identifier = jsonObjectCodecs[codecs.dialect];
	return identifier && codecs.get(identifier, 'normalize');
}

/** @internal */
export function orderSelectedFields<TColumn extends AnyColumn>(
	fields: Record<string, unknown>,
	pathPrefix?: string[],
	codecs?: CodecsCollection,
): SelectedFieldsOrdered<TColumn>;
/**
 * @deprecated `result` argument is used for internal recursion, do not use outside of the function
 * @internal
 */
export function orderSelectedFields<TColumn extends AnyColumn>(
	fields: Record<string, unknown>,
	pathPrefix?: string[],
	codecs?: CodecsCollection,
	result?: SelectedFieldsOrdered<AnyColumn>,
): SelectedFieldsOrdered<TColumn>;
/** @internal */
export function orderSelectedFields<TColumn extends AnyColumn>(
	fields: Record<string, unknown>,
	pathPrefix?: string[],
	codecs?: CodecsCollection,
	result: SelectedFieldsOrdered<AnyColumn> = [],
): SelectedFieldsOrdered<TColumn> {
	const entries = Object.entries(fields);

	for (let i = 0; i < entries.length; ++i) {
		const [name, field] = entries[i]!;
		if (typeof name !== 'string') {
			return result as SelectedFieldsOrdered<TColumn>;
		}

		const newPath = pathPrefix ? [...pathPrefix, name] : [name];
		const kind = chunkKindOf(field);

		if (isChunk(field, kind, chunkKinds.column)) {
			result.push({
				path: newPath,
				field: field,
				fieldType: 'Column',
				codec: codecs?.get(field, 'normalize'),
				arrayDimensions: (<any> field).dimensions,
				column: field,
			});
		} else if (isChunk(field, kind, chunkKinds.sql)) {
			const col = getColumnFromDecoder(field);
			result.push(
				col
					? {
						path: newPath,
						field,
						fieldType: 'SQL',
						codec: codecs?.get(col, 'normalize'),
						arrayDimensions: (<any> col).dimensions,
						column: col,
					}
					: {
						path: newPath,
						field,
						fieldType: 'SQL',
					},
			);
		} else if (isChunk(field, kind, chunkKinds.aliased)) {
			const col = getColumnFromDecoder(field);
			result.push(
				col
					? {
						path: newPath,
						field,
						fieldType: 'SQL.Aliased',
						codec: codecs?.get(col, 'normalize'),
						arrayDimensions: (<any> col).dimensions,
						column: col,
					}
					: {
						path: newPath,
						field,
						fieldType: 'SQL.Aliased',
					},
			);
		} else if (isChunk(field, kind, chunkKinds.subquery)) {
			let column: Column | undefined;
			const entries = Object.values(field._.selectedFields) as (
				| SQL.Aliased
				| Column
				| SQL
				| JsonObject
				| JsonArray
			)[];
			const entry = entries[0]!;
			const entryKind = chunkKindOf(entry);

			if (isChunk(entry, entryKind, chunkKinds.jsonObject)) {
				result.push({
					path: newPath,
					field,
					fieldType: 'Subquery',
					selection: orderSelectedJsonFields(entry, codecs),
					codec: topLevelJsonObjectCodec(codecs),
				});
				continue;
			}

			if (isChunk(entry, entryKind, chunkKinds.jsonArray)) {
				result.push({
					path: newPath,
					field,
					fieldType: 'Subquery',
					element: orderSelectedJsonField('', entry.item, codecs),
					codec: topLevelJsonObjectCodec(codecs),
				});
				continue;
			}

			let fieldDecoder: DriverValueDecoder<any, any>;
			if (isChunk(entry, entryKind, chunkKinds.column)) {
				column = entry;
				fieldDecoder = entry;
			} else if (isChunk(entry, entryKind, chunkKinds.sql)) {
				column = getColumnFromDecoder(entry);
				fieldDecoder = entry.decoder;
			} else {
				column = getColumnFromDecoder(entry);
				fieldDecoder = entry.sql.decoder;
			}

			if (fieldDecoder) {
				field._.sql.decoder = fieldDecoder;
			}

			result.push(
				column
					? {
						path: newPath,
						field,
						fieldType: 'Subquery',
						codec: codecs?.get(column, 'normalize'),
						arrayDimensions: (<any> column).dimensions,
						column,
					}
					: {
						path: newPath,
						field,
						fieldType: 'Subquery',
					},
			);
		} else if (isChunk(field, kind, chunkKinds.table)) {
			orderSelectedFields(field[Table.Symbol.Columns], newPath, codecs, result);
		} else if (isChunk(field, kind, chunkKinds.jsonObject)) {
			result.push({
				fieldType: 'JsonObject',
				field: field,
				path: newPath,
				selection: orderSelectedJsonFields(field, codecs),
				codec: topLevelJsonObjectCodec(codecs),
			});
		} else if (isChunk(field, kind, chunkKinds.jsonArray)) {
			result.push({
				fieldType: 'JsonArray',
				field: field,
				path: newPath,
				element: orderSelectedJsonField('', field.item, codecs),
				codec: topLevelJsonObjectCodec(codecs),
			});
		} else {
			orderSelectedFields(field as Record<string, unknown>, newPath, codecs, result);
		}
	}

	return result as SelectedFieldsOrdered<TColumn>;
}

function orderSelectedJsonFields<TColumn extends AnyColumn>(
	object: JsonObject,
	codecs?: CodecsCollection,
): SelectedJsonFieldsOrdered<TColumn> {
	const entries = Object.entries(object.selection);
	const result: SelectedJsonFieldsOrdered<AnyColumn> = new Array(entries.length);

	for (let i = 0; i < entries.length; ++i) {
		const [key, field] = entries[i]!;
		result[i] = orderSelectedJsonField(key, field, codecs);
	}

	return result as SelectedJsonFieldsOrdered<TColumn>;
}

/** 'JsonArray' items get empty key */
function orderSelectedJsonField(
	key: string,
	field: unknown,
	codecs?: CodecsCollection,
): SelectedJsonField<AnyColumn> {
	const kind = chunkKindOf(field);

	if (isChunk(field, kind, chunkKinds.column)) {
		return {
			key,
			fieldType: 'Column',
			field,
			codec: codecs?.get(field, 'normalizeInJson'),
			arrayDimensions: (<any> field).dimensions,
			column: field,
		};
	}

	if (isChunk(field, kind, chunkKinds.sql)) {
		const col = getColumnFromDecoder(field);
		return col
			? {
				key,
				field,
				fieldType: 'SQL',
				codec: codecs?.get(col, 'normalizeInJson'),
				arrayDimensions: (<any> col).dimensions,
				column: col,
			}
			: {
				key,
				field,
				fieldType: 'SQL',
			};
	}

	if (isChunk(field, kind, chunkKinds.aliased)) {
		const col = getColumnFromDecoder(field);
		return col
			? {
				key,
				field,
				fieldType: 'SQL.Aliased',
				codec: codecs?.get(col, 'normalizeInJson'),
				arrayDimensions: (<any> col).dimensions,
				column: col,
			}
			: {
				key,
				field,
				fieldType: 'SQL.Aliased',
			};
	}

	if (isChunk(field, kind, chunkKinds.subquery)) {
		let column: Column | undefined;
		const entries = Object.values(field._.selectedFields) as (
			| SQL.Aliased
			| Column
			| SQL
			| JsonObject
			| JsonArray
		)[];
		const entry = entries[0]!;
		const entryKind = chunkKindOf(entry);

		if (isChunk(entry, entryKind, chunkKinds.jsonObject)) {
			return {
				key,
				field,
				fieldType: 'Subquery',
				selection: orderSelectedJsonFields(entry, codecs),
			};
		}

		if (isChunk(entry, entryKind, chunkKinds.jsonArray)) {
			return {
				key,
				field,
				fieldType: 'Subquery',
				element: orderSelectedJsonField('', entry.item, codecs),
			};
		}

		let fieldDecoder: DriverValueDecoder<any, any>;
		if (isChunk(entry, entryKind, chunkKinds.column)) {
			column = entry;
			fieldDecoder = entry;
		} else if (isChunk(entry, entryKind, chunkKinds.sql)) {
			column = getColumnFromDecoder(entry);
			fieldDecoder = entry.decoder;
		} else {
			column = getColumnFromDecoder(entry);
			fieldDecoder = entry.sql.decoder;
		}

		if (fieldDecoder) {
			field._.sql.decoder = fieldDecoder;
		}

		return column
			? {
				key,
				field,
				fieldType: 'Subquery',
				codec: codecs?.get(column, 'normalizeInJson'),
				arrayDimensions: (<any> column).dimensions,
				column,
			}
			: {
				key,
				field,
				fieldType: 'Subquery',
			};
	}

	if (isChunk(field, kind, chunkKinds.jsonObject)) {
		return {
			key,
			fieldType: 'JsonObject',
			field: field,
			selection: orderSelectedJsonFields(field, codecs),
		};
	}

	if (isChunk(field, kind, chunkKinds.jsonArray)) {
		return {
			key,
			fieldType: 'JsonArray',
			field: field,
			element: orderSelectedJsonField('', field.item, codecs),
		};
	}

	throw new Error(`Unknown JSON field type`);
}

export function getColumnFromDecoder(source: SQL | SQL.Aliased | SQLWrapper): Column | undefined {
	const { decoder } = source.getSQL();

	return isChunk(decoder, chunkKindOf(decoder), chunkKinds.column) ? decoder : undefined;
}

export function haveSameKeys(left: Record<string, unknown>, right: Record<string, unknown>) {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);

	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const [index, key] of leftKeys.entries()) {
		if (key !== rightKeys[index]) {
			return false;
		}
	}

	return true;
}

/** @internal */
export function mapUpdateSet(table: Table, values: Record<string, unknown>): UpdateSet {
	const entries = Object.entries(values).filter(([, value]) => value !== undefined);

	if (entries.length === 0) {
		throw new Error('No values to set');
	}

	const mapped: [string, UpdateSet[string]][] = new Array(entries.length);
	for (let i = 0; i < entries.length; ++i) {
		const [key, value] = entries[i]!;
		// eslint-disable-next-line unicorn/prefer-ternary
		const kind = chunkKindOf(value);
		if (isChunk(value, kind, chunkKinds.sql) || isChunk(value, kind, chunkKinds.column)) {
			mapped[i] = [key, value];
		} else {
			mapped[i] = [key, new Param(value, table[Table.Symbol.Columns][key])];
		}
	}

	return Object.fromEntries(mapped);
}

export type UpdateSet = Record<string, SQL | Param | AnyColumn | null | undefined>;

export type OneOrMany<T> = T | T[];

export type Update<T, TUpdate> =
	& {
		[K in Exclude<keyof T, keyof TUpdate>]: T[K];
	}
	& TUpdate;

export type Simplify<T> =
	& {
		// @ts-ignore - "Type parameter 'K' has a circular constraint", not sure why
		[K in keyof T]: T[K];
	}
	& {};

export type Not<T extends boolean> = T extends true ? false : true;

export type IsNever<T> = [T] extends [never] ? true : false;

export type IsUnion<T, U extends T = T> = (T extends any ? (U extends T ? false : true) : never) extends false ? false
	: true;

export type SingleKeyObject<T, TError extends string, K = keyof T> = IsNever<K> extends true ? never
	: IsUnion<K> extends true ? DrizzleTypeError<TError>
	: T;

export type FromSingleKeyObject<T, Result, TError extends string, K = keyof T> = IsNever<K> extends true ? never
	: IsUnion<K> extends true ? DrizzleTypeError<TError>
	: Result;

export type SimplifyMappedType<T> = [T] extends [unknown] ? T : never;

export type ShallowRecord<K extends keyof any, T> = SimplifyMappedType<{ [P in K]: T }>;

export type Assume<T, U> = T extends U ? T : U;

export type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

export interface DrizzleTypeError<T extends string> {
	$drizzleTypeError: T;
}

export type ValueOrArray<T> = T | T[];

/** @internal */
export function applyMixins(baseClass: any, extendedClasses: any[]) {
	for (const extendedClass of extendedClasses) {
		for (const name of Object.getOwnPropertyNames(extendedClass.prototype)) {
			if (name === 'constructor') continue;

			Object.defineProperty(
				baseClass.prototype,
				name,
				Object.getOwnPropertyDescriptor(extendedClass.prototype, name) || Object.create(null),
			);
		}
	}
}

export type Or<T1, T2> = T1 extends true ? true : T2 extends true ? true : false;

export type IfThenElse<If, Then, Else> = If extends true ? Then : Else;

export type PromiseOf<T> = T extends Promise<infer U> ? U : T;

export type Writable<T> = {
	-readonly [P in keyof T]: T[P];
};

export type NonArray<T> = T extends any[] ? never : T;

export type EnumObjectValues<T extends object> = [T[keyof T]] extends [infer V extends string] ? [V, ...V[]]
	: [string, ...string[]];

export function getTableColumns<T extends Table>(table: T): T['_']['columns'] {
	return table[Table.Symbol.Columns];
}

export function getViewSelectedFields<T extends View>(view: T): T['_']['selectedFields'] {
	return view[ViewBaseConfig].selectedFields;
}

export function getColumns<T extends Table | View | Subquery>(
	table: T,
): T extends Table ? T['_']['columns']
	: T extends View ? T['_']['selectedFields']
	: T extends Subquery ? T['_']['selectedFields']
	: never
{
	return (is(table, Table)
		? table[Table.Symbol.Columns]
		: is(table, View)
		? table[ViewBaseConfig].selectedFields
		: table._.selectedFields) as any;
}

/** @internal */
export function getTableLikeName(table: TableLike): string | undefined {
	const kind = chunkKindOf(table);
	return isChunk(table, kind, chunkKinds.subquery)
		? table._.alias
		: isChunk(table, kind, chunkKinds.view)
		? table[ViewBaseConfig].name
		: isChunk(table, kind, chunkKinds.sql)
		? undefined
		: table[Table.Symbol.IsAlias]
		? table[Table.Symbol.Name]
		: table[Table.Symbol.BaseName];
}

export type ColumnsWithTable<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyColumn<{ tableName: TTableName }>[],
> = { [Key in keyof TColumns]: AnyColumn<{ tableName: TForeignTableName }> };

export interface DrizzleConfig<TRelationConfigs extends AnyRelations = EmptyRelations> {
	logger?: boolean | Logger | undefined;
	relations?: TRelationConfigs | undefined;
	jit?: boolean | undefined;
	/** Put query params in `DrizzleQueryError` instances
	 *
	 * @default false
	 */
	paramsInErrors?: boolean | undefined;
}

export type ValidateShape<T, ValidShape, TResult = T> = T extends ValidShape
	? Exclude<keyof T, keyof ValidShape> extends never ? TResult
	: DrizzleTypeError<
		`Invalid key(s): ${Exclude<(keyof T) & (string | number | bigint | boolean | null | undefined), keyof ValidShape>}`
	>
	: never;

export type KnownKeysOnly<T, U> = {
	[K in keyof T]: K extends keyof U ? T[K] : never;
};

export type IsAny<T> = 0 extends (1 & T) ? true : false;

/** @internal */
export function getColumnNameAndConfig<
	TConfig extends Record<string, any> | undefined,
>(a: string | TConfig | undefined, b: TConfig | undefined) {
	return {
		name: typeof a === 'string' && a.length > 0 ? a : '' as string,
		config: typeof a === 'object' ? a : b as TConfig,
	};
}

export type IfNotImported<T, Y, N> = unknown extends T ? Y : N;

export type ImportTypeError<TPackageName extends string> =
	`Please install \`${TPackageName}\` to allow Drizzle ORM to connect to the database`;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Keys extends any
	? Required<Pick<T, Keys>> & Partial<Omit<T, Keys>>
	: never;

export function isConfig(data: any): boolean {
	if (typeof data !== 'object' || data === null) return false;

	if (data.constructor.name !== 'Object') return false;

	if ('logger' in data) {
		const type = typeof data['logger'];
		if (
			type !== 'boolean' && (type !== 'object' || typeof data['logger']['logQuery'] !== 'function')
			&& type !== 'undefined'
		) return false;

		return true;
	}

	if ('relations' in data) {
		const type = typeof data['relations'];
		if (type !== 'object' && type !== 'undefined') return false;

		return true;
	}

	if ('connection' in data) {
		const type = typeof data['connection'];
		if (type !== 'string' && type !== 'object' && type !== 'undefined') return false;

		return true;
	}

	if ('client' in data) {
		const type = typeof data['client'];
		if (type !== 'object' && type !== 'function' && type !== 'undefined') return false;

		return true;
	}

	if ('paramsInErrors' in data) {
		const type = typeof data['paramsInErrors'];
		if (type !== 'boolean' && type !== 'undefined') return false;

		return true;
	}

	if ('jit' in data) {
		const type = typeof data['jit'];
		if (type !== 'boolean' && type !== 'undefined') return false;

		return true;
	}

	if ('codecs' in data) {
		const type = typeof data['codecs'];
		if (type !== 'object' && type !== 'undefined') return false;

		return true;
	}

	if (Object.keys(data).length === 0) return true;

	return false;
}

export type NeonAuthToken = string | (() => string | Promise<string>);

let textEncoder: TextEncoder | null | undefined;

const getTextEncoder = (): TextEncoder | null => {
	if (textEncoder !== undefined) return textEncoder;
	return (textEncoder = typeof TextEncoder === 'function' ? new TextEncoder() : null);
};

/**
 * Writes UTF-8 bytes of `value` into `dest` starting at `offset`, returns the number of written bytes.
 *
 * `dest` must have at least `value.length * 3` bytes of space after `offset`.
 *
 * Lone surrogates are written as U+FFFD, identical to `TextEncoder`.
 */
function encodeUtf8IntoJs(value: string, dest: Uint8Array, offset: number): number {
	let pos = offset;
	for (let i = 0; i < value.length; ++i) {
		let code = value.charCodeAt(i);

		if (code < 0x80) {
			dest[pos++] = code;
			continue;
		}

		if (code < 0x800) {
			dest[pos++] = 0xc0 | (code >> 6);
			dest[pos++] = 0x80 | (code & 0x3f);
			continue;
		}

		if (code >= 0xd800 && code <= 0xdfff) {
			const next = i + 1 < value.length ? value.charCodeAt(i + 1) : 0;
			if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
				code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
				++i;
				dest[pos++] = 0xf0 | (code >> 18);
				dest[pos++] = 0x80 | ((code >> 12) & 0x3f);
				dest[pos++] = 0x80 | ((code >> 6) & 0x3f);
				dest[pos++] = 0x80 | (code & 0x3f);
				continue;
			}
			code = 0xfffd;
		}

		dest[pos++] = 0xe0 | (code >> 12);
		dest[pos++] = 0x80 | ((code >> 6) & 0x3f);
		dest[pos++] = 0x80 | (code & 0x3f);
	}
	return pos - offset;
}

/**
 * Writes UTF-8 bytes of `value` into `dest` starting at `offset`, returns the number of written bytes.
 *
 * `dest` must have at least `value.length * 3` bytes of space after `offset`.
 *
 * Lone surrogates are written as U+FFFD, identical to `TextEncoder`.
 */
export function encodeUtf8Into(value: string, dest: Uint8Array, offset: number): number {
	const encoder = getTextEncoder();
	if (encoder && typeof encoder.encodeInto === 'function') {
		return encoder.encodeInto(value, dest.subarray(offset)).written;
	}
	return encodeUtf8IntoJs(value, dest, offset);
}

export function encodeUtf8(value: string): Uint8Array<ArrayBuffer> {
	const encoder = getTextEncoder();
	if (encoder) return encoder.encode(value);

	const dest = new Uint8Array(value.length * 3);
	return dest.subarray(0, encodeUtf8IntoJs(value, dest, 0));
}

const textDecoder: TextDecoder | null = typeof TextDecoder === 'function' ? new TextDecoder() : null;

/**
 * Decodes UTF-8, replacing malformed sequences with U+FFFD.
 *
 * Fallback follows the WHATWG UTF-8 decoder algorithm, so output is identical to `TextDecoder`'s
 */
export function decodeUtf8(bytes: Uint8Array): string {
	if (textDecoder) return textDecoder.decode(bytes);

	let out = '';
	let units: number[] = [];
	const emit = (code: number) => {
		if (code > 0xffff) {
			code -= 0x10000;
			units.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
		} else units.push(code);

		if (units.length >= 8192) {
			out += String.fromCharCode.apply(null, units);
			units = [];
		}
	};

	let codePoint = 0;
	let needed = 0;
	let seen = 0;
	let lower = 0x80;
	let upper = 0xbf;

	for (let i = 0; i < bytes.length; ++i) {
		const byte = bytes[i]!;

		if (needed === 0) {
			if (byte <= 0x7f) emit(byte);
			else if (byte >= 0xc2 && byte <= 0xdf) {
				needed = 1;
				codePoint = byte & 0x1f;
			} else if (byte >= 0xe0 && byte <= 0xef) {
				if (byte === 0xe0) lower = 0xa0;
				if (byte === 0xed) upper = 0x9f;
				needed = 2;
				codePoint = byte & 0x0f;
			} else if (byte >= 0xf0 && byte <= 0xf4) {
				if (byte === 0xf0) lower = 0x90;
				if (byte === 0xf4) upper = 0x8f;
				needed = 3;
				codePoint = byte & 0x07;
			} else emit(0xfffd);
			continue;
		}

		if (byte < lower || byte > upper) {
			// Ill-formed sequence: replace what was consumed so far, then reprocess this byte
			codePoint = needed = seen = 0;
			lower = 0x80;
			upper = 0xbf;
			emit(0xfffd);
			--i;
			continue;
		}

		lower = 0x80;
		upper = 0xbf;
		codePoint = (codePoint << 6) | (byte & 0x3f);
		if (++seen === needed) {
			emit(codePoint);
			codePoint = needed = seen = 0;
		}
	}
	if (needed !== 0) emit(0xfffd);

	return out + String.fromCharCode.apply(null, units);
}

export function memoizeEscape(escape: (name: string) => string, limit = 4096): (name: string) => string {
	const cache = new Map<string, string>();
	return (name) => {
		let escaped = cache.get(name);
		if (escaped === undefined) {
			if (cache.size >= limit) cache.clear();
			escaped = escape(name);
			cache.set(name, escaped);
		}
		return escaped;
	};
}

export function assertUnreachable(_x: never | undefined): never {
	throw new Error("Didn't expect to get here");
}

export function isWithEnum(column: Column<any>): column is typeof column & { enumValues: [string, ...string[]] };
export function isWithEnum(value: unknown): value is { enumValues: [string, ...string[]] };
export function isWithEnum(value: unknown): boolean {
	return ((typeof value === 'object' && value !== null) || typeof value === 'function') && 'enumValues' in value
		&& Array.isArray(value.enumValues)
		&& value.enumValues.length > 0;
}

export type Literal = string | number | boolean | null;
export type Json = Literal | { [key: string]: any } | any[];

export type ColumnIsGeneratedAlwaysAs<TColumn> = TColumn extends Column<any>
	? TColumn['_']['identity'] extends 'always' ? true
	: TColumn['_'] extends { generated: undefined } ? false
	: TColumn['_']['generated'] extends { type: 'byDefault' } ? false
	: true
	: false;

export type GetSelection<T extends SelectedFieldsFlat<Column<any>> | Table<any> | View> = T extends Table<any>
	? T['_']['columns']
	: T extends View ? T['_']['selectedFields']
	: T;

export type RemoveNeverElements<T extends any[]> = T extends [infer First, ...infer Rest]
	? IsNever<First> extends true ? RemoveNeverElements<Rest>
	: [First, ...RemoveNeverElements<Rest>]
	: [];

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { [K in TEnumValues[number]]: K };

export type EnumValuesToReadonlyEnum<TEnumValues extends [string, ...string[]]> = {
	readonly [K in TEnumValues[number]]: K;
};

export const CONSTANTS = {
	INT8_MIN: -128,
	INT8_MAX: 127,
	INT8_UNSIGNED_MAX: 255,
	INT16_MIN: -32768,
	INT16_MAX: 32767,
	INT16_UNSIGNED_MAX: 65535,
	INT24_MIN: -8388608,
	INT24_MAX: 8388607,
	INT24_UNSIGNED_MAX: 16777215,
	INT32_MIN: -2147483648,
	INT32_MAX: 2147483647,
	INT32_UNSIGNED_MAX: 4294967295,
	INT48_MIN: -140737488355328,
	INT48_MAX: 140737488355327,
	INT48_UNSIGNED_MAX: 281474976710655,
	INT64_MIN: -9223372036854775808n,
	INT64_MAX: 9223372036854775807n,
	INT64_UNSIGNED_MAX: 18446744073709551615n,
};

export function base64ToUint8Array(base64: string): Uint8Array {
	if (!base64) return new Uint8Array(0);
	const binary = atob(base64);
	const len = binary.length;
	const bytes = new Uint8Array(len);

	for (let i = 0; i < len; ++i) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes;
}

export function pgHexToUint8Array(hex: string): Uint8Array {
	const len = (hex.length - 2) >> 1;
	const bytes = new Uint8Array(len);

	for (let i = 0; i < len; ++i) {
		bytes[i] = Number.parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
	}

	return bytes;
}

export type PartialWithUndefined<T> = {
	[K in keyof T]?: T[K] | undefined;
};

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I
	: never;

export type LastInUnion<U> = UnionToIntersection<U extends any ? (x: U) => void : never> extends (x: infer M) => void
	? M
	: never;

export type UnionToTuple<U, Last = LastInUnion<U>> = [U] extends [never] ? []
	: [...UnionToTuple<Exclude<U, Last>>, Last];

export type JoinTuple<T extends any[], Separator extends string> = T extends [] ? ''
	: T extends [string | number | boolean | bigint] ? `${T[0]}`
	: T extends [string | number | boolean | bigint, ...infer U] ? `${T[0]}${Separator}${JoinTuple<U, Separator>}`
	: string;

export type JoinUnion<U extends string, Separator extends string> = JoinTuple<UnionToTuple<U>, Separator>;
