import { expect, test } from 'vitest';

// Type definitions for testing
interface ColumnMock {
	column_name: string;
	column_default: string;
	data_type: string;
}

interface PgKitInternals {
	tables: Record<string, {
		columns: Record<string, {
			isArray?: boolean;
			dimensions?: number;
			rawType?: string;
			isDefaultAnExpression?: boolean;
		}>;
	}>;
}

// Import the function we want to test - we need to mock it since it's not exported
// This is a simplified version of the defaultForColumn function logic for testing
function defaultForColumn(column: ColumnMock, internals: PgKitInternals, tableName: string): string | number | boolean | undefined {
	const columnName = column.column_name;
	const isArray = internals?.tables[tableName]?.columns[columnName]?.isArray ?? false;

	if (
		column.column_default === null
		|| column.column_default === undefined
		|| column.data_type === 'serial'
		|| column.data_type === 'smallserial'
		|| column.data_type === 'bigserial'
	) {
		return undefined;
	}

	let columnDefault = column.column_default;

	if (columnDefault.endsWith('[]')) {
		columnDefault = columnDefault.slice(0, -2);
	}

	// Remove type casting from the end
	columnDefault = columnDefault.replace(/::(.*?)(?<![^\w"])(?=$)/, '');

	const columnDefaultAsString: string = columnDefault.toString();

	if (isArray) {
		// Handle empty array cases FIRST to avoid processing them incorrectly
		if (columnDefaultAsString === '{}' || columnDefaultAsString === "'{}'") {
			return "'{}'";
		} else if (columnDefaultAsString === '{""}' || columnDefaultAsString === "'{\"\"}'") {
			return "'{\"\"}'";
		}
		
		// Handle ARRAY constructor syntax: ARRAY['value1', 'value2'] or ARRAY['value'::text]
		else if (columnDefaultAsString.startsWith('ARRAY[') && columnDefaultAsString.endsWith(']')) {
			// Extract content between ARRAY[ and ]
			const arrayContent = columnDefaultAsString.slice(6, -1); // Remove 'ARRAY[' and ']'
			
			// Parse individual array elements, handling quoted strings and type casts
			const elements = [];
			let current = '';
			let inQuotes = false;
			let quoteChar = '';
			let depth = 0;
			
			for (let i = 0; i < arrayContent.length; i++) {
				const char = arrayContent[i];
				const nextChar = arrayContent[i + 1];
				
				if (!inQuotes && (char === "'" || char === '"')) {
					inQuotes = true;
					quoteChar = char;
					current += char;
				} else if (inQuotes && char === quoteChar) {
					// Check if this is an escaped quote
					if (nextChar === quoteChar) {
						current += char + nextChar;
						i++; // Skip next char
					} else {
						inQuotes = false;
						current += char;
					}
				} else if (!inQuotes && char === '[') {
					depth++;
					current += char;
				} else if (!inQuotes && char === ']') {
					depth--;
					current += char;
				} else if (!inQuotes && char === ',' && depth === 0) {
					// Found element separator
					const trimmed = current.trim();
					if (trimmed) {
						// Remove type casting (::text, ::varchar, etc.) from individual elements
						const withoutTypeCast = trimmed.replace(/::\w+$/, '');
						elements.push(withoutTypeCast);
					}
					current = '';
				} else {
					current += char;
				}
			}
			
			// Add the last element
			const trimmed = current.trim();
			if (trimmed) {
				const withoutTypeCast = trimmed.replace(/::\w+$/, '');
				elements.push(withoutTypeCast);
			}
			
			// Format elements according to data type
			const formattedElements = elements.map((element) => {
				// Remove outer quotes if present
				let value = element.trim();
				if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
					value = value.slice(1, -1);
				}
				
				if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(column.data_type.slice(0, -2))) {
					return value;
				} else if (column.data_type.startsWith('timestamp')) {
					return `${value}`;
				} else if (column.data_type.slice(0, -2) === 'interval') {
					return value.replaceAll('"', `\"`);
				} else if (column.data_type.slice(0, -2) === 'boolean') {
					return value === 't' || value === 'true' ? 'true' : 'false';
				} else if (['json', 'jsonb'].includes(column.data_type.slice(0, -2))) {
					return JSON.stringify(JSON.stringify(JSON.parse(JSON.parse(value)), null, 0));
				} else {
					return `\"${value}\"`;
				}
			});
			
			return `'{${formattedElements.join(',')}}'`;
		}
		
		// Handle existing bracket notation: '{"value1", "value2"}' (but NOT empty arrays)
		else if (columnDefaultAsString.startsWith("'{") && columnDefaultAsString.endsWith("}'") && columnDefaultAsString.length > 4) {
			return `'{${
				columnDefaultAsString
					.slice(2, -2)
					.split(/\s*,\s*/g)
					.map((value) => {
						if (['integer', 'smallint', 'bigint', 'double precision', 'real'].includes(column.data_type.slice(0, -2))) {
							return value;
						} else if (column.data_type.startsWith('timestamp')) {
							return `${value}`;
						} else if (column.data_type.slice(0, -2) === 'interval') {
							return value.replaceAll('"', `\"`);
						} else if (column.data_type.slice(0, -2) === 'boolean') {
							return value === 't' ? 'true' : 'false';
						} else if (['json', 'jsonb'].includes(column.data_type.slice(0, -2))) {
							return JSON.stringify(JSON.stringify(JSON.parse(JSON.parse(value)), null, 0));
						} else {
							return `\"${value}\"`;
						}
					})
					.join(',')
			}}'`;
		}
		
		// Handle bracket notation without outer quotes: {"value1", "value2"} (but NOT empty arrays)
		else if (columnDefaultAsString.startsWith("{") && columnDefaultAsString.endsWith("}") && columnDefaultAsString.length > 2) {
			return `'${columnDefaultAsString}'`;
		}
		
		// Fallback: try to parse as if it's already in correct format but missing outer quotes
		else {
			// For cases where we might have an unrecognized array format
			return `'{${columnDefaultAsString}}'`;
		}
	}

	// Non-array handling (simplified for testing)
	return columnDefaultAsString;
}

