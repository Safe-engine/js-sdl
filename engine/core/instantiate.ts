import { ComponentX, Constructor } from './ComponentX'
import { Container } from './Container'
import { Node } from './Node'
import { Scene } from './Scene'

export type GetProps<T> = T extends ComponentX<infer P> ? P : never
type SceneActivator = (scene: Scene) => void

let activateScene: SceneActivator | null = null
const pendingScenes: Scene[] = []

export function setSceneActivator(activator: SceneActivator): void {
  activateScene = activator
  while (pendingScenes.length) {
    activator(pendingScenes.shift()!)
  }
}

export function instantiate<T extends ComponentX>(ComponentType: Constructor<T>, data?: GetProps<T>): T {
  const instance = new ComponentType(data)
  if (!instance.__view) {
    if (shouldAutoCreateNode(instance)) {
      new Node(ComponentType.name).addComponent(instance)
    }
    return instance
  }
  return instance.__view() as T
}

export function loadScene<T extends Scene>(ComponentType: Constructor<T>): T | Promise<T> {
  const instance = new ComponentType()
  return activateLoadedScene(instance)
}

function activateLoadedScene<T extends Scene>(instance: T): T {
  if (activateScene) {
    activateScene(instance)
  } else {
    pendingScenes.push(instance)
  }
  return instance
}

function shouldAutoCreateNode(instance: ComponentX): boolean {
  const prototype = Object.getPrototypeOf(instance)

  return instance instanceof Container
    || prototype.onRender !== ComponentX.prototype.onRender
    || prototype.onRenderEnd !== ComponentX.prototype.onRenderEnd
}
