import { ComponentX } from '../core/ComponentX'
import { Node } from '../core/Node'
import {
  Collider,
  CollisionType,
  Contact,
} from './CollideComponent'

export interface CollideSystemProps {
  debug?: boolean
}

export class CollideSystem extends ComponentX<CollideSystemProps> {
  debug = false
  readonly colliders: Collider[] = []
  private contacts = new Map<string, Contact>()
  private ids = new WeakMap<Collider, number>()
  private nextId = 1

  onAwake(): void {
    this.debug = this.props.debug ?? false
  }

  onUpdate(_dt: number): void {
    if (!this.node) return

    this.debug = this.props.debug ?? this.debug
    this.collectColliders(this.getRoot())
    for (const collider of this.colliders) {
      collider.refresh()
    }
    this.updateContacts()
  }

  private collectColliders(root: Node): void {
    this.colliders.length = 0
    this.walk(root)
  }

  private walk(node: Node): void {
    if (!node.active) return

    for (const component of node.components) {
      if (component instanceof Collider && component.enabled) {
        this.colliders.push(component)
      }
    }

    for (const child of node.children) {
      this.walk(child)
    }
  }

  private updateContacts(): void {
    const activeKeys = new Set<string>()

    for (let i = 0; i < this.colliders.length; i++) {
      for (let j = i + 1; j < this.colliders.length; j++) {
        const a = this.colliders[i]
        const b = this.colliders[j]
        const key = this.getPairKey(a, b)
        activeKeys.add(key)

        let contact = this.contacts.get(key)
        if (!contact) {
          contact = new Contact(a, b)
          this.contacts.set(key, contact)
        }

        this.dispatch(contact.updateState(), a, b)
      }
    }

    for (const [key, contact] of this.contacts) {
      if (!activeKeys.has(key)) {
        if (contact.isTouching) {
          this.dispatch(CollisionType.EXIT, contact.collider1, contact.collider2)
        }
        this.contacts.delete(key)
      }
    }
  }

  private dispatch(type: CollisionType, a: Collider, b: Collider): void {
    if (type === CollisionType.ENTER) {
      a.props.onCollisionEnter?.(b)
      b.props.onCollisionEnter?.(a)
      a.onCollisionEnter(b)
      b.onCollisionEnter(a)
    } else if (type === CollisionType.STAY) {
      a.props.onCollisionStay?.(b)
      b.props.onCollisionStay?.(a)
      a.onCollisionStay(b)
      b.onCollisionStay(a)
    } else if (type === CollisionType.EXIT) {
      a.props.onCollisionExit?.(b)
      b.props.onCollisionExit?.(a)
      a.onCollisionExit(b)
      b.onCollisionExit(a)
    }
  }

  private getPairKey(a: Collider, b: Collider): string {
    const aId = this.getId(a)
    const bId = this.getId(b)
    return aId < bId ? `${aId}:${bId}` : `${bId}:${aId}`
  }

  private getId(collider: Collider): number {
    let id = this.ids.get(collider)
    if (!id) {
      id = this.nextId++
      this.ids.set(collider, id)
    }
    return id
  }

  private getRoot(): Node {
    let root = this.node!
    while (root.parent) root = root.parent
    return root
  }
}
