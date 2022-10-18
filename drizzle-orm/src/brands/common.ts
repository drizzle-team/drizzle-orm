// export abstract class Brand<T extends string, TValue> {
// 	declare $brand: T;
// 	declare value: TValue;

// 	constructor(value?: TValue) {
// 		if (value !== undefined) {
// 			this.value = value;
// 		}
// 	}

// 	toString(): string {
// 		return `${this.value}`;
// 	}
// }

// export type Unwrap<T extends Brand<any, any>> = T['value'];
