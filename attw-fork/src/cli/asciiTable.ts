import chalk from 'chalk';
import type { GenericTable, HorizontalTableRow } from 'cli-table3';

export function asciiTable(table: GenericTable<HorizontalTableRow>) {
	return table.options.head
		.slice(1)
		.map((entryPoint, i) => {
			const keyValuePairs = table.reduce((acc, cur) => {
				const key = cur[0]?.toString();
				const value = cur[i + 1]?.toString();
				return acc + `${key}: ${value}\n`;
			}, '');
			return `${chalk.bold.blue(entryPoint)}

${keyValuePairs}
***********************************`;
		})
		.join('\n\n');
}
