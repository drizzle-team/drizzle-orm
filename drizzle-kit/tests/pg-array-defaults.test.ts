import { expect, test } from 'vitest';
import { defaultForColumn } from '../src/serializer/pgSerializer';

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
	expect(result).toBe('\'{"tag1","tag2"}\''); // postgres-array normalizes spacing
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
	expect(result).toBe('\'{"tag1","tag2"}\''); // postgres-array normalizes spacing
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
	expect(result).toBe('\'{1,2,3}\''); // postgres-array with trimming normalizes to compact form
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

	for (const { input, expected } of testCases) {
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
	}
}); 