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
    const skel = this.findSpineSkeleton()
    const skeleton = skel?.skeleton
    if (!skeleton) return

    const { bonesName = [], posList = [] } = this.props
    let updated = false
    bonesName.forEach((boneName: string, index: number) => {
      const bone = skeleton.findBone(boneName)
      if (bone) {
        bone.x = posList[index * 2]
        bone.y = posList[index * 2 + 1]
        updated = true
      }
    })
    if (updated) skeleton.updateWorldTransform(Physics.update)
  }

  private findSpineSkeleton(): SpineSkeleton | null {
    let current = this.node
    while (current) {
      const skel = current.getComponent(SpineSkeleton)
      if (skel) return skel
      current = current.parent
    }
    return null
  }
}
