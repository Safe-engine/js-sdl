import { ComponentX } from '../core/ComponentX'
import { Node } from '../core/Node'
import {
  Collider,
  CollisionType,
  Contact,
} from './CollideComponent'

const PAIR_KEY_SCALE = 2 ** 26

class TrackedContact extends Contact {
  /** Last frame in which the pair's AABBs overlapped. */
  frame = 0
}

export interface CollideSystemProps {
  debug?: boolean
}

export class CollideSystem extends ComponentX<CollideSystemProps> {
  debug = false
  readonly colliders: Collider[] = []
  private contacts = new Map<number, TrackedContact>()
  private ids = new WeakMap<Collider, number>()
  private nextId = 1
  private frame = 0
  /** Colliders ordered by AABB left edge; kept across frames so re-sorting is cheap. */
  private sweep: Collider[] = []

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

  /**
   * Sweep-and-prune broadphase: only pairs whose AABBs overlap on x are tested,
   * and only overlapping pairs keep a Contact. Pairs not seen this frame are no
   * longer overlapping (or were removed), so touching ones receive EXIT.
   */
  private updateContacts(): void {
    const frame = ++this.frame
    const sweep = this.sortSweep()

    for (let i = 0; i < sweep.length; i++) {
      const a = sweep[i]
      const aabbA = a.getAABB()
      const right = aabbA.x + aabbA.width
      for (let j = i + 1; j < sweep.length; j++) {
        const b = sweep[j]
        const aabbB = b.getAABB()
        if (aabbB.x > right) break
        if (aabbB.y > aabbA.y + aabbA.height || aabbA.y > aabbB.y + aabbB.height) continue

        const key = this.getPairKey(a, b)
        let contact = this.contacts.get(key)
        if (!contact) {
          contact = new TrackedContact(a, b)
          this.contacts.set(key, contact)
        }
        contact.frame = frame
        this.dispatch(contact.updateState(), contact.collider1, contact.collider2)
      }
    }

    for (const [key, contact] of this.contacts) {
      if (contact.frame === frame) continue
      if (contact.isTouching) {
        this.dispatch(CollisionType.EXIT, contact.collider1, contact.collider2)
      }
      this.contacts.delete(key)
    }
  }

  /** Insertion-sort by AABB left edge: near O(n) since order changes little per frame. */
  private sortSweep(): Collider[] {
    const current = new Set(this.colliders)
    const sweep = this.sweep.filter(collider => current.has(collider))
    if (sweep.length !== this.colliders.length) {
      const kept = new Set(sweep)
      for (const collider of this.colliders) {
        if (!kept.has(collider)) sweep.push(collider)
      }
    }
    for (let i = 1; i < sweep.length; i++) {
      const item = sweep[i]
      const x = item.getAABB().x
      let j = i - 1
      while (j >= 0 && sweep[j].getAABB().x > x) {
        sweep[j + 1] = sweep[j]
        j--
      }
      sweep[j + 1] = item
    }
    this.sweep = sweep
    return sweep
  }

  private dispatch(type: typeof CollisionType[keyof typeof CollisionType], a: Collider, b: Collider): void {
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

  private getPairKey(a: Collider, b: Collider): number {
    const aId = this.getId(a)
    const bId = this.getId(b)
    // Exact while ids stay below 2^26 (~67M colliders per system).
    return aId < bId ? aId * PAIR_KEY_SCALE + bId : bId * PAIR_KEY_SCALE + aId
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
