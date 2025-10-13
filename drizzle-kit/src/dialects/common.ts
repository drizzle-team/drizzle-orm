export type Resolver<T extends { name: string; schema?: string; table?: string }> = (it: {
	created: T[];
	deleted: T[];
}) => Promise<{ created: T[]; deleted: T[]; renamedOrMoved: { from: T; to: T }[] }>;

const dictionary = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const hash = (input: string, len: number = 12) => {
	const dictLen = BigInt(dictionary.length);
	const combinationsCount = BigInt(dictionary.length) ** BigInt(len);
	const p = 53n;

	let hash = 0n;
	for (let i = 0; i < input.length; i++) {
		hash += (BigInt(input.codePointAt(i) || 0) * (p ** BigInt(i))) % combinationsCount;
		// console.log('hashI:', hash);
	}

	const result = [] as string[];

	// console.log('combinationsCount:', combinationsCount, 'hash:', hash);
	let index = hash % combinationsCount;
	for (let i = len - 1; i >= 0; i--) {
		const element = dictionary[Number(index % dictLen)]!;
		result.unshift(element);
		index = index / dictLen;
		// console.log('index', index);
	}

	return result.join('');
};
