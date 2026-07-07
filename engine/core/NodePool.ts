import { Node } from './Node'

export class NodePool {
  private readonly nodes: Node[] = []

  size(): number {
    return this.nodes.length
  }

  put(node: Node): void {
    if (this.nodes.includes(node)) return
    node.removeFromParent()
    this.nodes.push(node)
  }

  get(): Node | null {
    return this.nodes.pop() ?? null
  }

  clear(): void {
    for (const node of this.nodes) {
      node.destroy()
    }
    this.nodes.length = 0
  }
}
