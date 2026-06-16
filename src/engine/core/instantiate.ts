import { Component, Constructor } from "./Component"
import { Scene } from "./Scene"

export type GetProps<T> = T extends Component<infer P> ? P : never

export function instantiate<T extends Component>(ComponentType: Constructor<T>, data?: GetProps<T>): T {
  const instance = new ComponentType(data)
  instance.init(data)
  if (!instance.__view) {
    return instance
  }
  return instance.__view()
}
export async function loadScene<T extends Scene>(ComponentType: Constructor<T>) {
  const instance = new ComponentType()
  if (instance.preLoad) {
    await instance.preLoad()
  }
  instance.__view()
}
