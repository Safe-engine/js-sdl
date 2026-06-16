import type { Plugin } from "vite";
import MagicString from "magic-string";
import ts from "typescript";

type Attr = ts.JsxAttribute | ts.JsxSpreadAttribute;
type SceneElement = ts.JsxElement | ts.JsxSelfClosingElement;

const COMPONENT_TAGS = new Set([
  "Bullet",
  "Button",
  "Label",
  "NineSlice",
  "Panel",
  "Player",
  "ProgressBar",
  "ScrollView",
  "Sprite",
  "Toggle",
  "UIContainer",
  "UIElement",
  "UIImage",
]);

export function sdlTsxTransform(): Plugin {
  return {
    name: "vite-plugin-sdl-tsx-transform",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith(".tsx")) return null;

      const source = ts.createSourceFile(
        id,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const ms = new MagicString(code);
      const transformedJsx = new Set<ts.Node>();
      const classViews: ClassView[] = [];

      const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node) && isJsxRuntimeImport(node)) {
          ms.remove(node.getFullStart(), node.getEnd());
          return;
        }

        if (ts.isCallExpression(node) && isMountCall(node)) {
          const [arg] = node.arguments;
          ms.remove(node.getStart(source), arg.getStart(source));
          ms.remove(arg.getEnd(), node.getEnd());
        }

        if (isSceneElement(node) && !hasJsxAncestor(node)) {
          ms.overwrite(node.getStart(source), node.getEnd(), printElement(node));
          transformedJsx.add(node);
          return;
        }

        if (ts.isClassDeclaration(node)) {
          const classView = getClassView(node);
          if (classView) classViews.push(classView);
        }

        ts.forEachChild(node, visit);
      };

      const hasJsxAncestor = (node: ts.Node): boolean => {
        let parent = node.parent;
        while (parent) {
          if (transformedJsx.has(parent)) return true;
          parent = parent.parent;
        }
        return false;
      };

      const printElement = (element: SceneElement): string => {
        const printer = new ScenePrinter(source);
        const root = printer.printElement(element);
        return `(() => {\n${printer.helpers}${printer.body}  return ${root};\n})()`;
      };

      visit(source);
      for (const classView of classViews) {
        injectClassView(ms, classView, source);
      }

      if (!ms.hasChanged()) return null;
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

function isJsxRuntimeImport(node: ts.ImportDeclaration): boolean {
  return node.moduleSpecifier.getText().replaceAll("\"", "'") === "'./jsx-runtime'";
}

function isMountCall(node: ts.CallExpression): boolean {
  return ts.isIdentifier(node.expression) && node.expression.text === "mount" &&
    node.arguments.length === 1;
}

class ScenePrinter {
  private index = 0;
  private usesChildExpressions = false;
  body = "";

  constructor(private readonly source: ts.SourceFile) {}

  get helpers(): string {
    if (!this.usesChildExpressions) return "";
    return "  const flattenSceneChildren = (value) => Array.isArray(value) ? value.flatMap(flattenSceneChildren) : value ? [value] : [];\n";
  }

  printElement(element: SceneElement): string {
    const tagName = getElementTagName(element);
    if (tagName === "Node") return this.printNodeFactory(element);
    if (isComponentTag(tagName)) return this.printNodeFactoryCall(element);
    throw new Error("An SDL TSX scene tree must have a Node or component at its root");
  }

  private printNodeFactory(element: SceneElement): string {
    const tagName = getElementTagName(element);
    if (tagName !== "Node") {
      throw new Error("An SDL TSX scene tree must have a Node at its root");
    }

    const nodeVar = this.varName(tagName, "Node");
    const attrs = getElementAttrs(element);
    const nameAttr = findAttr(attrs, "name");
    const nodeName = nameAttr ? attrValue(nameAttr, this.source) : "\"\"";

    this.line(`const ${nodeVar} = new Node(${nodeName});`);
    this.printNodeProps(nodeVar, attrs);

    if (ts.isJsxElement(element)) {
      for (const child of element.children) {
        if (isSceneElement(child)) {
          const childTag = getElementTagName(child);
          if (childTag === "Node") {
            const childVar = this.printNodeFactory(child);
            this.line(`${nodeVar}.addChild(${childVar});`);
          } else if (isComponentTag(childTag)) {
            this.printComponentFactory(nodeVar, child);
          } else {
            const childVar = this.printNodeFactoryCall(child);
            this.line(`${nodeVar}.addChild(${childVar});`);
          }
        } else if (ts.isJsxExpression(child) && child.expression) {
          this.usesChildExpressions = true;
          this.line(`for (const child of flattenSceneChildren(${child.expression.getText(this.source)})) ${nodeVar}.addChild(child);`);
        }
      }
    }

    return nodeVar;
  }

  private printNodeFactoryCall(element: SceneElement): string {
    const tagName = getElementTagName(element);
    const nodeVar = this.varName("node", "Node");
    this.line(`const ${nodeVar} = new Node("${tagName}");`);
    this.printComponentFactory(nodeVar, element);
    return nodeVar;
  }

  private printComponentFactory(parentVar: string, element: SceneElement): void {
    const tagName = getElementTagName(element);
    const compVar = this.varName(tagName, "Comp");
    const attrs = getElementAttrs(element);

    this.line(`const ${compVar} = ${parentVar}.addComponent(${tagName});`);
    this.printComponentProps(compVar, tagName, attrs);
  }

  private printNodeProps(nodeVar: string, attrs: ts.NodeArray<Attr>): void {
    for (const attr of attrs) {
      if (!ts.isJsxAttribute(attr)) {
        throw new Error("JSX spread attributes are not supported in SDL TSX scenes");
      }

      const name = attr.name.text;
      if (name === "name") continue;

      const value = attrValue(attr, this.source);
      if (name === "transform") {
        this.line(`Object.assign(${nodeVar}.transform, ${value});`);
      } else if (name === "ref") {
        this.line(refStatement(attr, nodeVar, this.source));
      } else {
        this.line(`${nodeVar}.${name} = ${value};`);
      }
    }
  }