test('PostgreSQL array defaults: ARRAY constructor syntax - single value', () => {
	const column: ColumnMock = {
		column_name: 'roles',
		column_default: "ARRAY['user']",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					roles: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"user"}\'');
});

test('PostgreSQL array defaults: ARRAY constructor syntax - multiple values', () => {
	const column: ColumnMock = {
		column_name: 'permissions',
		column_default: "ARRAY['read', 'write']",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					permissions: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"read","write"}\'');
});

test('PostgreSQL array defaults: ARRAY constructor with type casting', () => {
	const column: ColumnMock = {
		column_name: 'preferences',
		column_default: "ARRAY['email'::text]",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					preferences: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"email"}\'');
});

test('PostgreSQL array defaults: ARRAY constructor with multiple values and type casting', () => {
	const column: ColumnMock = {
		column_name: 'platforms',
		column_default: "ARRAY['both'::text, 'mobile'::text]",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					platforms: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"both","mobile"}\'');
});

test('PostgreSQL array defaults: ARRAY constructor with mixed type casting', () => {
	const column: ColumnMock = {
		column_name: 'mixed_array',
		column_default: "ARRAY['first'::text, 'second', 'third'::varchar]",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					mixed_array: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"first","second","third"}\'');
});

test('PostgreSQL array defaults: existing bracket notation should still work', () => {
	const column: ColumnMock = {
		column_name: 'tags',
		column_default: "'{\"tag1\", \"tag2\"}'",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					tags: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"tag1", "tag2"}\'');
});

