/**
 * Source-position layer for the oxc front end. oxc-parser's napi bindings
 * return spans as UTF-16 offsets into the JS string (verified empirically
 * with non-ASCII sources), so plain string slicing and per-line column
 * arithmetic behave exactly like the previous TS-based front end.
 */

/** Anything with an oxc span. */
export interface Spanned {
	start: number;
	end: number;
}

export class SourceScript {
	/** Offsets of each line start (0-based offsets, index = line - 1). */
	private readonly lineStarts: number[];
	private readonly lines: string[];

	constructor(
		readonly filePath: string,
		readonly text: string,
	) {
		this.lines = text.split(/\r?\n/);
		this.lineStarts = [0];
		for (let i = 0; i < text.length; i++) {
			if (text[i] === '\n') this.lineStarts.push(i + 1);
		}
	}

	/** 1-based line/column for a UTF-16 offset. */
	lineCol(offset: number): { line: number; column: number } {
		let lo = 0;
		let hi = this.lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (this.lineStarts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return { line: lo + 1, column: offset - this.lineStarts[lo] + 1 };
	}

	/** The full source line (1-based, no trailing newline). */
	lineText(line: number): string {
		return this.lines[line - 1] ?? '';
	}

	getText(node: Spanned): string {
		return this.text.slice(node.start, node.end);
	}
}
