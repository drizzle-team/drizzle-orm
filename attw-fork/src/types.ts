import type ts from 'typescript';

export type ResolutionKind = 'node10' | 'node16-cjs' | 'node16-esm' | 'bundler';
export type ResolutionOption = 'node10' | 'node16' | 'bundler';
export interface EntrypointInfo {
	subpath: string;
	resolutions: Record<ResolutionKind, EntrypointResolutionAnalysis>;
	hasTypes: boolean;
	isWildcard: boolean;
}

export interface IncludedTypes {
	kind: 'included';
}
export interface TypesPackage {
	kind: '@types';
	packageName: string;
	packageVersion: string;
	definitelyTypedUrl?: string;
}
export type AnalysisTypes = IncludedTypes | TypesPackage;

export type BuildTool =
	| '@arethetypeswrong/cli'
	| 'typescript'
	| 'rollup'
	| '@rollup/plugin-typescript'
	| '@rollup/plugin-typescript2'
	| 'webpack'
	| 'esbuild'
	| 'parcel-bundler'
	| '@preconstruct/cli'
	| 'vite'
	| 'snowpack'
	| 'microbundle'
	| '@microsoft/api-extractor'
	| 'tshy'
	| '@rspack/cli'
	| 'tsup'
	| 'tsdown';

export interface Analysis {
	packageName: string;
	packageVersion: string;
	buildTools: Partial<Record<BuildTool, string>>;
	types: AnalysisTypes;
	entrypoints: Record<string, EntrypointInfo>;
	programInfo: Record<ResolutionOption, ProgramInfo>;
	problems: Problem[];
}

export interface UntypedResult {
	packageName: string;
	packageVersion: string;
	types: false;
}

export type CheckResult = Analysis | UntypedResult;

export interface EntrypointResolutionAnalysis {
	name: string;
	resolutionKind: ResolutionKind;
	isWildcard?: boolean;
	resolution?: Resolution;
	implementationResolution?: Resolution;
	files?: string[];
	/** Indices into `analysis.problems` */
	visibleProblems?: number[];
}

export interface Resolution {
	fileName: string;
	isTypeScript: boolean;
	isJson: boolean;
	trace: string[];
}

export interface ProgramInfo {
	moduleKinds?: Record<string, ModuleKind>;
}

export type ModuleKindReason = 'extension' | 'type' | 'no:type';
export interface ModuleKind {
	detectedKind: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS;
	detectedReason: ModuleKindReason;
	reasonFileName: string;
}

export interface EntrypointResolutionProblem {
	entrypoint: string;
	resolutionKind: ResolutionKind;
}

export interface FilePairProblem {
	typesFileName: string;
	implementationFileName: string;
}

export interface ModuleKindPairProblem {
	typesModuleKind: ModuleKind;
	implementationModuleKind: ModuleKind;
}

export interface FileTextRangeProblem {
	fileName: string;
	pos: number;
	end: number;
}

export interface NoResolutionProblem extends EntrypointResolutionProblem {
	kind: 'NoResolution';
}

export interface UntypedResolutionProblem extends EntrypointResolutionProblem {
	kind: 'UntypedResolution';
}

export interface FalseESMProblem extends FilePairProblem, ModuleKindPairProblem {
	kind: 'FalseESM';
}

export interface FalseCJSProblem extends FilePairProblem, ModuleKindPairProblem {
	kind: 'FalseCJS';
}

export interface CJSResolvesToESMProblem extends EntrypointResolutionProblem {
	kind: 'CJSResolvesToESM';
}

export interface NamedExportsProblem extends FilePairProblem {
	kind: 'NamedExports';
	isMissingAllNamed: boolean;
	missing: string[];
}

export interface FallbackConditionProblem extends EntrypointResolutionProblem {
	kind: 'FallbackCondition';
}

export interface FalseExportDefaultProblem extends FilePairProblem {
	kind: 'FalseExportDefault';
}

export interface MissingExportEqualsProblem extends FilePairProblem {
	kind: 'MissingExportEquals';
}

export interface InternalResolutionErrorProblem extends FileTextRangeProblem {
	kind: 'InternalResolutionError';
	resolutionOption: ResolutionOption;
	moduleSpecifier: string;
	resolutionMode: ts.ResolutionMode;
	trace: string[];
}

export interface UnexpectedModuleSyntaxProblem extends FileTextRangeProblem {
	kind: 'UnexpectedModuleSyntax';
	syntax: ts.ModuleKind.ESNext | ts.ModuleKind.CommonJS;
	moduleKind: ModuleKind;
}

export interface CJSOnlyExportsDefaultProblem extends FileTextRangeProblem {
	kind: 'CJSOnlyExportsDefault';
}

export type Problem =
	| NoResolutionProblem
	| UntypedResolutionProblem
	| FalseESMProblem
	| FalseCJSProblem
	| CJSResolvesToESMProblem
	| NamedExportsProblem
	| FallbackConditionProblem
	| FalseExportDefaultProblem
	| MissingExportEqualsProblem
	| InternalResolutionErrorProblem
	| UnexpectedModuleSyntaxProblem
	| CJSOnlyExportsDefaultProblem;

export type ProblemKind = Problem['kind'];

export type Failable<T> = { status: 'error'; error: string; data?: never } | { status: 'success'; data: T };

export interface ParsedPackageSpec {
	name: string;
	versionKind: 'none' | 'exact' | 'range' | 'tag';
	version: string;
}
