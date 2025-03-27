// shut up eslint you cannot possibly comprehend what's happening here
// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
export function Expect<T extends true>() {}

export type Equal<X, Y extends X> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true
	: false;

export function toLocalDate(date: Date) {
	const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	localTime.setUTCHours(0);
	return localTime;
}

export const randomString = () =>
	Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
