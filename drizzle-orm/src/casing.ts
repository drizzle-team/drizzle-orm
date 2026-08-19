export type Casing = 'snake_case' | 'camelCase';

// Matches (in order): a run of lowercase letters/digits (ASCII or Unicode, e.g. Latin, Cyrillic,
// Greek); a run of uppercase letters not followed by a lowercase letter (an acronym); an uppercase
// letter followed by lowercase letters/digits (a capitalized word); or a run of caseless letters
// (e.g. CJK ideographs, Hangul syllables) which have no upper/lower distinction to split on.
const WORD_PATTERN = /[\p{Ll}\d]+|\p{Lu}+(?!\p{Ll})|\p{Lu}[\p{Ll}\d]+|\p{Lo}+/gu;

export function toSnakeCase(input: string) {
	const words = input
		.replace(/['\u2019]/g, '')
		.match(WORD_PATTERN) ?? [];

	return words.map((word) => word.toLowerCase()).join('_');
}

export function toCamelCase(input: string) {
	const words = input
		.replace(/['\u2019]/g, '')
		.match(WORD_PATTERN) ?? [];

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