  private printComponentProps(
    compVar: string,
    tagName: string,
    attrs: ts.NodeArray<Attr>,
  ): void {
    const assigned = new Set<string>();
    const get = (name: string) => findAttr(attrs, name);

    if (tagName === "Sprite") {
      const spriteFrame = get("spriteFrame");
      if (spriteFrame) {
        this.line(`${compVar}.setTexture(${attrValue(spriteFrame, this.source)});`);
        assigned.add("spriteFrame");
      }
    }

    if (tagName === "Label") {
      const text = get("string");
      const font = get("font");
      const size = get("size");

      if (text) {
        this.line(`${compVar}.setText(${attrValue(text, this.source)});`);
        assigned.add("string");
      }
      if (font) {
        const fontSize = size ? attrValue(size, this.source) : `${compVar}.fontSize`;
        this.line(`${compVar}.setFont(${attrValue(font, this.source)}, ${fontSize});`);
        assigned.add("font");
        assigned.add("size");
      } else if (size) {
        this.line(`${compVar}.fontSize = ${attrValue(size, this.source)};`);
        assigned.add("size");
      }
    }

    for (const attr of attrs) {
      if (!ts.isJsxAttribute(attr)) {
        throw new Error("JSX spread attributes are not supported in SDL TSX scenes");
      }

      const name = attr.name.text;
      if (assigned.has(name)) continue;

      const value = attrValue(attr, this.source);
      if (name === "ref") {
        this.line(refStatement(attr, compVar, this.source));
      } else {
        this.line(`${compVar}.${name} = ${value};`);
      }
    }
  }

  private varName(tagName: string, suffix: string): string {
    this.index += 1;
    return `${tagName[0].toLowerCase()}${tagName.slice(1)}${suffix}${this.index}`;
  }

  private line(code: string): void {
    this.body += `  ${code}\n`;
  }
}

interface ClassView {
  node: ts.ClassDeclaration;
  kind: "scene" | "component";
  hook: ts.MethodDeclaration | undefined;
}

function getClassView(node: ts.ClassDeclaration): ClassView | null {
  const view = node.members.find((member) =>
    ts.isMethodDeclaration(member) && member.name.getText() === "__view"
  );
  if (!view) return null;

  const kind = classExtends(node, "Scene")
    ? "scene"
    : classExtends(node, "Component")
      ? "component"
      : null;
  if (!kind) return null;

  const hookName = kind === "scene" ? "onLoad" : "onAwake";
  const hook = node.members.find((member): member is ts.MethodDeclaration =>
    ts.isMethodDeclaration(member) && member.name.getText() === hookName
  );

  return { node, kind, hook };
}

function injectClassView(
  ms: MagicString,
  classView: ClassView,
  source: ts.SourceFile,
): void {
  const hookName = classView.kind === "scene" ? "onLoad" : "onAwake";
  const target = classView.kind === "scene" ? "this.root" : "this.node!";
  const code = `const __view = this.__view();\n    ${target}.addChild(__view);\n    `;

  if (classView.hook?.body) {
    ms.appendLeft(classView.hook.body.getStart(source) + 1, `\n    ${code}`);
    return;
  }

  const classEnd = classView.node.getEnd() - 1;
  ms.appendLeft(classEnd, `\n\n  ${hookName}(): void {\n    ${code}\n  }\n`);
}

function classExtends(node: ts.ClassDeclaration, baseName: string): boolean {
  return !!node.heritageClauses?.some((clause) =>
    clause.types.some((type) => getExpressionName(type.expression) === baseName)
  );
}

function getExpressionName(expression: ts.ExpressionWithTypeArguments["expression"]): string {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return expression.getText();
}

function findAttr(
  attrs: ts.NodeArray<Attr>,
  name: string,
): ts.JsxAttribute | undefined {
  return attrs.find((attr): attr is ts.JsxAttribute =>
    ts.isJsxAttribute(attr) && attr.name.text === name
  );
}

function attrValue(attr: ts.JsxAttribute, source: ts.SourceFile): string {
  const initializer = attr.initializer;
  if (!initializer) return "true";
  if (ts.isStringLiteral(initializer)) return initializer.getText(source);
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    return initializer.expression.getText(source);
  }
  throw new Error(`Unsupported JSX attribute value for ${attr.name.text}`);
}

function refStatement(
  attr: ts.JsxAttribute,
  value: string,
  source: ts.SourceFile,
): string {
  const initializer = attr.initializer;
  if (initializer && ts.isJsxExpression(initializer) && initializer.expression) {
    const expression = initializer.expression;
    if (
      ts.isPropertyAccessExpression(expression) ||
      ts.isElementAccessExpression(expression)
    ) {
      return `${expression.getText(source)} = ${value};`;
    }
  }

  return `(${attrValue(attr, source)})(${value});`;
}

function isComponentTag(tagName: string): boolean {
  return COMPONENT_TAGS.has(tagName) || /^[A-Z]/.test(tagName);
}

function getTagName(name: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(name)) return name.text;
  return name.getText();
}

function isSceneElement(node: ts.Node): node is SceneElement {
  return ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);
}

function getElementTagName(element: SceneElement): string {
  if (ts.isJsxElement(element)) return getTagName(element.openingElement.tagName);
  return getTagName(element.tagName);
}

function getElementAttrs(element: SceneElement): ts.NodeArray<Attr> {
  if (ts.isJsxElement(element)) return element.openingElement.attributes.properties;
  return element.attributes.properties;
}
