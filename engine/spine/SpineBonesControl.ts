import { Physics } from '@esotericsoftware/spine-core'
import { SpineSkeleton } from '.'
import { BaseComponentProps, ComponentX } from '../core/ComponentX'

interface SpineBonesControlProps extends BaseComponentProps<SpineBonesControl> {
  posList: number[]
  bonesName: string[]
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

    const { bonesName = [], posList = [] } = this.props
    let updated = false
    bonesName.forEach((boneName: string, index: number) => {
      const bone = skeleton.findBone(boneName)
      const x = posList[index * 2]
      const y = posList[index * 2 + 1]
      if (bone && x !== undefined && y !== undefined) {
        bone.x = x
        bone.y = y
        updated = true
      }
    })
    if (updated) skeleton.updateWorldTransform(Physics.update)
  }
}
