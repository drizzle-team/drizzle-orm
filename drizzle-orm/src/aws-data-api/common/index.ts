import type { Field } from '@aws-sdk/client-rds-data';

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
		if (field.arrayValue.stringValues !== undefined) {
			return field.arrayValue.stringValues;
		}
		if (field.arrayValue.longValues !== undefined) {
			return field.arrayValue.longValues;
		}
		if (field.arrayValue.doubleValues !== undefined) {
			return field.arrayValue.doubleValues;
		}
		if (field.arrayValue.booleanValues !== undefined) {
			return field.arrayValue.booleanValues;
		}
		if (field.arrayValue.arrayValues !== undefined) {
			return field.arrayValue.arrayValues;
		}

		throw new Error('Unknown array type');
	}

	throw new Error('Unknown type');
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
	if (value instanceof Date) { // oxlint-disable-line drizzle-internal/no-instanceof
		return { stringValue: value.toISOString().replace('T', ' ').replace('Z', '') };
	}
	if ((typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) || value instanceof Uint8Array) { // oxlint-disable-line drizzle-internal/no-instanceof
		return { blobValue: value };
	}

	throw new Error(`Unknown type for ${value}`);
}
