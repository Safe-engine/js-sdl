import { Physics } from '@esotericsoftware/spine-core'
import { SpineSkeleton } from '.'
import { BaseComponentProps, ComponentX } from '../core/ComponentX'

type BoneControl = [
  name: string,
  x: number,
  y: number,
]
interface SpineBonesControlProps extends BaseComponentProps<SpineBonesControl> {
  bones: BoneControl[]
}
export class SpineBonesControl extends ComponentX<SpineBonesControlProps> {
  onAwake() {
    this.applyBonePositions()
  }

  onUpdate() {
    this.applyBonePositions()
  }

  private applyBonePositions() {
    const skel = this.getComponent(SpineSkeleton)
    const skeleton = skel?.skeleton
    if (!skeleton) return

    const { bones } = this.props
    let updated = false
    bones.forEach(([name, x, y]) => {
      const bone = skeleton.findBone(name)
      if (bone) {
        bone.x = x
        bone.y = y
        updated = true
      }
    })
    if (updated) skeleton.updateWorldTransform(Physics.update)
  }
}
