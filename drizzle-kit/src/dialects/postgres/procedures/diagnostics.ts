import * as path from 'node:path';
import type { SourceScript, Spanned } from './source';

/**
 * Compile errors are collected, never thrown: the whole file is visited and
 * every rejection is reported at once, each with file:line:col, the source
 * line, a caret span, and (where we know a better spelling) a hint.
 */
export interface Diagnostic {
	code: string;
	message: string;
	hint?: string;
	/** Absolute path of the offending file. */
	file: string;
	/** 1-based. */
	line: number;
	/** 1-based. */
	column: number;
	/** Caret width in characters (>= 1, clipped to the source line). */
	width: number;
	/** The full source line the node starts on (no trailing newline). */
	sourceLine: string;
}

/** Stable error codes — error-fixture tests assert on these exactly. */
export const Codes = {
	/** The parser's own syntax errors, surfaced before the whitelist runs. */
	ParseError: 'TSPG000',
	UnsupportedSyntax: 'TSPG001',
	ConsoleNotSupported: 'TSPG002',
	BareNumber: 'TSPG003',
	ManyOutsideForOf: 'TSPG004',
	BadInterpolation: 'TSPG005',
	NonBooleanCondition: 'TSPG006',
	NullableComparison: 'TSPG007',
	UnguardedRowAccess: 'TSPG008',
	ReservedName: 'TSPG009',
	UnsupportedCall: 'TSPG010',
	Redeclaration: 'TSPG011',
	UnknownIdentifier: 'TSPG012',
	NameCollision: 'TSPG013',
	BadProcedureShape: 'TSPG014',
	BadPgError: 'TSPG015',
	BadLockRows: 'TSPG016',
	AssignToImmutable: 'TSPG017',
	BadSqlUse: 'TSPG018',
	LooseEquality: 'TSPG019',
	TypeMismatch: 'TSPG020',
	MissingInitializer: 'TSPG021',
	BadRowType: 'TSPG022',
	InvalidName: 'TSPG023',
	/** The compiler hit an internal limit (e.g. recursion depth) — never a crash. */
	InternalError: 'TSPG024',
} as const;

export class Diagnostics {
	readonly all: Diagnostic[] = [];

	/** A reporter bound to one source file — what the visitor talks to. */
	forFile(script: SourceScript): FileReporter {
		return new FileReporter(this, script);
	}

	push(diagnostic: Diagnostic): void {
		this.all.push(diagnostic);
	}

	/** A diagnostic anchored to a file rather than a node (internal limits). */
	fileError(file: string, code: string, message: string, hint?: string): void {
		this.all.push({ code, message, hint, file, line: 1, column: 1, width: 1, sourceLine: '' });
	}

	get hasErrors(): boolean {
		return this.all.length > 0;
	}
}

export class FileReporter {
	constructor(
		private readonly sink: Diagnostics,
		private readonly script: SourceScript,
	) {}

	error(node: Spanned, code: string, message: string, hint?: string): void {
		const { line, column } = this.script.lineCol(node.start);
		const sourceLine = this.script.lineText(line);
		const width = Math.max(1, Math.min(node.end - node.start, sourceLine.length - column + 1));
		this.sink.push({
			code,
			message,
			hint,
			file: this.script.filePath,
			line,
			column,
			width,
			sourceLine,
		});
	}

	/** An error about the file as a whole (no source span). */
	fileError(code: string, message: string, hint?: string): void {
		this.sink.fileError(this.script.filePath, code, message, hint);
	}

	/** Surfaces the parser's syntax errors (malformed source never reaches the visitor). */
	parseError(span: Spanned, message: string): void {
		this.error(span, Codes.ParseError, `invalid TypeScript: ${message}`);
	}

	get hasErrors(): boolean {
		return this.sink.hasErrors;
	}
}

export interface FormatOptions {
	/** When set, file paths are printed relative to this directory. */
	relativeTo?: string;
}

export function formatDiagnostic(d: Diagnostic, opts: FormatOptions = {}): string {
	const file = opts.relativeTo ? path.relative(opts.relativeTo, d.file) : d.file;
	const lines = [
		`${file}:${d.line}:${d.column} error ${d.code}: ${d.message}`,
		`  ${d.sourceLine}`,
		`  ${' '.repeat(d.column - 1)}${'^'.repeat(d.width)}`,
	];
	if (d.hint) lines.push(`  hint: ${d.hint}`);
	return lines.join('\n');
}

export function formatDiagnostics(diagnostics: readonly Diagnostic[], opts: FormatOptions = {}): string {
	return diagnostics.map((d) => formatDiagnostic(d, opts)).join('\n\n');
}
