export type Resolver<T extends { name: string; schema?: string; table?: string }> = (it: {
	created: T[];
	deleted: T[];
}) => Promise<{ created: T[]; deleted: T[]; renamedOrMoved: { from: T; to: T }[] }>;

const dictionary = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const hash = (input: string, len: number = 12) => {
	const dictLen = BigInt(dictionary.length);
	const combinationsCount = BigInt(dictionary.length) ** BigInt(len);
	const p = 53n;
	let power = 1n;

	let hash = 0n;
	for (const ch of input) {
		hash = (hash + (BigInt(ch.codePointAt(0) || 0) * power)) % combinationsCount;
		power = (power * p) % combinationsCount;
	}

	const result = [] as string[];

	let index = hash;
	for (let i = len - 1; i >= 0; i--) {
		const element = dictionary[Number(index % dictLen)]!;
		result.unshift(element);
		index = index / dictLen;
	}

	return result.join('');
};
