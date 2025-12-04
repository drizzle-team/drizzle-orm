import type { Field } from '@aws-sdk/client-rds-data';
import type { TypeHint } from '@aws-sdk/client-rds-data';
import type { QueryTypingsValue } from '~/sql/sql.ts';

export const typeHint: { [K in TypeHint]: K } = {
	DATE: 'DATE',
	DECIMAL: 'DECIMAL',
	JSON: 'JSON',
	TIME: 'TIME',
	TIMESTAMP: 'TIMESTAMP',
	UUID: 'UUID',
};

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
	} else {
		throw new Error('Unknown type');
	}
}

export function typingsToAwsTypeHint(typings?: QueryTypingsValue): TypeHint | undefined {
	if (typings === 'date') {
		return typeHint.DATE;
	} else if (typings === 'decimal') {
		return typeHint.DECIMAL;
	} else if (typings === 'json') {
		return typeHint.JSON;
	} else if (typings === 'time') {
		return typeHint.TIME;
	} else if (typings === 'timestamp') {
		return typeHint.TIMESTAMP;
	} else if (typings === 'uuid') {
		return typeHint.UUID;
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
			case typeHint.DATE: {
				response.value = { stringValue: value.split('T')[0]! };
				break;
			}
			case typeHint.TIMESTAMP: {
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
	} else if (value instanceof Date) { // oxlint-disable-line drizzle-internal/no-instanceof
		// TODO: check if this clause is needed? Seems like date value always comes as string
		response.value = { stringValue: value.toISOString().replace('T', ' ').replace('Z', '') };
	} else {
		throw new Error(`Unknown type for ${value}`);
	}

	return response;
}
