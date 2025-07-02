import { generatorsMap } from '../generators/GeneratorFuncs.ts';
import type { Column, Table } from '../types/tables.ts';

export const selectGeneratorForSingleStoreColumn = (
	table: Table,
	col: Column,
) => {
	const pickGenerator = (table: Table, col: Column) => {
		// INT ------------------------------------------------------------------------------------------------------------
		if (
			(col.columnType.includes('serial') || col.columnType.includes('int'))
			&& table.primaryKeys.includes(col.name)
		) {
			const generator = new generatorsMap.GenerateIntPrimaryKey[0]();
			return generator;
		}

		let minValue: number | bigint | undefined;
		let maxValue: number | bigint | undefined;
		if (col.columnType === 'serial') {
			// 2^64 % 2 - 1, 8 bytes
			minValue = BigInt(0);
			maxValue = BigInt('9223372036854775807');
		} else if (col.columnType.includes('int')) {
			if (col.columnType === 'tinyint') {
				// 2^8 / 2 - 1, 1 bytes
				minValue = -128;
				maxValue = 127;
			} else if (col.columnType === 'smallint') {
				// 2^16 / 2 - 1, 2 bytes
				minValue = -32768;
				maxValue = 32767;
			} else if (col.columnType === 'mediumint') {
				// 2^16 / 2 - 1, 2 bytes
				minValue = -8388608;
				maxValue = 8388607;
			} else if (col.columnType === 'int') {
				// 2^32 / 2 - 1, 4 bytes
				minValue = -2147483648;
				maxValue = 2147483647;
			} else if (col.columnType === 'bigint') {
				// 2^64 / 2 - 1, 8 bytes
				minValue = BigInt('-9223372036854775808');
				maxValue = BigInt('9223372036854775807');
			}
		}

		if (col.columnType.includes('int')) {
			const generator = new generatorsMap.GenerateInt[0]({
				minValue,
				maxValue,
			});
			return generator;
		}

		if (col.columnType.includes('serial')) {
			const generator = new generatorsMap.GenerateIntPrimaryKey[0]();
			generator.maxValue = maxValue;
			return generator;
		}

		// NUMBER(real, double, decimal, float)
		if (
			col.columnType.startsWith('real')
			|| col.columnType.startsWith('double')
			|| col.columnType.startsWith('decimal')
			|| col.columnType.startsWith('float')
			|| col.columnType.startsWith('numeric')
		) {
			if (col.typeParams.precision !== undefined) {
				const precision = col.typeParams.precision;
				const scale = col.typeParams.scale === undefined ? 0 : col.typeParams.scale;

				const maxAbsoluteValue = Math.pow(10, precision - scale) - Math.pow(10, -scale);
				const generator = new generatorsMap.GenerateNumber[0]({
					minValue: -maxAbsoluteValue,
					maxValue: maxAbsoluteValue,
					precision: Math.pow(10, scale),
				});
				return generator;
			}

			const generator = new generatorsMap.GenerateNumber[0]();
			return generator;
		}

		// STRING
		if (
			(col.columnType === 'tinytext'
				|| col.columnType === 'mediumtext'
				|| col.columnType === 'text'
				|| col.columnType === 'longtext'
				|| col.columnType === 'blob'
				|| col.columnType.startsWith('char')
				|| col.columnType.startsWith('varchar')
				|| col.columnType.startsWith('binary')
				|| col.columnType.startsWith('varbinary'))
			&& table.primaryKeys.includes(col.name)
		) {
			const generator = new generatorsMap.GenerateUniqueString[0]();
			return generator;
		}

		if (
			(col.columnType === 'tinytext'
				|| col.columnType === 'mediumtext'
				|| col.columnType === 'text'
				|| col.columnType === 'longtext'
				|| col.columnType === 'blob'
				|| col.columnType.startsWith('char')
				|| col.columnType.startsWith('varchar')
				|| col.columnType.startsWith('binary')
				|| col.columnType.startsWith('varbinary'))
			&& col.name.toLowerCase().includes('name')
		) {
			const generator = new generatorsMap.GenerateFirstName[0]();
			return generator;
		}

		if (
			(col.columnType === 'tinytext'
				|| col.columnType === 'mediumtext'
				|| col.columnType === 'text'
				|| col.columnType === 'longtext'
				|| col.columnType === 'blob'
				|| col.columnType.startsWith('char')
				|| col.columnType.startsWith('varchar')
				|| col.columnType.startsWith('binary')
				|| col.columnType.startsWith('varbinary'))
			&& col.name.toLowerCase().includes('email')
		) {
			const generator = new generatorsMap.GenerateEmail[0]();
			return generator;
		}

		if (
			col.columnType === 'tinytext'
			|| col.columnType === 'mediumtext'
			|| col.columnType === 'text'
			|| col.columnType === 'longtext'
			|| col.columnType === 'blob'
			|| col.columnType.startsWith('char')
			|| col.columnType.startsWith('varchar')
			|| col.columnType.startsWith('binary')
			|| col.columnType.startsWith('varbinary')
		) {
			const generator = new generatorsMap.GenerateString[0]();
			return generator;
		}

		// BOOLEAN
		if (col.columnType === 'boolean') {
			const generator = new generatorsMap.GenerateBoolean[0]();
			return generator;
		}

		// DATE, TIME, TIMESTAMP, DATETIME, YEAR
		if (col.columnType.includes('datetime')) {
			const generator = new generatorsMap.GenerateDatetime[0]();
			return generator;
		}

		if (col.columnType.includes('date')) {
			const generator = new generatorsMap.GenerateDate[0]();
			return generator;
		}

		if (col.columnType === 'time') {
			const generator = new generatorsMap.GenerateTime[0]();
			return generator;
		}

		if (col.columnType.includes('timestamp')) {
			const generator = new generatorsMap.GenerateTimestamp[0]();
			return generator;
		}

		if (col.columnType === 'year') {
			const generator = new generatorsMap.GenerateYear[0]();
			return generator;
		}

		// JSON
		if (col.columnType === 'json') {
			const generator = new generatorsMap.GenerateJson[0]();
			return generator;
		}

		// ENUM
		if (col.enumValues !== undefined) {
			const generator = new generatorsMap.GenerateEnum[0]({
				enumValues: col.enumValues,
			});
			return generator;
		}

		// vector
		if (col.columnType.startsWith('vector')) {
			let minValue: number | undefined,
				maxValue: number | undefined,
				decimalPlaces: number | undefined;
			if (col.typeParams.vectorValueType === 'I8') {
				minValue = -128;
				maxValue = 127;
				decimalPlaces = 0;
			} else if (col.typeParams.vectorValueType === 'I16') {
				minValue = -32768;
				maxValue = 32767;
				decimalPlaces = 0;
			} else if (col.typeParams.vectorValueType === 'I32') {
				minValue = -2147483648;
				maxValue = 2147483647;
				decimalPlaces = 0;
			} else if (col.typeParams.vectorValueType === 'I64') {
				minValue = Number.MIN_SAFE_INTEGER;
				maxValue = Number.MAX_SAFE_INTEGER;
				// minValue = -BigInt('9223372036854775808');
				// maxValue = BigInt('9223372036854775807');
				decimalPlaces = 0;
			} else if (col.typeParams.vectorValueType === 'F32') {
				minValue = -2147483648;
				maxValue = 2147483647;
				decimalPlaces = 6;
			} else if (col.typeParams.vectorValueType === 'F64') {
				minValue = -524288;
				maxValue = 524287;
				decimalPlaces = 10;
			}

			const generator = new generatorsMap.GenerateVector[0]({ minValue, maxValue, decimalPlaces });
			return generator;
		}

		if (col.hasDefault && col.default !== undefined) {
			const generator = new generatorsMap.GenerateDefault[0]({
				defaultValue: col.default,
			});
			return generator;
		}

		return;
	};

	const generator = pickGenerator(table, col);

	return generator;
};
