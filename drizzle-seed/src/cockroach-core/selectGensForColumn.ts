import { generatorsMap } from '../generators/GeneratorFuncs.ts';
import type { AbstractGenerator, GenerateInterval } from '../generators/Generators.ts';
import type { Column, Table } from '../types/tables.ts';

// TODO: revise serial part generators
export const selectGeneratorForCockroachColumn = (
	table: Table,
	col: Column,
) => {
	const pickGenerator = (table: Table, col: Column) => {
		// INT ------------------------------------------------------------------------------------------------------------
		if (
			(
				col.columnType === 'int2'
				|| col.columnType === 'int4'
				|| col.columnType.includes('int8')
			)
			&& table.primaryKeys.includes(col.name)
		) {
			const generator = new generatorsMap.GenerateIntPrimaryKey[0]();

			return generator;
		}

		let minValue: number | bigint | undefined;
		let maxValue: number | bigint | undefined;
		if (col.columnType.startsWith('int')) {
			if (col.columnType === 'int2') {
				// 2^16 / 2 - 1, 2 bytes
				minValue = -32768;
				maxValue = 32767;
			} else if (col.columnType === 'int4') {
				// 2^32 / 2 - 1, 4 bytes
				minValue = -2147483648;
				maxValue = 2147483647;
			} else if (col.columnType.includes('int8')) {
				if (col.dataType === 'bigint') {
					// 2^64 / 2 - 1, 8 bytes
					minValue = BigInt('-9223372036854775808');
					maxValue = BigInt('9223372036854775807');
				} else {
					// if (col.dataType === 'number')
					// if you’re expecting values above 2^31 but below 2^53
					minValue = -9007199254740991;
					maxValue = 9007199254740991;
				}
			}
		}

		if (
			col.columnType.startsWith('int')
			&& !col.columnType.includes('interval')
		) {
			const generator = new generatorsMap.GenerateInt[0]({
				minValue,
				maxValue,
			});

			return generator;
		}

		// NUMBER(real, double, decimal, numeric)
		if (
			col.columnType.startsWith('real')
			|| col.columnType.startsWith('float')
			|| col.columnType.startsWith('decimal')
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
			(col.columnType === 'string'
				|| col.columnType.startsWith('varchar')
				|| col.columnType.startsWith('char'))
			&& table.primaryKeys.includes(col.name)
		) {
			const generator = new generatorsMap.GenerateUniqueString[0]();

			return generator;
		}

		if (
			(col.columnType === 'string'
				|| col.columnType.startsWith('varchar')
				|| col.columnType.startsWith('char'))
			&& col.name.toLowerCase().includes('name')
		) {
			const generator = new generatorsMap.GenerateFirstName[0]();

			return generator;
		}

		if (
			(col.columnType === 'string'
				|| col.columnType.startsWith('varchar')
				|| col.columnType.startsWith('char'))
			&& col.name.toLowerCase().includes('email')
		) {
			const generator = new generatorsMap.GenerateEmail[0]();

			return generator;
		}

		if (
			col.columnType === 'string'
			|| col.columnType.startsWith('varchar')
			|| col.columnType.startsWith('char')
		) {
			const generator = new generatorsMap.GenerateString[0]();

			return generator;
		}

		// BIT
		if (col.columnType.startsWith('bit')) {
			const generator = new generatorsMap.GenerateBitString[0]();

			return generator;
		}

		// INET
		if (col.columnType === 'inet') {
			const generator = new generatorsMap.GenerateInet[0]();

			return generator;
		}

		// geometry(point)
		if (col.columnType.startsWith('geometry')) {
			const generator = new generatorsMap.GenerateGeometry[0]();

			return generator;
		}

		// vector
		if (col.columnType.startsWith('vector')) {
			const generator = new generatorsMap.GenerateVector[0]();

			return generator;
		}

		// UUID
		if (col.columnType === 'uuid') {
			const generator = new generatorsMap.GenerateUUID[0]();

			return generator;
		}

		// BOOL
		if (col.columnType === 'bool') {
			const generator = new generatorsMap.GenerateBoolean[0]();

			return generator;
		}

		// DATE, TIME, TIMESTAMP
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

		// JSON, JSONB
		if (col.columnType === 'json' || col.columnType === 'jsonb') {
			const generator = new generatorsMap.GenerateJson[0]();

			return generator;
		}

		// if (col.columnType === "jsonb") {
		//   const generator = new GenerateJsonb({});
		//   return generator;
		// }

		// ENUM
		if (col.enumValues !== undefined) {
			const generator = new generatorsMap.GenerateEnum[0]({
				enumValues: col.enumValues,
			});

			return generator;
		}

		// INTERVAL
		if (col.columnType.startsWith('interval')) {
			if (col.columnType === 'interval') {
				const generator = new generatorsMap.GenerateInterval[0]();

				return generator;
			}

			const fields = col.columnType.replace('interval ', '') as GenerateInterval['params']['fields'];
			const generator = new generatorsMap.GenerateInterval[0]({ fields });

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

	const dimensions = col.typeParams.dimensions ?? 0;
	const generator = pickGenerator(table, col) as AbstractGenerator;

	// Assign dataType to inner generator before wrapping
	if (generator !== undefined) {
		generator.dataType = col.dataType;
	}

	const result = dimensions
		? new generatorsMap.GenerateArray[0]({ baseColumnGen: generator, size: col.size })
		: generator;

	// set params for base column
	if (result !== undefined) {
		result.isUnique = col.isUnique;
		result.dataType = col.dataType;
		// generator.stringLength = col.typeParams.length;
		result.typeParams = col.typeParams;
	}

	return result;
};