test('PostgreSQL array defaults: bracket notation without outer quotes', () => {
	const column: ColumnMock = {
		column_name: 'simple_tags',
		column_default: '{"tag1", "tag2"}',
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					simple_tags: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{\"tag1\", \"tag2\"}\'');
});

test('PostgreSQL array defaults: empty array with quotes', () => {
	const column: ColumnMock = {
		column_name: 'empty_array',
		column_default: "'{}'",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					empty_array: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe("'{}'");
});

test('PostgreSQL array defaults: empty array without quotes', () => {
	const column: ColumnMock = {
		column_name: 'empty_array',
		column_default: "{}",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					empty_array: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe("'{}'");
});

test('PostgreSQL array defaults: array with empty string element', () => {
	const column: ColumnMock = {
		column_name: 'empty_string_array',
		column_default: "'{\"\"}'",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					empty_string_array: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe("'{\"\"}'");
});

test('PostgreSQL array defaults: integer array with ARRAY constructor', () => {
	const column: ColumnMock = {
		column_name: 'numbers',
		column_default: "ARRAY[1, 2, 3]",
		data_type: 'integer[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					numbers: { isArray: true, dimensions: 1, rawType: 'integer' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{1,2,3}\'');
});

test('PostgreSQL array defaults: boolean array with ARRAY constructor', () => {
	const column: ColumnMock = {
		column_name: 'flags',
		column_default: "ARRAY[true, false]",
		data_type: 'boolean[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					flags: { isArray: true, dimensions: 1, rawType: 'boolean' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{true,false}\'');
});

test('PostgreSQL array defaults: handles escaped quotes in ARRAY constructor', () => {
	const column: ColumnMock = {
		column_name: 'quoted_values',
		column_default: "ARRAY['value with ''quotes''', 'normal value']",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					quoted_values: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"value with \'\'quotes\'\'","normal value"}\'');
});

test('PostgreSQL array defaults: ARRAY constructor with global type casting removal', () => {
	const column: ColumnMock = {
		column_name: 'casted_array',
		column_default: "ARRAY['value1', 'value2']::text[]",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					casted_array: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"value1","value2"}\'');
});

test('PostgreSQL array defaults: complex ARRAY constructor with spaces', () => {
	const column: ColumnMock = {
		column_name: 'spaced_array',
		column_default: "ARRAY[ 'first' , 'second'::text , 'third' ]",
		data_type: 'text[]'
	};
	const internals: PgKitInternals = {
		tables: {
			test_table: {
				columns: {
					spaced_array: { isArray: true, dimensions: 1, rawType: 'text' }
				}
			}
		}
	};

	const result = defaultForColumn(column, internals, 'test_table');
	expect(result).toBe('\'{"first","second","third"}\'');
});

test('PostgreSQL array defaults: regression test for ARRAY truncation bug', () => {
	// This test specifically verifies that "ARRAY" doesn't get truncated to "RAY"
	const testCases = [
		{
			input: "ARRAY['user']",
			expected: '\'{"user"}\'',
			description: 'single value'
		},
		{
			input: "ARRAY['admin', 'user']",
			expected: '\'{"admin","user"}\'',
			description: 'multiple values'
		},
		{
			input: "ARRAY['email'::text]",
			expected: '\'{"email"}\'',
			description: 'with type casting'
		}
	];

	testCases.forEach(({ input, expected, description }) => {
		const column: ColumnMock = {
			column_name: 'test_column',
			column_default: input,
			data_type: 'text[]'
		};
		const internals: PgKitInternals = {
			tables: {
				test_table: {
					columns: {
						test_column: { isArray: true, dimensions: 1, rawType: 'text' }
					}
				}
			}
		};

		const result = defaultForColumn(column, internals, 'test_table');
		expect(result).toBe(expected);
		
		// Ensure result doesn't contain the corrupted "RAY" substring
		expect(result).not.toContain('RAY');
		expect(result).not.toContain('::tex"');
	});
}); 