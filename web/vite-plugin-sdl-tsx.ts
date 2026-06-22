import MagicString from 'magic-string';
import ts from 'typescript';

type TransformState = {
  sourceFile: ts.SourceFile;
  ms: MagicString;
  currentClassName?: string;
  isScene: boolean;
  listMethods: string[];
};

function parse(content: string, fileName: string) {
  const scriptKind = fileName.endsWith('.tsx')
    ? ts.ScriptKind.TSX
    : fileName.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : fileName.endsWith('.js')
        ? ts.ScriptKind.JS
        : ts.ScriptKind.TS;

  return ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, scriptKind);
}

function camelCase(str) {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
      return index === 0 ? word.toLowerCase() : word.toUpperCase();
    })
    .replace(/\s+/g, '');
}

const nameCount = {};

function getComponentName(name = '') {
  if (!nameCount[name])
    nameCount[name] = 0;
  return `${camelCase(name)}Comp${++nameCount[name]}`;
}

function parseValue(
  value: ts.JsxAttributeValue | ts.Expression | ts.PropertyName | undefined,
  sourceFile: ts.SourceFile,
): string | boolean {
  if (!value)
    return true;
  if (ts.isJsxExpression(value))
    return parseExpression(value.expression, sourceFile);
  if (value.kind === ts.SyntaxKind.ThisKeyword)
    return 'this';
  return value.getText(sourceFile);
}

function parseExpression(expression: ts.Expression | undefined, sourceFile: ts.SourceFile): string {
  if (!expression)
    return '';
  if (expression.kind === ts.SyntaxKind.ThisKeyword)
    return 'this';
  return expression.getText(sourceFile);
}

function parseNodeAttribute(
  value: ts.JsxAttributeValue,
  componentVar: string,
  prop: string,
  sourceFile: ts.SourceFile,
) {
  if (ts.isJsxExpression(value) && value.expression && ts.isObjectLiteralExpression(value.expression)) {
    return value.expression.properties
      .map((p) => {
        if (!ts.isPropertyAssignment(p))
          return '';
        return `\n    ${componentVar}.${prop}.${p.name.getText(sourceFile)} = ${parseExpression(p.initializer, sourceFile)}`;
      })
      .join('');
  }
  return `\n    ${componentVar}.${prop} = ${parseValue(value, sourceFile)}`;
}

function attributesToParams(
  attributes: ts.NodeArray<ts.JsxAttributeLike>,
  listMethods: string[] = [],
  sourceFile: ts.SourceFile,
) {
  let props = '';
  attributes.forEach((attribute) => {
    if (!ts.isJsxAttribute(attribute))
      return;
    const attName = attribute.name.getText(sourceFile);
    if (attName === 'node' || attName.includes('$'))
      return;
    const val = parseValue(attribute.initializer, sourceFile);
    if (typeof val === 'string' && val.includes('this.') && !val.includes('bind(') && !val.includes('+')) {
      const list = val.split('.');
      if (list.length === 2 && listMethods.includes(list[1])) {
        props += `${attName}: ${val}.bind(this),`;
      }
      else if (list.length > 2 && list[1] !== 'props' && list[2] !== 'node') {
        props += `${attName}: ${val}.bind(this.${list[1]}),`;
      }
      else {
        props += `${attName}: ${val},`;
      }
    }
    else {
      props += `${attName}: ${val},`;
    }
  });
  return `{${props}}`;
}

function getMethodName(name: ts.PropertyName, sourceFile: ts.SourceFile) {
  return ts.isPrivateIdentifier(name) ? name.text : name.getText(sourceFile);
}

function collectJsxBlocks(state: TransformState) {
  const jsxBlocks: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
  let jsxDepth = 0;

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      state.currentClassName = node.name?.text;
      const superClass = (node.heritageClauses as any)
        ?.flatMap((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword ? clause.types : [])
        ?.[0]?.expression;
      state.isScene = superClass?.getText(state.sourceFile) === 'Scene';
    }
    else if (ts.isMethodDeclaration(node)) {
      state.listMethods.push(getMethodName(node.name, state.sourceFile));
    }
    else if (ts.isJsxElement(node)) {
      if (jsxDepth === 0)
        jsxBlocks.push(node);
      jsxDepth++;
      state.ms.remove(node.closingElement.getStart(state.sourceFile), node.closingElement.end);
    }
    else if (ts.isJsxSelfClosingElement(node) && jsxDepth === 0) {
      jsxBlocks.push(node);
    }

    ts.forEachChild(node, visit);

    if (ts.isJsxElement(node))
      jsxDepth--;
  }

  visit(state.sourceFile);
  return jsxBlocks;
}

