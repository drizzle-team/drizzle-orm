import { Field, TypeHint } from "@aws-sdk/client-rds-data";
import { QueryTypingsValue } from "~/sql";

export function getValueFromDataApi(row: Field) {
    if (typeof row.stringValue !== 'undefined') {
        return row.stringValue;
    } else if (typeof row.booleanValue !== 'undefined') {
        return row.booleanValue;
    } else if (typeof row.doubleValue !== 'undefined') {
        return row.doubleValue;
    } else if (typeof row.isNull !== 'undefined') {
        return null;
    } else if (typeof row.longValue !== 'undefined') {
        return row.longValue;
    } else if (typeof row.blobValue !== 'undefined') {
        return row.blobValue;
    } else if (typeof row.arrayValue !== 'undefined') {
        if (typeof row.arrayValue.stringValues !== 'undefined') {
            return row.arrayValue.stringValues;
        }
        throw Error('Unknown array type');
    } else {
        throw Error('Unknown type');
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
    let response: { value: Field; typeHint?: TypeHint } = {
        value: {} as any,
        typeHint: typingsToAwsTypeHint(typings),
    };

    if (value === null) {
        response.value = { isNull: true };
    } else if (typeof value === 'string') {
        if (response.typeHint === 'DATE') {
            response.value = { stringValue: value.split('T')[0]! };
        } else {
            response.value = { stringValue: value };
        }
    } else if (typeof value === 'number' && Number.isInteger(value)) {
        response.value = { longValue: value };
    } else if (typeof value === 'number' && !Number.isInteger(value)) {
        response.value = { doubleValue: value };
    } else if (typeof value === 'boolean') {
        response.value = { booleanValue: value };
    } else if (value instanceof Date) {
        response.value = { stringValue: value.toISOString().replace('T', ' ').replace('Z', '') };
    } else {
        throw Error(`Unknown type for ${value}`);
    }

    return response;
}