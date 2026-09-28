import { ComponentX } from '../core/ComponentX'
import { Node } from '../core/Node'
import {
  Collider,
  CollisionType,
  Contact,
} from './CollideComponent'

const PAIR_KEY_SCALE = 2 ** 26

/** Marks the colliders collected by one sortSweep call; unique across systems. */
let nextSweepStamp = 1

class TrackedContact extends Contact {
  /** Last frame in which the pair's AABBs overlapped. */
  frame = 0
  key = 0
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
  /** Per-frame [left, right, top, bottom] of each collider in sweep order. */
  private bounds = new Float64Array(0)

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

    // Indexed loops: array iterators are costly in QuickJS and this visits
    // every node each frame.
    const components = node.components
    for (let i = 0; i < components.length; i++) {
      const component = components[i]
      if (component instanceof Collider && component._enabled) {
        this.colliders.push(component)
      }
    }

    const children = node.children
    for (let i = 0; i < children.length; i++) {
      this.walk(children[i])
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

    // Snapshot the AABBs (fixed since refresh) into typed arrays in sweep
    // order: the inner loop runs ~n * overlap times per frame and plain
    // array reads are far cheaper than method calls in QuickJS.
    const count = sweep.length
    if (this.bounds.length < count * 4) this.bounds = new Float64Array(count * 8)
    const bounds = this.bounds
    for (let i = 0; i < count; i++) {
      const aabb = sweep[i].getAABB()
      bounds[i * 4] = aabb.x
      bounds[i * 4 + 1] = aabb.x + aabb.width
      bounds[i * 4 + 2] = aabb.y
      bounds[i * 4 + 3] = aabb.y + aabb.height
    }

    for (let i = 0; i < count; i++) {
      const a = sweep[i]
      const right = bounds[i * 4 + 1]
      const top = bounds[i * 4 + 2]
      const bottom = bounds[i * 4 + 3]
      for (let j = i + 1; j < count; j++) {
        if (bounds[j * 4] > right) break
        if (bounds[j * 4 + 2] > bottom || top > bounds[j * 4 + 3]) continue
        const b = sweep[j]

        const key = this.getPairKey(a, b)
        let contact = this.contacts.get(key)
        if (!contact) {
          contact = new TrackedContact(a, b)
          contact.key = key
          this.contacts.set(key, contact)
        }
        contact.frame = frame
        this.dispatch(contact.updateState(), contact.collider1, contact.collider2)
      }
    }

    // values() avoids allocating a [key, value] entry per contact.
    for (const contact of this.contacts.values()) {
      if (contact.frame === frame) continue
      if (contact.isTouching) {
        this.dispatch(CollisionType.EXIT, contact.collider1, contact.collider2)
      }
      this.contacts.delete(contact.key)
    }
  }

  /** Insertion-sort by AABB left edge: near O(n) since order changes little per frame. */
  private sortSweep(): Collider[] {
    // Stamps on the colliders instead of Sets: no per-frame allocation.
    const colliders = this.colliders
    const current = nextSweepStamp++
    const kept = nextSweepStamp++
    for (let i = 0; i < colliders.length; i++) colliders[i]._sweepStamp = current
    const previous = this.sweep
    const sweep: Collider[] = []
    for (let i = 0; i < previous.length; i++) {
      const collider = previous[i]
      if (collider._sweepStamp === current) {
        collider._sweepStamp = kept
        sweep.push(collider)
      }
    }
    if (sweep.length !== colliders.length) {
      for (let i = 0; i < colliders.length; i++) {
        const collider = colliders[i]
        if (collider._sweepStamp !== kept) {
          collider._sweepStamp = kept
          sweep.push(collider)
        }
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
    // Cached on the collider to skip the WeakMap on the common single-system path.
    if (collider._pairIdOwner === this) return collider._pairId
    let id = this.ids.get(collider)
    if (!id) {
      id = this.nextId++
      this.ids.set(collider, id)
    }
    collider._pairIdOwner = this
    collider._pairId = id
    return id
  }

  private getRoot(): Node {
    let root = this.node!
    while (root.parent) root = root.parent
    return root
  }
}
