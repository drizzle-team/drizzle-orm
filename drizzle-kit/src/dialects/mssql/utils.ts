const dictionary = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const hash = (input: string, len: number = 12) => {
	const combinationsCount = Math.pow(dictionary.length, len);
	const p = 53;

	let hash = 0;
	for (let i = 0; i < input.length; i++) {
		hash = (hash * p + input.codePointAt(i)!) % combinationsCount;
	}

	const result = [] as string[];

	let index = hash % combinationsCount;
	for (let i = len - 1; i >= 0; i--) {
		const element = dictionary[index % dictionary.length]!;
		result.unshift(element);
		index = Math.floor(index / dictionary.length);
	}
	return result.join('');
};
