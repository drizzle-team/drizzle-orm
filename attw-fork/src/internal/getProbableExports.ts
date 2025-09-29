import ts from 'typescript';

const minifiedVariableAssignmentPattern = /\S;(?:var|let|const) \w=\S/;

export interface Export {
	name: string;
	node: ts.Node;
}

export function getProbableExports(sourceFile: ts.SourceFile): Export[] {
	return getEsbuildBabelSwcExports(sourceFile) ?? [];
}

function getEsbuildBabelSwcExports(sourceFile: ts.SourceFile): Export[] | undefined {
	let possibleIndex = sourceFile.text.indexOf('\n__export(');
	if (possibleIndex === -1) {
		possibleIndex = sourceFile.text.indexOf('\n_export(');
	}
	if (possibleIndex === -1 && !isProbablyMinified(sourceFile.text)) {
		return undefined;
	}

	for (const statement of sourceFile.statements) {
		if (possibleIndex !== -1 && statement.end < possibleIndex) {
			continue;
		}
		if (possibleIndex !== -1 && statement.pos > possibleIndex) {
			break;
		}
		if (
			ts.isExpressionStatement(statement)
			&& ts.isCallExpression(statement.expression)
			&& ts.isIdentifier(statement.expression.expression)
			&& statement.expression.arguments.length === 2
			&& ts.isIdentifier(statement.expression.arguments[0]!)
			&& ts.isObjectLiteralExpression(statement.expression.arguments[1]!)
		) {
			const callTarget = statement.expression.expression;
			const isExport = ts.unescapeLeadingUnderscores(callTarget.escapedText) === '__export'
				|| callTarget.escapedText === '_export'
				|| isEsbuildExportFunction(sourceFile.locals?.get(callTarget.escapedText)?.valueDeclaration);
			if (isExport) {
				return statement.expression.arguments[1].properties.flatMap((prop): Export[] => {
					if (
						ts.isPropertyAssignment(prop)
						&& (ts.isIdentifier(prop.name) || ts.isStringOrNumericLiteralLike(prop.name))
					) {
						return [{ name: prop.name.text, node: prop }];
					}
					if (ts.isShorthandPropertyAssignment(prop)) {
						return [{ name: prop.name.text, node: prop }];
					}
					return [];
				});
			}
		}
	}

	return undefined;
}

function isEsbuildExportFunction(decl: ts.Declaration | undefined) {
	/*
  esbuild:
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  esbuild min:
  b=(o,r)=>{for(var e in r)n(o,e,{get:r[e],enumerable:!0})}

  swc?
  function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
  }
  */
	if (!decl) {
		return false;
	}
	return (
		ts.isVariableDeclaration(decl)
		&& decl.initializer
		&& ts.isFunctionExpressionOrArrowFunction(decl.initializer)
		&& ts.isBlock(decl.initializer.body)
		&& decl.initializer.body.statements.length === 1
		&& ts.isForInStatement(decl.initializer.body.statements[0]!)
	);
}

function isProbablyMinified(text: string): boolean {
	return minifiedVariableAssignmentPattern.test(text);
}