function parseJSX(
  state: TransformState,
  rangeNode: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  tagName: ts.JsxTagNameExpression,
  children: readonly ts.JsxChild[],
  attributes: ts.NodeArray<ts.JsxAttributeLike>,
  classVar: string,
  parentVar?: string,
) {
  let ret = '';
  const sourceFile = state.sourceFile;
  const start = rangeNode.getStart(sourceFile);
  const end = rangeNode.end;
  const componentName = tagName.getText(sourceFile);

  if (componentName === 'ExtraDataComp') {
    const keyAttribute = attributes.find((attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'key'
    );
    const valueAttribute = attributes.find((attribute) =>
      ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === 'value'
    );
    if (!parentVar || !keyAttribute || !valueAttribute || !ts.isJsxAttribute(keyAttribute) || !ts.isJsxAttribute(valueAttribute))
      return;
    const key = keyAttribute.initializer && ts.isStringLiteral(keyAttribute.initializer)
      ? keyAttribute.initializer.text
      : parseValue(keyAttribute.initializer, sourceFile);
    ret += `\n     ${parentVar}.node.setData('${key}', ${parseValue(valueAttribute.initializer, sourceFile)})`;
    state.ms.overwrite(start, end, ret);
    return;
  }

  const compVar = getComponentName(componentName);
  const params = attributesToParams(attributes, state.listMethods, sourceFile);
  const createComponentString = `\n    const ${compVar} = instantiate(${componentName}, ${params})`;
  if (!parentVar) {
    state.ms.appendLeft(start, createComponentString);
    if (state.isScene) {
      ret += `\nthis.root.addChild(${compVar}.node)`;
    }
    else {
      state.ms.appendLeft(start, `\n   const ${classVar} = ${compVar}.addComponent(this)`);
    }
    if (!state.isScene && state.listMethods.includes('onLoad')) {
      ret += `\n${classVar}.onLoad();`;
    }
  }
  else {
    ret += createComponentString;
  }
  if (parentVar) {
    ret += `\n     ${parentVar}.node.resolveComponent(${compVar})`;
  }
  attributes.forEach((attribute) => {
    if (!ts.isJsxAttribute(attribute))
      return;
    const attName = attribute.name.getText(sourceFile);
    const refString = parseValue(attribute.initializer, sourceFile);
    const rightValue = `${compVar}`;
    if (attName === '$ref') {
      ret += `\n${refString} = ${rightValue};`;
    }
    else if (attName === '$refNode') {
      ret += `\n${refString} = ${rightValue}.node;`;
    }
    else if (attName === '$push') {
      ret += `\n${refString}.push(${rightValue});`;
    }
    else if (attName === '$pushNode') {
      ret += `\n${refString}.push(${rightValue}.node);`;
    }
    else if (attName === 'node' && attribute.initializer) {
      ret += parseNodeAttribute(attribute.initializer, compVar, attName, sourceFile);
    }
  });
  state.ms.overwrite(start, end, ret);
  children.forEach(parseChildren(state, classVar, compVar));
}

function parseChildren(state: TransformState, classVar: string, compVar: string) {
  return (element: ts.Node) => {
    if (ts.isJsxElement(element)) {
      parseJSX(
        state,
        element.openingElement,
        element.openingElement.tagName,
        element.children,
        element.openingElement.attributes.properties,
        classVar,
        compVar,
      );
      return;
    }
    if (ts.isJsxSelfClosingElement(element)) {
      parseJSX(state, element, element.tagName, [], element.attributes.properties, classVar, compVar);
      return;
    }
    if (ts.isJsxExpression(element) && element.expression) {
      parseJSXExpressionContainer(state, classVar, element.expression, compVar);
    }
    else if (ts.isCallExpression(element)) {
      parseJSXExpressionContainer(state, classVar, element, compVar);
    }
  };
}

function getParameterName(parameter: ts.ParameterDeclaration | undefined, sourceFile: ts.SourceFile, fallback: string) {
  if (!parameter)
    return fallback;
  return parameter.name.getText(sourceFile);
}

function getParameterInitializer(parameter: ts.ParameterDeclaration | undefined, sourceFile: ts.SourceFile) {
  return parameter?.initializer ? parameter.initializer.getText(sourceFile) : '0';
}

function parseJSXExpressionContainer(
  state: TransformState,
  classVar: string,
  expression: ts.Expression,
  compVar: string,
) {
  if (!ts.isCallExpression(expression))
    return;

  const callee = expression.expression;
  const callback = expression.arguments[0];
  if (!ts.isPropertyAccessExpression(callee) || !callback || !ts.isArrowFunction(callback))
    return;

  const object = callee.expression;
  const sourceFile = state.sourceFile;
  const start = callee.getStart(sourceFile);
  const end = callback.body.getStart(sourceFile);

  if (ts.isCallExpression(object) && object.expression.getText(sourceFile) === 'Array') {
    const indexParam = callback.parameters[1] || callback.parameters[0];
    const indexVar = getParameterName(indexParam, sourceFile, 'i');
    const startIndex = getParameterInitializer(indexParam, sourceFile);
    const loopCount = Number(object.arguments[0]?.getText(sourceFile) || 0) + Number(startIndex);
    state.ms.overwrite(start, end, `\n for(let ${indexVar} = ${startIndex}; ${indexVar} < ${loopCount}; ${indexVar}++) {`);
    parseChildren(state, classVar, compVar)(callback.body);
    state.ms.replaceAll('))}', '}}');
  }
  else {
    const indexParam = callback.parameters[1];
    const indexVar = getParameterName(indexParam, sourceFile, 'i');
    const loopVar = parseValue(object, sourceFile);
    const itemVar = getParameterName(callback.parameters[0], sourceFile, 'item');
    const startIndex = getParameterInitializer(indexParam, sourceFile);
    if (startIndex !== '0') {
      state.ms.overwrite(start, end, `\n for(let ${indexVar} = ${startIndex}; ${indexVar} < ${loopVar}.length + ${startIndex}; ${indexVar}++) {` +
        `\n const ${itemVar} = ${loopVar}[${indexVar} - ${startIndex}]`);
    }
    else {
      state.ms.overwrite(start, end, `\n for(let ${indexVar} = 0; ${indexVar} < ${loopVar}.length; ${indexVar}++) {` +
        `\n const ${itemVar} = ${loopVar}[${indexVar}]`);
    }
    parseChildren(state, classVar, compVar)(callback.body);
    state.ms.replaceAll('))}', '}}');
  }
}

export function sdlTsxTransform() {
  return {
    name: 'vite-plugin-sdl-tsx-transform',
    enforce: 'pre' as any,
    async transform(code, id) {
      if (id.includes('packages/') || id.includes('node_modules/'))
        return;
      if (!id.endsWith('.tsx') && !id.endsWith('.ts') && !id.endsWith('.jsx') && !id.endsWith('.js'))
        return;

      const sourceFile = parse(code, id);
      const state: TransformState = {
        sourceFile,
        ms: new MagicString(code),
        isScene: false,
        listMethods: [],
      };
      const sourceFramework = '@safe-engine/sdl';
      const jsxBlocks = collectJsxBlocks(state);
      if (!jsxBlocks.length)
        return;

      const classVar = getComponentName(state.currentClassName);
      jsxBlocks.forEach((jsxBlock) => {
        if (ts.isJsxElement(jsxBlock)) {
          parseJSX(
            state,
            jsxBlock.openingElement,
            jsxBlock.openingElement.tagName,
            jsxBlock.children,
            jsxBlock.openingElement.attributes.properties,
            classVar,
          );
        }
        else {
          parseJSX(state, jsxBlock, jsxBlock.tagName, [], jsxBlock.attributes.properties, classVar);
        }
      });

      const end = jsxBlocks[0].parent?.end ?? jsxBlocks[0].end;
      if (!/import\s*{[^}]*\binstantiate\b[^}]*}\s*from\s*["']/.test(code))
        state.ms.prepend(`import { instantiate } from '${sourceFramework}'\n`);
      if (!state.isScene)
        state.ms.appendRight(end, `\n    return ${classVar}`);

      return {
        code: state.ms.toString(),
        map: state.ms.generateMap({
          hires: true,
          file: id,
          source: id,
          includeContent: true,
        }),
      };
    },
  };
}
