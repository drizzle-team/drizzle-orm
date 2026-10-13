// shut up eslint you cannot possibly comprehend what's happening here
// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
export function Expect<T extends true>() {}

export type Equal<X, Y extends X> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true
	: false;

export const randomString = () => {
	const chars: string[] = new Array(10);
	for (let i = 0; i < chars.length; ++i) chars[i] = 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]!;

	return chars.join('');
};
