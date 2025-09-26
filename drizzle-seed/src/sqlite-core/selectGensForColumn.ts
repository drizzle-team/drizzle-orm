import { generatorsMap } from '../generators/GeneratorFuncs.ts';
import type { Column, Table } from '../types/tables.ts';

export const selectGeneratorForSqlite = (
	table: Table,
	col: Column,
) => {
	const pickGenerator = (table: Table, col: Column) => {
		// int section ---------------------------------------------------------------------------------------
		if (
			(col.columnType === 'integer' || col.columnType === 'numeric')
			&& table.primaryKeys.includes(col.name)
		) {
			const generator = new generatorsMap.GenerateIntPrimaryKey[0]();
			return generator;
		}

		if (col.columnType === 'integer' && col.dataType === 'boolean') {
			const generator = new generatorsMap.GenerateBoolean[0]();
			return generator;
		}

		if ((col.columnType === 'integer' && col.dataType === 'object')) {
			const generator = new generatorsMap.GenerateTimestamp[0]();
			return generator;
		}

		if (
			col.columnType === 'integer'
			|| (col.dataType === 'bigint' && col.columnType === 'blob')
		) {
			const generator = new generatorsMap.GenerateInt[0]();
			return generator;
		}

		// number section ------------------------------------------------------------------------------------
		if (col.columnType.startsWith('real') || col.columnType.startsWith('numeric')) {
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

		// string section ------------------------------------------------------------------------------------
		if (
			(col.columnType.startsWith('text')
				|| col.columnType.startsWith('numeric')
				|| col.columnType.startsWith('blob'))
			&& table.primaryKeys.includes(col.name)
		) {
			const generator = new generatorsMap.GenerateUniqueString[0]();
			return generator;
		}

		if (
			(col.columnType.startsWith('text')
				|| col.columnType.startsWith('numeric')
				|| col.columnType.startsWith('blob'))
			&& col.name.toLowerCase().includes('name')
		) {
			const generator = new generatorsMap.GenerateFirstName[0]();
			return generator;
		}

		if (
			(col.columnType.startsWith('text')
				|| col.columnType.startsWith('numeric')
				|| col.columnType.startsWith('blob'))
			&& col.name.toLowerCase().includes('email')
		) {
			const generator = new generatorsMap.GenerateEmail[0]();
			return generator;
		}

		if (
			col.columnType.startsWith('text')
			|| col.columnType.startsWith('numeric')
			|| col.columnType.startsWith('blob')
			|| col.columnType.startsWith('blobbuffer')
		) {
			const generator = new generatorsMap.GenerateString[0]();
			return generator;
		}

		if (
			(col.columnType.startsWith('text') && col.dataType === 'json')
			|| (col.columnType.startsWith('blob') && col.dataType === 'json')
		) {
			const generator = new generatorsMap.GenerateJson[0]();
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
