import cjsOnlyExportsDefault from './cjsOnlyExportsDefault.ts';
import entrypointResolutions from './entrypointResolutions.ts';
import exportDefaultDisagreement from './exportDefaultDisagreement.ts';
import internalResolutionError from './internalResolutionError.ts';
import moduleKindDisagreement from './moduleKindDisagreement.ts';
import namedExports from './namedExports.ts';
import unexpectedModuleSyntax from './unexpectedModuleSyntax.ts';

export default [
	entrypointResolutions,
	moduleKindDisagreement,
	exportDefaultDisagreement,
	namedExports,
	cjsOnlyExportsDefault,
	unexpectedModuleSyntax,
	internalResolutionError,
];
