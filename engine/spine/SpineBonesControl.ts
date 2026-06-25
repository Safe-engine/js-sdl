import { SpineSkeleton } from '.'
import { BaseComponentProps, ComponentX } from '../core/ComponentX'

interface SpineBonesControlProps extends BaseComponentProps<SpineBonesControl> {
  posList: Vec2[]
  bonesName: string[]
}
export class SpineBonesControl extends ComponentX<SpineBonesControlProps> {
  start() {
    const skel = this.node.getComponent(SpineSkeleton)
    const { bonesName = [], posList = [] } = this.props
    bonesName.forEach((boneName: string, index: number) => {
      const bone = skel.skeleton.findBone(boneName)
      if (bone) {
        const pos = posList[index]
        bone.x = pos.x
        bone.y = pos.y
      }
    })
  }
}
