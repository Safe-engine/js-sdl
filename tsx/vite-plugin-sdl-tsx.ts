import { parse as ESParser } from '@typescript-eslint/typescript-estree';
import ESTraverse from 'estraverse';
import MagicString from 'magic-string';
function parse(content) {
  return ESParser(content, {
    comment: false,
    jsx: true,
    loc: false,
    range: true,
  });
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
function parseValue(value) {
  if (!value)
    return true;
  const { type, expression } = value;
  switch (type) {
    case 'JSXExpressionContainer': {
      return parseExpression(expression);
    }
    case 'BinaryExpression':
    case 'MemberExpression':
    case 'UnaryExpression':
    case 'ArrayExpression':
    case 'ConditionalExpression':
    case 'CallExpression': {
      return parseExpression(value);
    }
    case 'StringLiteral': {
      return value.extra.raw;
    }
    case 'Literal':
      return value.raw;
    case 'BooleanLiteral':
    case 'NumericLiteral': {
      return value.value;
    }
    case 'Identifier': {
      return value.name;
    }
    case 'ThisExpression': {
      return 'this';
    }
    default:
      console.log('parseValue not support', type, value);
  }
}
function parseExpression(expression) {
  const { type, extra, object, property, value, name, computed, raw } = expression;
  switch (type) {
    case 'Identifier':
      return name;
    case 'Literal':
      return raw;
    case 'BooleanLiteral':
      return value;
    case 'ThisExpression':
      return 'this';
    case 'StringLiteral':
    case 'NumericLiteral':
      return extra.raw;
    case 'MemberExpression': {
      const left = parseValue(object);
      const right = parseValue(property);
      if (computed)
        return `${left}[${right}]`;
      return `${left}.${right}`;
    }
    case 'CallExpression': {
      const { callee, arguments: args } = expression;
      return `${parseValue(callee)}(${args.map(parseValue).join(', ')})`;
    }
    case 'UnaryExpression': {
      const { operator, argument: args } = expression;
      return `${operator}${parseValue(args)}`;
    }
    case 'ConditionalExpression': {
      const { test, consequent, alternate } = expression;
      return `${parseValue(test)}?${parseValue(consequent)}:${parseValue(alternate)}`;
    }
    case 'ObjectExpression': {
      const { properties } = expression;
      const props = properties.map(({ key, value }) => `${parseValue(key)}: ${parseValue(value)}`);
      return `{ ${props.join(',')} }`;
    }
    case 'ArrayExpression': {
      const { elements } = expression;
      const props = elements.map(parseValue);
      return `[${props.join(',')}]`;
    }
    case 'BinaryExpression': {
      const { operator, right, left } = expression;
      // console.log('Expression', expression)
      if ('BinaryExpression' === right.type && (right.operator === '+' || right.operator === '-')) {
        return `${parseValue(left)} ${operator} (${parseValue(right)})`;
      }
      return `${parseValue(left)} ${operator} ${parseValue(right)}`;
    }
    case 'TemplateLiteral': {
      const { quasis, expressions } = expression;
      // console.log('parseExpression ', quasis, expressions)
      // eslint-disable-next-line quotes
      const ret = ["''"];
      quasis.forEach((q, i) => {
        if (q.value.raw)
          ret.push(`"${q.value.raw}"`);
        if (!q.tail) {
          const expValue = parseValue(expressions[i]);
          ret.push(expValue);
        }
      });
      return ret.join(' + ');
    }
    default:
      console.log('parseExpression not support', type);
  }
}
function parseNodeAttribute(value, componentVar, prop) {
  if (value.type === 'JSXExpressionContainer' && value.expression.type === 'ObjectExpression') {
    const { properties } = value.expression;
    return properties
      .map((p) => {
        return `\n    ${componentVar}.${prop}.${p.key.name} = ${parseExpression(p.value)}`;
      })
      .join('');
  }
  return `\n    ${componentVar}.${prop} = ${parseValue(value)}`;
}
function attributesToParams(attributes, listMethods = []) {
  let props = '';
  attributes.map(({ name, value }) => {
    const attName = name.name;
    if (attName === 'node' || attName.includes('$'))
      return;
    const val = parseValue(value);
    // console.log('val', attName, val)
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
export function sdlTsxTransform() {
  return {
    name: 'vite-plugin-sdl-tsx-transform',
    enforce: 'pre',
    async transform(code, id) {
      if (id.includes('packages/') || id.includes('node_modules/'))
        return;
      if (!id.endsWith('.tsx') && !id.endsWith('.ts') && !id.endsWith('.jsx') && !id.endsWith('.js'))
        return;
      // console.log('transform', id)
      const parsed = parse(code);
      const ms = new MagicString(code);
      // let sourceFramework = '';
      let jsxBlock;
      let currentClassName;
      let isScene = false;
      const listComponentX = [];
      const listMethods = [];
      ESTraverse.traverse(parsed, {
        enter(node, parent) {
          var _a;
          // if (node.type === 'ImportDeclaration') {
          //     if (sourceFramework)
          //         return;
          //     sourceFramework = (_a = node.source.value.match(/^@safe-engine\/(\w+)/)) === null || _a === void 0 ? void 0 : _a[1];
          // }
          // else
          if ('ClassDeclaration' === node.type) {
            const { superClass, id } = node;
            currentClassName = id.name;
            isScene = superClass && superClass.name === 'Scene';
            const isComponentX = superClass && superClass.name && ['Component', 'SceneComponent'].includes(superClass.name);
            if (isComponentX) {
              listComponentX.push(currentClassName);
            }
          }
          else if ('MethodDefinition' === node.type) {
            listMethods.push(node.key.name);
          }
          else if ('JSXElement' === node.type) {
            if (!jsxBlock) {
              jsxBlock = node;
              jsxBlock.parentRange = parent.range;
            }
            if (node.closingElement) {
              const [rs, re] = node.closingElement.range;
              ms.remove(rs, re);
            }
          }
        },
        fallback: 'iteration',
      });
      if (jsxBlock) {
        const { openingElement, children } = jsxBlock;
        const { attributes, name: rootTag, range } = openingElement;
        const classVar = getComponentName(currentClassName);
        function parseJSX(range, tagName, children, attributes = [], parentVar) {
          let ret = '';
          const [start, end] = range;
          const componentName = tagName.name;
          // console.log('parseJSX', componentName)
          if (componentName === 'ExtraDataComp') {
            // console.log(parentVar, attributes[1])
            const key = attributes.find(({ name }) => name.name === 'key').value.value;
            const value = attributes.find(({ name }) => name.name === 'value');
            ret += `\n     ${parentVar}.node.setData('${key}', ${parseValue(value.value)})`;
            ms.overwrite(start, end, ret);
            return;
          }
          const compVar = getComponentName(componentName);
          const params = attributesToParams(attributes, listMethods);
          const createComponentString = `\n    const ${compVar} = instantiate(${componentName}, ${params})`;
          if (!parentVar) {
            ms.appendLeft(start, createComponentString);
            ms.appendLeft(start, `\n   const ${classVar} = ${compVar}.addComponent(this)`);
            if (listMethods.includes('onLoad')) {
              ret += `\n${classVar}.onLoad();`;
            }
          }
          else {
            ret += createComponentString;
          }
          if (!isScene) {
            ret += `\nthis.root.addChild(${compVar}.node)`;
          } else if (parentVar) {
            ret += `\n     ${parentVar}.node.resolveComponent(${compVar})`;
          }
          attributes.forEach(({ name, value }) => {
            const attName = name.name;
            const refString = parseValue(value);
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
            else if (attName === 'node') {
              ret += parseNodeAttribute(value, compVar, attName);
            }
          });
          ms.overwrite(start, end, ret);
          children.forEach(parseChildren(compVar));
        }
        function parseChildren(compVar) {
          return (element) => {
            const { openingElement, children, type, expression } = element;
            if (type !== 'JSXElement') {
              if (type === 'JSXExpressionContainer') {
                parseJSXExpressionContainer(expression, compVar);
              }
              else if (type === 'CallExpression') {
                parseJSXExpressionContainer(element, compVar);
              }
              return;
            }
            const { attributes, name, range } = openingElement;
            parseJSX(range, name, children, attributes, compVar);
          };
        }
        function parseJSXExpressionContainer(expression, compVar) {
          const { type, callee, arguments: args } = expression;
          if (type === 'CallExpression') {
            const callback = args[0];
            // console.log('CallExpression', callee, callback)
            const { object } = callee;
            const start = callee.range[0];
            if (object.callee && object.callee.name === 'Array') {
              const { name, left, right } = callback.params[1] || callback.params[0] || {};
              const indexVar = name || (left === null || left === void 0 ? void 0 : left.name) || 'i';
              const startIndex = right ? right.value : 0;
              const loopCount = object.arguments[0].value + startIndex;
              const end = callback.body.range[0];
              ms.overwrite(start, end, `\n for(let ${indexVar} = ${startIndex}; ${indexVar} < ${loopCount}; ${indexVar}++) {`);
              // console.log('callee', loopCount, callback.body)
              parseChildren(compVar)(callback.body);
              ms.replaceAll('))}', '}}');
            }
            else {
              // console.log('loopVar', type, callback)
              const { name, left, right } = callback.params[1] || {};
              const indexVar = name || (left === null || left === void 0 ? void 0 : left.name) || 'i';
              const loopVar = parseValue(object);
              const itemVar = callback.params[0].name;
              const startIndex = right ? right.value : 0;
              const end = callback.body.range[0];
              if (startIndex) {
                ms.overwrite(start, end, `\n for(let ${indexVar} = ${startIndex}; ${indexVar} < ${loopVar}.length + ${startIndex}; ${indexVar}++) {` +
                  `\n const ${itemVar} = ${loopVar}[${indexVar} - ${startIndex}]`);
              }
              else {
                ms.overwrite(start, end, `\n for(let ${indexVar} = 0; ${indexVar} < ${loopVar}.length; ${indexVar}++) {` +
                  `\n const ${itemVar} = ${loopVar}[${indexVar}]`);
              }
              parseChildren(compVar)(callback.body);
              ms.replaceAll('))}', '}}');
            }
          }
        }
        parseJSX(range, rootTag, children, attributes);
        const end = jsxBlock.parentRange[1];
        // if (listMethods.includes('start')) {
        //     ms.appendRight(end, `\n${classVar}.start();`);
        // }
        // if (!/import {([\s\S]*?)instantiate([\s\S]*?)} from ["']@safe-engine/.test(code))
        //     ms.prepend(`import { instantiate } from '@safe-engine/${sourceFramework}'\n`);
        if (!isScene)
          ms.appendRight(end, `\n    return ${classVar}`);
        // console.log('Program', currentClassName, output)
      }
      // if (listComponentX.length && sourceFramework) {
      //     if (!/import {([\s\S]*?)registerSystem([\s\S]*?)} from ["']@safe-engine/.test(code))
      //         ms.prepend(`import { registerSystem } from '@safe-engine/${sourceFramework}'\n`);
      //     const registerCode = listComponentX
      //         .map((name) => {
      //         return `\nregisterSystem(${name})`;
      //     })
      //         .join('');
      //     ms.append(registerCode);
      // }
      else {
        return;
      }
      return {
        code: ms.toString(),
        map: ms.generateMap({
          hires: true,
          file: id,
          source: id,
          includeContent: true,
        }),
      };
    },
  };
}
