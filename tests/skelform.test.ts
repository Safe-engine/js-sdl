import { expect, test } from 'bun:test'
import { strFromU8, unzipSync } from 'fflate'
import {
  SkfGenericAnimate,
  SkfGenericConstruct,
} from '../engine/skelform/skelform-js'
import type { SkelFormArmature } from '../engine/skelform/types'

test('animates and constructs the bundled SkelForm skeleton', async () => {
  const bytes = await Bun.file(
    `${import.meta.dir}/../res/_skellington.skf`,
  ).arrayBuffer()
  const files = unzipSync(new Uint8Array(bytes))
  const armature = JSON.parse(
    strFromU8(files['armature.json']),
  ) as SkelFormArmature

  expect(armature.bones).toHaveLength(61)
  expect(armature.animations.map(animation => animation.name)).toEqual([
    'Stand',
    'Run ',
    'Jump',
    'Land',
  ])

  for (const animation of armature.animations) {
    const lastFrame = animation.keyframes.at(-1)?.frame ?? 0
    SkfGenericAnimate(armature.bones, [animation], [lastFrame], [0])
    const bones = SkfGenericConstruct(armature)
    expect(bones).toHaveLength(armature.bones.length)
    expect(bones.every(hasFiniteTransform)).toBe(true)
  }

  const mesh = armature.visuals.find(visual => visual.vertices?.length)
  expect(mesh?.vertices?.every(vertex =>
    Number.isFinite(vertex.pos.x) && Number.isFinite(vertex.pos.y)
  )).toBe(true)
})

function hasFiniteTransform(bone: SkelFormArmature['bones'][number]): boolean {
  return Number.isFinite(bone.pos.x)
    && Number.isFinite(bone.pos.y)
    && Number.isFinite(bone.rot)
    && Number.isFinite(bone.scale.x)
    && Number.isFinite(bone.scale.y)
}
