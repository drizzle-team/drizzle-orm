import chalk from 'chalk';

type TokenType =
	| 'keyword'
	| 'string'
	| 'variable'
	| 'operator'
	| 'type'
	| 'number'
	| 'comment'
	| 'built_in'
	| 'literal'
	| 'whitespace'
	| 'punctuation'
	| 'identifier';

interface Token {
	type: TokenType;
	value: string;
}

const KEYWORDS = new Set([
	'WITH',
	'AS',
	'SELECT',
	'FROM',
	'JOIN',
	'ON',
	'WHERE',
	'BETWEEN',
	'AND',
	'GROUP',
	'BY',
	'ORDER',
	'LIMIT',
	'DESC',
	'ASC',
	'IS',
	'NOT',
	'NULL',
	'OVER',
	'PARTITION',
	'RANK',
	'HAVING',
	'INSERT',
	'INTO',
	'VALUES',
	'UPDATE',
	'CASCADE',
	'SET',
	'DELETE',
	'CREATE',
	'SCHEMA',
	'TABLE',
	'COLUMN',
	'ALTER',
	'DROP',
	'UNION',
	'ALL',
	'DISTINCT',
	'CASE',
	'WHEN',
	'THEN',
	'ELSE',
	'END',
	'LEFT',
	'RIGHT',
	'INNER',
	'OUTER',
	'DEFAULT',
	'UNIQUE',
	'TYPE',
	'ADD',
	'CONSTRAINT',
	'REFERENCES',
	'FOREIGN',
	'KEY',
]);

const BUILT_INS = new Set([
	'SUM',
	'COUNT',
	'ROUND',
	'AVG',
	'MIN',
	'MAX',
	'COALESCE',
	'NOW',
	'DATE',
	'CAST',
	'CONVERT',
	'SUBSTRING',
	'TRIM',
	'LOWER',
	'UPPER',
	'CURRENT_TIMESTAMP',
]);

const TYPES = new Set([
	'int',
	'integer',
	'varchar',
	'char',
	'text',
	'date',
	'timestamp',
	'numeric',
	'decimal',
	'float',
	'double',
	'boolean',
	'json',
	'jsonb',
]);

const LITERALS = new Set(['true', 'false']);

function getTokenType(value: string): TokenType {
	const upper = value.toUpperCase();
	if (KEYWORDS.has(upper)) return 'keyword';
	if (BUILT_INS.has(upper)) return 'built_in';
	if (TYPES.has(value.toLowerCase())) return 'type';
	if (LITERALS.has(value.toLowerCase())) return 'literal';
	return 'identifier';
}

export function tokenize(code: string): Token[] {
	const tokens: Token[] = [];
	let current = 0;

	while (current < code.length) {
		const char = code[current];
		if (!char) break; // Safety check

		// Whitespace
		if (/\s/.test(char)) {
			let value = '';
			while (current < code.length && /\s/.test(code[current] || '')) {
				value += code[current];
				current++;
			}
			tokens.push({ type: 'whitespace', value });
			continue;
		}

		// Strings (single quotes)
		if (char === "'") {
			let value = "'";
			current++;
			while (current < code.length) {
				const c = code[current];
				const next = code[current + 1];
				if (c === "'" && next === "'") {
					value += "''";
					current += 2;
				} else if (c === "'") {
					value += "'";
					current++;
					break;
				} else {
					value += c || '';
					current++;
				}
			}
			tokens.push({ type: 'string', value });
			continue;
		}

		// Numbers
		if (/[0-9]/.test(char)) {
			let value = '';
			while (current < code.length && /[0-9.]/.test(code[current] || '')) {
				value += code[current];
				current++;
			}
			tokens.push({ type: 'number', value });
			continue;
		}

		// Comments (-- style)
		if (char === '-' && code[current + 1] === '-') {
			let value = '';
			while (current < code.length && code[current] !== '\n') {
				value += code[current] || '';
				current++;
			}
			tokens.push({ type: 'comment', value });
			continue;
		}

		// Operators and Punctuation
		if (/[(),;.]/.test(char)) {
			tokens.push({ type: 'punctuation', value: char });
			current++;
			continue;
		}

		if (/[=<>!+\-*/|:]/.test(char)) {
			let value = '';
			while (current < code.length && /[=<>!+\-*/|:]/.test(code[current] || '')) {
				value += code[current];
				current++;
			}
			tokens.push({ type: 'operator', value });
			continue;
		}

		// Quoted Identifiers ("" or ``)
		if (char === '"' || char === '`') {
			const quote = char;
			let value = quote;
			current++;
			while (current < code.length) {
				const c = code[current];
				const next = code[current + 1];
				if (c === quote && next === quote) {
					value += quote + quote;
					current += 2;
				} else if (c === quote) {
					value += quote;
					current++;
					break;
				} else {
					value += c || '';
					current++;
				}
			}
			tokens.push({ type: 'identifier', value });
			continue;
		}

		// Bracket Identifiers ([])
		if (char === '[') {
			let value = '[';
			current++;
			while (current < code.length) {
				const c = code[current];
				const next = code[current + 1];
				if (c === ']' && next === ']') {
					value += ']]';
					current += 2;
				} else if (c === ']') {
					value += ']';
					current++;
					break;
				} else {
					value += c || '';
					current++;
				}
			}
			tokens.push({ type: 'identifier', value });
			continue;
		}

		// Identifiers and Keywords
		if (/[a-zA-Z_]/.test(char)) {
			let value = '';
			while (current < code.length && /[a-zA-Z0-9_]/.test(code[current] || '')) {
				value += code[current];
				current++;
			}
			tokens.push({ type: getTokenType(value), value });
			continue;
		}

		// Fallback for unknown characters
		tokens.push({ type: 'identifier', value: char });
		current++;
	}

	return tokens;
}

export function highlightSQL(code: string): string {
	const tokens = tokenize(code);
	return tokens.map((token) => {
		switch (token.type) {
			case 'keyword':
				return chalk.redBright.bold(token.value);
			case 'string':
				return chalk.green(token.value);
			case 'variable':
				return chalk.blue(token.value); // Not explicitly detected in simple lexer, usually identifiers
			case 'operator':
				return chalk.gray(token.value);
			case 'type':
				return chalk.magenta(token.value);
			case 'number':
				return chalk.yellow(token.value);
			case 'comment':
				return chalk.gray.italic(token.value);
			case 'built_in':
				return chalk.redBright(token.value);
			case 'literal':
				return chalk.yellow(token.value);
			case 'identifier':
				return chalk.italic(token.value); // Default color for identifiers
			case 'punctuation':
				return chalk.gray(token.value);
			default:
				return token.value;
		}
	}).join('');
}
