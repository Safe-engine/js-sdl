import {
  Component,
  Label,
  Node,
  Sprite
} from "../src/engine";

type Constructor<T> = new (...args: any[]) => T;
type ElementType = typeof Node | Constructor<Component>;
type ElementProps = Record<string, unknown> | null;
type ElementChild = SceneElement | SceneElement[] | null | undefined | false;

export interface SceneElement {
  type: ElementType;
  props: ElementProps;
  children: ElementChild[];
}

export function jsx(
  type: ElementType,
  props: ElementProps,
  ...children: ElementChild[]
): SceneElement {
  return { type, props, children };
}

export function mount(element: SceneElement): Node {
  if (element.type !== Node) {
    throw new Error("A TSX scene tree must have a Node at its root");
  }

  return mountNode(element);
}

function mountNode(element: SceneElement): Node {
  const props = element.props ?? {};
  const node = new Node((props.name as string | undefined) ?? "");

  applyNodeProps(node, props);

  for (const child of flatten(element.children)) {
    if (child.type === Node) {
      node.addChild(mountNode(child));
      continue;
    }

    const component = node.addComponent(child.type as any);
    applyComponentProps(component, child.props ?? {});
  }

  return node;
}

function applyNodeProps(node: Node, props: Record<string, unknown>): void {
  const transform = props.transform as
    | Partial<{
        x: number;
        y: number;
        rotation: number;
        scaleX: number;
        scaleY: number;
        anchorX: number;
        anchorY: number;
      }>
    | undefined;

  if (transform) {
    Object.assign(node, transform);
  }

  callRef(props.ref, node);
}

function applyComponentProps(
  component: Component,
  props: Record<string, unknown>,
): void {
  if (component instanceof Sprite) {
    const spriteFrame = props.spriteFrame;
    if (typeof spriteFrame === "string") component.setTexture(spriteFrame);
  }

  if (component instanceof Label) {
    const text = props.string;
    const font = props.font;
    const size = props.size;
    if (typeof text === "string") component.setText(text);
    if (typeof font === "string") {
      component.setFont(font, typeof size === "number" ? size : component.fontSize);
    } else if (typeof size === "number") {
      component.fontSize = size;
    }
  }

  for (const [key, value] of Object.entries(props)) {
    if (
      key === "ref" ||
      key === "spriteFrame" ||
      key === "string" ||
      key === "font" ||
      key === "size"
    ) {
      continue;
    }

    if (key in component) {
      (component as unknown as Record<string, unknown>)[key] = value;
    }
  }

  callRef(props.ref, component);
}

function callRef(ref: unknown, value: Node | Component): void {
  if (typeof ref === "function") {
    (ref as (value: Node | Component) => void)(value);
  }
}

function flatten(children: ElementChild[]): SceneElement[] {
  const result: SceneElement[] = [];

  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flatten(child));
    } else if (child) {
      result.push(child);
    }
  }

  return result;
}

declare global {
  namespace JSX {
    type Element = SceneElement;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface IntrinsicAttributes {
      ref?: (value: Node | Component) => void;
    }
  }
}

