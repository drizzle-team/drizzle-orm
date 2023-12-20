import type { Field } from '@aws-sdk/client-rds-data';
import { TypeHint } from '@aws-sdk/client-rds-data';
import type { QueryTypingsValue } from '~/sql/sql.ts';

export function getValueFromDataApi(field: Field) {
	if (field.stringValue !== undefined) {
		return field.stringValue;
	} else if (field.booleanValue !== undefined) {
		return field.booleanValue;
	} else if (field.doubleValue !== undefined) {
		return field.doubleValue;
	} else if (field.isNull !== undefined) {
		return null;
	} else if (field.longValue !== undefined) {
		return field.longValue;
	} else if (field.blobValue !== undefined) {
		return field.blobValue;
		// eslint-disable-next-line unicorn/no-negated-condition
	} else if (field.arrayValue !== undefined) {
		if (field.arrayValue.stringValues !== undefined) {
			return field.arrayValue.stringValues;
		}
		throw new Error('Unknown array type');
	} else {
		throw new Error('Unknown type');
	}
}

export function typingsToAwsTypeHint(typings?: QueryTypingsValue): TypeHint | undefined {
	if (typings === 'date') {
		return TypeHint.DATE;
	} else if (typings === 'decimal') {
		return TypeHint.DECIMAL;
	} else if (typings === 'json') {
		return TypeHint.JSON;
	} else if (typings === 'time') {
		return TypeHint.TIME;
	} else if (typings === 'timestamp') {
		return TypeHint.TIMESTAMP;
	} else if (typings === 'uuid') {
		return TypeHint.UUID;
	} else {
		return undefined;
	}
}

export function toValueParam(value: any, typings?: QueryTypingsValue): { value: Field; typeHint?: TypeHint } {
	const response: { value: Field; typeHint?: TypeHint } = {
		value: {} as any,
		typeHint: typingsToAwsTypeHint(typings),
	};

	if (value === null) {
		response.value = { isNull: true };
	} else if (typeof value === 'string') {
		switch (response.typeHint) {
			case TypeHint.DATE: {
				response.value = { stringValue: value.split('T')[0]! };
				break;
			}
			case TypeHint.TIMESTAMP: {
				response.value = { stringValue: value.replace('T', ' ').replace('Z', '') };
				break;
			}
			default: {
				response.value = { stringValue: value };
				break;
			}
		}
	} else if (typeof value === 'number' && Number.isInteger(value)) {
		response.value = { longValue: value };
	} else if (typeof value === 'number' && !Number.isInteger(value)) {
		response.value = { doubleValue: value };
	} else if (typeof value === 'boolean') {
		response.value = { booleanValue: value };
	} else if (value instanceof Date) { // eslint-disable-line no-instanceof/no-instanceof
		// TODO: check if this clause is needed? Seems like date value always comes as string
		response.value = { stringValue: value.toISOString().replace('T', ' ').replace('Z', '') };
	} else {
		throw new Error(`Unknown type for ${value}`);
	}

	return response;
}
