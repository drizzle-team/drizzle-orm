export type Casing = 'snake_case' | 'camelCase';

export function toSnakeCase(input: string) {
	const words = input
		.replace(/['\u2019]/g, '')
		.match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];

	return words.map((word) => word.toLowerCase()).join('_');
}

export function toCamelCase(input: string) {
	const words = input
		.replace(/['\u2019]/g, '')
		.match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];

	return words.reduce((acc, word, i) => {
		const formattedWord = i === 0 ? word.toLowerCase() : `${word[0]!.toUpperCase()}${word.slice(1)}`;
		return acc + formattedWord;
	}, '');
}

export function getCasingFn(casing: Casing | undefined) {
	if (casing === 'snake_case') return toSnakeCase;
	if (casing === 'camelCase') return toCamelCase;
	return (name: string) => name;
}
