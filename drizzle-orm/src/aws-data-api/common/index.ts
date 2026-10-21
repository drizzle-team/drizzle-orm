import type { ArrayValue, Field, SqlParameter } from '@aws-sdk/client-rds-data';
import { makePgArray } from '~/pg-core/array.ts';

export function getValueFromDataApi(field: Field) {
	if (field.stringValue !== undefined) {
		return field.stringValue;
	}
	if (field.booleanValue !== undefined) {
		return field.booleanValue;
	}
	if (field.doubleValue !== undefined) {
		return field.doubleValue;
	}
	if (field.isNull !== undefined) {
		return null;
	}
	if (field.longValue !== undefined) {
		return field.longValue;
	}
	if (field.blobValue !== undefined) {
		return field.blobValue;
	}

	if (field.arrayValue !== undefined) {
		return getArrayFromDataApi(field.arrayValue);
	}

	throw new Error('Unknown type');
}

function getArrayFromDataApi(value: ArrayValue): unknown[] {
	if (value.stringValues !== undefined) {
		return value.stringValues;
	}
	if (value.longValues !== undefined) {
		return value.longValues;
	}
	if (value.doubleValues !== undefined) {
		return value.doubleValues;
	}
	if (value.booleanValues !== undefined) {
		return value.booleanValues;
	}
	if (value.arrayValues !== undefined) {
		return value.arrayValues.map(getArrayFromDataApi);
	}

	throw new Error('Unknown array type');
}

export function toValueParam(value: any): Field {
	if (value === null) {
		return { isNull: true };
	}

	const valueType = typeof value;
	if (valueType === 'string') {
		return { stringValue: value };
	}
	if (valueType === 'number') {
		return Number.isInteger(value) ? { longValue: value } : { doubleValue: value };
	}
	if (valueType === 'boolean') {
		return { booleanValue: value };
	}
	if (valueType === 'bigint') {
		return { stringValue: value.toString() };
	}
	if (value instanceof Date) {
		return { stringValue: value.toISOString().replace('T', ' ').replace('Z', '') };
	}
	if ((typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) || value instanceof Uint8Array) {
		return { blobValue: value };
	}
	if (Array.isArray(value)) {
		return { stringValue: makePgArray(value) };
	}
	if (valueType === 'object') {
		return { stringValue: JSON.stringify(value) };
	}

	throw new Error(`Unknown type for ${value}`);
}

export function toSqlParameter(name: string, value: any): SqlParameter {
	const field = toValueParam(value);

	// Objects that aren't bound to a json column have no cast to tell the type, so it has to be hinted instead
	if (
		value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
		&& field.stringValue !== undefined
	) {
		return { name, value: field, typeHint: 'JSON' };
	}

	return { name, value: field };
}
