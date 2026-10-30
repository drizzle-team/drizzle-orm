export { type Equal, Expect } from '@drizzle-team/test-utils';

export const randomString = () => {
	const chars: string[] = new Array(10);
	for (let i = 0; i < chars.length; ++i) chars[i] = 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]!;

	return chars.join('');
};
