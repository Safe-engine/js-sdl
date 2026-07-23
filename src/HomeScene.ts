import {
  Button,
  Label,
  Scene,
  SpineSkeleton,
} from '../engine'
import { instantiate, loadScene } from '../engine/core/instantiate'
import { DragonBones } from '../engine/dragonbones'
import {
  db_mecha_1004_d_show,
  lilita_one_regularFont,
  sf_btn_shop,
  sp_spineboy_pma
} from './assets'
import { GameScene } from './GameScene'

export class HomeScene extends Scene {
  db: DragonBones

  onLoad(): void {
    console.log('HomeScene loaded', this.db)
  }

  onClick = () => {
    console.log('clicked button')
    loadScene(GameScene)
  }

  onAnimationComplete(name?: string, count?: number) {
    console.log('onAnimationComplete', name, count)
  }

  __view() {
    const Button1 = instantiate(Button, {
      spriteFrame: sf_btn_shop,
      capInsets: [20, 20, 20, 20],
      onPress: this.onClick,
    })
    this.node.addChild(Button1.node)
    Button1.node.x = 360
    Button1.node.y = 640
    Button1.node.width = 420
    Button1.node.height = 268
    const Label1 = instantiate(Label, {
      string: 'PLAY',
      font: lilita_one_regularFont,
      size: 32,
      align: 'center',
      verticalAlign: 'middle',
    })
    const dragonBonesComp1 = instantiate(DragonBones, { data: db_mecha_1004_d_show, animation: 'idle', onAnimationComplete: this.onAnimationComplete.bind(this) })
    this.node.addChild(dragonBonesComp1.node)
    this.db = dragonBonesComp1
    dragonBonesComp1.node.x = 460
    dragonBonesComp1.node.y = 540
    dragonBonesComp1.node.scale = 0.3
    const spine1 = instantiate(SpineSkeleton, { data: sp_spineboy_pma, animation: 'idle', onAnimationComplete: this.onAnimationComplete.bind(this) })
    this.node.addChild(spine1.node)
    spine1.node.x = 260
    spine1.node.y = 840
    spine1.node.scale = 0.3
    Button1.node.resolveComponent(Label1)
  }
}
