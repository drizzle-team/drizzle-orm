export const escape = (data: string, strategy: string) => `${strategy}${data}${strategy}`;

export const shouldEscape = (value: any): boolean => typeof value === 'string'
|| value instanceof Date || value === Object(value);
