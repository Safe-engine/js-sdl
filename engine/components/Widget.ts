import { ComponentX } from '../core/ComponentX';
import { ActiveViewport } from '../Viewport';

export interface WidgetProps {
  top?: Integer
  right?: Integer
  bottom?: Integer
  left?: Integer
}

export class Widget extends ComponentX<WidgetProps> {
  top: number | null = null;
  right: number | null = null;
  bottom: number | null = null;
  left: number | null = null;

  onAwake(): void {
    this.top = normalizeInset(this.props.top);
    this.right = normalizeInset(this.props.right);
    this.bottom = normalizeInset(this.props.bottom);
    this.left = normalizeInset(this.props.left);
  }

  onUpdate(_dt: number): void {
    this.applyViewportInsets();
  }

  setInsets(insets: WidgetProps): this {
    if (insets.top !== undefined) this.top = normalizeInset(insets.top);
    if (insets.right !== undefined) this.right = normalizeInset(insets.right);
    if (insets.bottom !== undefined) this.bottom = normalizeInset(insets.bottom);
    if (insets.left !== undefined) this.left = normalizeInset(insets.left);
    return this;
  }

  private applyViewportInsets(): void {
    if (!this.node) return;

    const safeArea = ActiveViewport.safeArea;
    const transform = this.node;
    const hasLeft = this.left !== null;
    const hasRight = this.right !== null;
    const hasTop = this.top !== null;
    const hasBottom = this.bottom !== null;

    if (hasLeft && hasRight) {
      this.node.width = Math.max(0, safeArea.width - this.left! - this.right!);
    }
    if (hasTop && hasBottom) {
      this.node.height = Math.max(0, safeArea.height - this.top! - this.bottom!);
    }

    if (hasLeft) {
      transform.x = safeArea.x + this.left! + this.node.width * transform.anchorX;
    } else if (hasRight) {
      transform.x = safeArea.x + safeArea.width - this.right!
        - this.node.width * (1 - transform.anchorX);
    }

    if (hasTop) {
      transform.y = safeArea.y + this.top! + this.node.height * transform.anchorY;
    } else if (hasBottom) {
      transform.y = safeArea.y + safeArea.height - this.bottom!
        - this.node.height * (1 - transform.anchorY);
    }
  }
}

function normalizeInset(value: number | undefined): number | null {
  return value === undefined ? null : value;
}
