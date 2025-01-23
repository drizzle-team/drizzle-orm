declare global {
	interface String {
		trimChar(char: string): string;
		squashSpaces(): string;
		capitalise(): string;
		camelCase(): string;
		snake_case(): string;

		concatIf(it: string, condition: boolean): string;
	}

	interface Array<T> {
		random(): T;
	}
}

import camelcase from 'camelcase';

String.prototype.trimChar = function(char: string) {
	let start = 0;
	let end = this.length;

	while (start < end && this[start] === char) ++start;
	while (end > start && this[end - 1] === char) --end;

	// this.toString() due to ava deep equal issue with String { "value" }
	return start > 0 || end < this.length
		? this.substring(start, end)
		: this.toString();
};

String.prototype.squashSpaces = function() {
	return this.replace(/  +/g, ' ').trim();
};

String.prototype.camelCase = function() {
	return camelcase(String(this));
};

String.prototype.capitalise = function() {
	return this && this.length > 0
		? `${this[0].toUpperCase()}${this.slice(1)}`
		: String(this);
};

String.prototype.concatIf = function(it: string, condition: boolean) {
	return condition ? `${this}${it}` : String(this);
};

String.prototype.snake_case = function() {
	return this && this.length > 0 ? `${this.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}` : String(this);
};

Array.prototype.random = function() {
	return this[~~(Math.random() * this.length)];
};

export {};
