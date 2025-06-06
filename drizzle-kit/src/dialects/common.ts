export type Resolver<T extends { name: string; schema?: string; table?: string }> = (it: {
	created: T[];
	deleted: T[];
}) => Promise<{ created: T[]; deleted: T[]; renamedOrMoved: { from: T; to: T }[] }>;

const dictionary = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const hash = (input: string, len: number = 12) => {
	const combinationsCount = Math.pow(dictionary.length, len);
	const p = 53;

	let hash = 0;
	for (let i = 0; i < input.length; i++) {
		hash += ((input.codePointAt(i) || 0) * Math.pow(p, i)) % combinationsCount;
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
