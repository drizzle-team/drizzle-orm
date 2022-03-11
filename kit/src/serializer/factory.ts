import ts from "typescript";
import fs from "fs";
const printer: ts.Printer = ts.createPrinter();

const prepareFabricFile = (folder: string, fileName?: string) => {
  const staticImports = [
    ts.createImportDeclaration(
      undefined,
      undefined,
      ts.createImportClause(
        undefined,
        ts.createNamespaceImport(ts.createIdentifier('drizzle'))
      ),
      ts.createStringLiteral('drizzle-orm')
    ),
    ts.createImportDeclaration(
      undefined,
      undefined,
      ts.createImportClause(
        ts.createIdentifier('Session'),
        undefined
      ),
      ts.createStringLiteral('drizzle-orm/db/session')
    ),
    ts.createImportDeclaration(
      undefined,
      undefined,
      ts.createImportClause(
        ts.createIdentifier('MigrationSerializer'),
        undefined
      ),
      ts.createStringLiteral('drizzle-orm/serializer/serializer')
    ),
    ts.createImportDeclaration(
      undefined,
      undefined,
      ts.createImportClause(ts.createIdentifier("Enum"), undefined),
      ts.createStringLiteral("drizzle-orm/types/type"),
    ),
    ts.createImportDeclaration(
      undefined,
      undefined,
      ts.createImportClause(
        undefined,
        ts.createNamespaceImport(ts.createIdentifier('pg'))
      ),
      ts.createStringLiteral('pg')
    ),
  ];

  const dynamicImports = [];
  const filenames = fileName ? [fileName!!] : fs.readdirSync(folder);
  for (let i = 0; i < filenames.length; i++) {
    const filename = filenames[i];

    const importPath = `${folder}/${filename.split(".")[0]}`;
    dynamicImports.push(ts.createImportDeclaration(
      undefined,
      undefined,
      ts.createImportClause(
        undefined,
        ts.createNamespaceImport(ts.createIdentifier(`i${i}`)),
      ),
      ts.createStringLiteral(importPath),
    ));
  }

  const variablesStatements = [
    ts.createVariableStatement(
      undefined,
      ts.createVariableDeclarationList(
        [
          ts.createVariableDeclaration(
            ts.createIdentifier("db"),
            undefined,
            ts.createNew(ts.createIdentifier("drizzle.DB"), undefined, [
              ts.createNew(ts.createIdentifier("Session"), undefined, [ts.createNew(ts.createPropertyAccess(
                ts.createIdentifier('pg'),
                ts.createIdentifier('Pool')
              ), undefined, [])]),
            ]),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
    ts.createVariableStatement(
      undefined,
      ts.createVariableDeclarationList(
        [
          ts.createVariableDeclaration(
            ts.createIdentifier("serializer"),
            undefined,
            ts.createNew(ts.createIdentifier("MigrationSerializer"), undefined, []),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  ];

  const blockStatements = [];

  // const tables: AbstractTable<any> = []
  blockStatements.push(ts.createVariableStatement(
    undefined,
    ts.createVariableDeclarationList(
      [
        ts.createVariableDeclaration(
          ts.createIdentifier('tables'),
          ts.createArrayTypeNode(
            ts.createTypeReferenceNode(
              ts.createQualifiedName(
                ts.createIdentifier('drizzle'),
                ts.createIdentifier('AbstractTable')
              ),
              [ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)]
            )
          ),
          ts.createArrayLiteral([], false)
        ),
      ],
      ts.NodeFlags.Const,
    ),
  ));

  // const enums: Enum<any>[] = []
  blockStatements.push(ts.createVariableStatement(
    undefined,
    ts.createVariableDeclarationList(
      [
        ts.createVariableDeclaration(
          ts.createIdentifier('enums'),
          ts.createArrayTypeNode(
            ts.createTypeReferenceNode(
              ts.createIdentifier('Enum'),
              [ts.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword)]
            )
          ),
          ts.createArrayLiteral([], false)
        )
      ],
      ts.NodeFlags.Const
    ),
  ));

  for (let i = 0; i < filenames.length; i++) {
    // const t1 = (new i1.default(db) as unknown as AbstractTable<any>);
    // tables.push(t1)

    // const i1values = Object.values(i1)
    const valuesDeclaration = ts.createVariableStatement(
      undefined,
      ts.createVariableDeclarationList(
        [
          ts.createVariableDeclaration(
            ts.createIdentifier(`i${i}values`),
            undefined,
            ts.createCall(
              ts.createPropertyAccess(
                ts.createIdentifier('Object'),
                ts.createIdentifier('values')
              ),
              undefined,
              [ts.createIdentifier('i' + i)]
            )
          )
        ],
        ts.NodeFlags.Const
      )
    )
    blockStatements.push(valuesDeclaration)

    //  i1values.forEach((t) => {
    //   if (t instanceof Enum) {
    //     enums.push(t);
    //     return
    //   }

    //   if (typeof t === 'function' && t.prototype && t.prototype.constructor) {
    //     const instance = new t(db)

    //     if (instance instanceof AbstractTable) {
    //       tables.push(instance as unknown as AbstractTable<any>)
    //     }
    //   }
    // });
    const iterationWithTypeChecks = ts.createExpressionStatement(
      ts.createCall(
        ts.createPropertyAccess(
          ts.createIdentifier(`i${i}values`),
          ts.createIdentifier('forEach')
        ),
        undefined,
        [
          ts.createArrowFunction(
            undefined,
            undefined,
            [
              ts.createParameter(
                undefined,
                undefined,
                undefined,
                ts.createIdentifier('t'),
                undefined,
                undefined,
                undefined
              )
            ],
            undefined,
            ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
            ts.createBlock(
              [
                ts.createIf(
                  ts.createBinary(
                    ts.createIdentifier('t'),
                    ts.SyntaxKind.InstanceOfKeyword,
                    ts.createIdentifier('Enum')
                  ),
                  ts.createBlock(
                    [
                      ts.createExpressionStatement(
                        ts.createCall(
                          ts.createPropertyAccess(
                            ts.createIdentifier('enums'),
                            ts.createIdentifier('push')
                          ),
                          undefined,
                          [ts.createIdentifier('t')]
                        )
                      ),
                      ts.createReturn(undefined)
                    ],
                    true
                  ),
                  undefined
                ),
                ts.createIf(
                  ts.createBinary(
                    ts.createBinary(
                      ts.createBinary(
                        ts.createTypeOf(ts.createIdentifier('t')),
                        ts.createToken(
                          ts.SyntaxKind.EqualsEqualsEqualsToken
                        ),
                        ts.createStringLiteral('function')
                      ),
                      ts.createToken(
                        ts.SyntaxKind.AmpersandAmpersandToken
                      ),
                      ts.createPropertyAccess(
                        ts.createIdentifier('t'),
                        ts.createIdentifier('prototype')
                      )
                    ),
                    ts.createToken(
                      ts.SyntaxKind.AmpersandAmpersandToken
                    ),
                    ts.createPropertyAccess(
                      ts.createPropertyAccess(
                        ts.createIdentifier('t'),
                        ts.createIdentifier('prototype')
                      ),
                      ts.createIdentifier('constructor')
                    )
                  ),
                  ts.createBlock(
                    [
                      ts.createVariableStatement(
                        undefined,
                        ts.createVariableDeclarationList(
                          [
                            ts.createVariableDeclaration(
                              ts.createIdentifier('instance'),
                              undefined,
                              ts.createNew(
                                ts.createIdentifier('t'),
                                undefined,
                                [ts.createIdentifier('db')]
                              )
                            )
                          ],
                          ts.NodeFlags.Const
                        )
                      ),
                      ts.createIf(
                        ts.createBinary(
                          ts.createIdentifier('instance'),
                          ts.SyntaxKind.InstanceOfKeyword,
                          ts.createIdentifier('drizzle.AbstractTable')
                        ),
                        ts.createBlock(
                          [
                            ts.createExpressionStatement(
                              ts.createCall(
                                ts.createPropertyAccess(
                                  ts.createIdentifier('tables'),
                                  ts.createIdentifier('push')
                                ),
                                undefined,
                                [
                                  ts.createAsExpression(
                                    ts.createAsExpression(
                                      ts.createIdentifier(
                                        'instance'
                                      ),
                                      ts.createKeywordTypeNode(
                                        ts.SyntaxKind.UnknownKeyword
                                      )
                                    ),
                                    ts.createTypeReferenceNode(
                                      ts.createQualifiedName(
                                        ts.createIdentifier('drizzle'),
                                        ts.createIdentifier('AbstractTable')
                                      ),
                                      [
                                        ts.createKeywordTypeNode(
                                          ts.SyntaxKind.AnyKeyword
                                        )
                                      ]
                                    )
                                  )
                                ]
                              )
                            )
                          ],
                          true
                        ),
                        undefined
                      )
                    ],
                    true
                  ),
                  undefined
                )
              ],
              true
            )
          )
        ]
      )
    )
    blockStatements.push(iterationWithTypeChecks)
  }

  // return serializer.generate(tables, enums)
  blockStatements.push(
    ts.createReturn(
      ts.createCall(
        ts.createPropertyAccess(
          ts.createIdentifier("serializer"),
          ts.createIdentifier("generate"),
        ),
        undefined,
        [
          ts.createIdentifier("tables"),
          ts.createIdentifier("enums"),
        ],
      ),
    ),
  );

  const funcStatement = [
    ts.createVariableStatement(
      undefined,
      ts.createVariableDeclarationList(
        [
          ts.createVariableDeclaration(
            ts.createIdentifier("testFun"),
            undefined,
            ts.createArrowFunction(
              undefined,
              undefined,
              [],
              undefined,
              ts.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              // function body
              ts.createBlock(
                blockStatements,
                true,
              ),
            ),
          ),
        ],
        ts.NodeFlags.Const,
      ),
    ),
  ];
  const invocationStatement = [
    ts.createExpressionStatement(
      ts.createCall(ts.createIdentifier("testFun"), undefined, []),
    ),
  ];

  const outFile: ts.SourceFile = ts.createSourceFile(
    "outfile.ts",
    "",
    ts.ScriptTarget.ES2015,
    true,
    ts.ScriptKind.TS,
  );

  const source = [];
  source.push(...staticImports);
  source.push(...dynamicImports);
  source.push(...variablesStatements);
  source.push(...funcStatement);
  source.push(...invocationStatement);

  const newFile = ts.factory.updateSourceFile(outFile, source);

  return printer.printFile(newFile);
};

export default prepareFabricFile;
