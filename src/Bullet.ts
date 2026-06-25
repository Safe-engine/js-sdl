import { ComponentX, instantiate, Sprite } from '../engine'
import { sf_bullet } from './assets'

export class Bullet extends ComponentX {
  speed = 720

  __view() {
    const spriteComp4 = instantiate(Sprite, { spriteFrame: sf_bullet })
    const bulletComp1 = spriteComp4.addComponent(this)
    spriteComp4.node.width = 28
    spriteComp4.node.height = 42
    spriteComp4.node.anchorX = 0.5
    spriteComp4.node.anchorY = 0.5
    return bulletComp1
  }
}
