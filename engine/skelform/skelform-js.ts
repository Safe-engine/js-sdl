import type {
  SkelFormAnimation,
  SkelFormArmature,
  SkelFormBone,
  SkelFormInverseKinematics,
  SkelFormPhysics,
  SkelFormStyle,
  SkelFormTexture,
  SkelFormVec2,
  SkelFormVisual,
} from './types'

export function SkfGenericFormatFrame(
  frame: number,
  animation: SkelFormAnimation,
  reverse = false,
  loop = true,
): number {
  const lastFrame = animation.keyframes.at(-1)?.frame ?? 0
  if (loop && lastFrame >= 0) frame %= lastFrame + 1
  if (reverse) frame = lastFrame - frame
  return Math.max(0, Math.min(lastFrame, Math.round(frame)))
}

export function SkfGenericTimeFrame(
  timeMs: number,
  animation: SkelFormAnimation,
  reverse = false,
  loop = true,
): number {
  return SkfGenericFormatFrame(
    timeMs / 1000 * animation.fps,
    animation,
    reverse,
    loop,
  )
}

export function SkfGenericGetBoneTexture(
  textureName: string,
  styles: readonly SkelFormStyle[],
): SkelFormTexture | undefined {
  for (const style of styles) {
    const texture = style.textures.find(item => item.name === textureName)
    if (texture) return texture
  }
}

export function SkfGenericAnimate(
  bones: SkelFormBone[],
  animations: readonly SkelFormAnimation[],
  frames: readonly number[],
  smoothFrames: readonly number[],
): void {
  resetUnanimatedFields(bones, animations)

  for (let animationIndex = 0; animationIndex < animations.length; animationIndex++) {
    const animation = animations[animationIndex]
    const frame = frames[animationIndex] ?? 0
    for (let keyframeIndex = 0; keyframeIndex < animation.keyframes.length; keyframeIndex++) {
      const keyframe = animation.keyframes[keyframeIndex]
      if (keyframe.frame > frame) break

      const nextIndex = keyframe.next_kf < 0 ? keyframeIndex : keyframe.next_kf
      const next = animation.keyframes[nextIndex] ?? keyframe
      if (next.frame < frame && nextIndex !== keyframeIndex) continue

      const bone = bones[keyframe.bone_id]
      if (!bone) continue
      const value = interpolateKeyframes(
        fieldValue(bone, keyframe.element),
        keyframe,
        next,
        frame,
        smoothFrames[animationIndex] ?? 0,
      )
      setFieldValue(bone, keyframe.element, value)
    }
  }
}

export function SkfGenericConstruct(armature: SkelFormArmature): SkelFormBone[] {
  const bones = armature.bones
  if (!armature.cachedBones || armature.cachedBones.length !== bones.length) {
    armature.cachedBones = bones.map(cloneBone)
  } else {
    armature.cachedBones.sort((a, b) => a.id - b.id)
  }

  const cached = armature.cachedBones
  resetInheritance(cached, bones)
  applyInheritance(cached, new Map(), [])

  let ikRotations = new Map<number, number>()
  if (armature.inverse_kinematics?.length) {
    ikRotations = applyInverseKinematics(cached, armature.inverse_kinematics)
    resetInheritance(cached, bones)
    applyInheritance(cached, ikRotations, [])
  }

  if (armature.physics?.length) {
    simulatePhysics(cached, armature.physics)
    resetInheritance(cached, bones)
    applyInheritance(cached, ikRotations, armature.physics)
  }

  constructVertices(cached, armature.visuals)
  return cached
}

function fieldValue(bone: SkelFormBone, element: string): number {
  switch (element) {
    case 'PositionX': return bone.pos.x
    case 'PositionY': return bone.pos.y
    case 'Rotation': return bone.rot
    case 'ScaleX': return bone.scale.x
    case 'ScaleY': return bone.scale.y
    case 'Hidden': return bone.hidden ? 1 : 0
    default: return 0
  }
}

function setFieldValue(bone: SkelFormBone, element: string, value: number): void {
  switch (element) {
    case 'PositionX':
      bone.pos.x = value
      break
    case 'PositionY':
      bone.pos.y = value
      break
    case 'Rotation':
      bone.rot = value
      break
    case 'ScaleX':
      bone.scale.x = value
      break
    case 'ScaleY':
      bone.scale.y = value
      break
    case 'Hidden':
      bone.hidden = value === 1
      break
  }
}

function resetUnanimatedFields(
  bones: SkelFormBone[],
  animations: readonly SkelFormAnimation[],
): void {
  const fields = new Map<number, Set<string>>()
  for (const animation of animations) {
    for (const keyframe of animation.keyframes) {
      let boneFields = fields.get(keyframe.bone_id)
      if (!boneFields) fields.set(keyframe.bone_id, boneFields = new Set())
      boneFields.add(keyframe.element)
    }
  }

  for (const bone of bones) {
    const animated = fields.get(bone.id)
    if (!animated?.has('PositionX')) bone.pos.x = bone.init_pos.x
    if (!animated?.has('PositionY')) bone.pos.y = bone.init_pos.y
    if (!animated?.has('Rotation')) bone.rot = bone.init_rot
    if (!animated?.has('ScaleX')) bone.scale.x = bone.init_scale.x
    if (!animated?.has('ScaleY')) bone.scale.y = bone.init_scale.y
    if (!animated?.has('Hidden')) bone.hidden = bone.init_hidden ?? false
  }
}

function interpolateKeyframes(
  field: number,
  previous: SkelFormAnimation['keyframes'][number],
  next: SkelFormAnimation['keyframes'][number],
  frame: number,
  smoothFrame: number,
): number {
  const totalFrames = next.frame - previous.frame
  const currentFrame = frame - previous.frame
  const result = interpolate(
    currentFrame,
    totalFrames,
    previous.value,
    next.value,
    next.start_handle,
    next.end_handle,
  )
  return interpolate(
    currentFrame,
    smoothFrame,
    field,
    result,
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  )
}

function interpolate(
  current: number,
  max: number,
  start: number,
  end: number,
  startHandle: SkelFormVec2,
  endHandle: SkelFormVec2,
): number {
  if (startHandle.y === 999 && endHandle.y === 999) return start
  if (max === 0 || current >= max) return end

  const initial = current / max
  let time = initial
  for (let i = 0; i < 5; i++) {
    const x = cubicBezier(time, startHandle.x, endHandle.x)
    const derivative = cubicBezierDerivative(time, startHandle.x, endHandle.x)
    if (Math.abs(derivative) < 1e-5) break
    time = Math.max(0, Math.min(1, time - (x - initial) / derivative))
  }
  const progress = cubicBezier(time, startHandle.y, endHandle.y)
  return start + (end - start) * progress
}

function cubicBezier(time: number, p1: number, p2: number): number {
  const inverse = 1 - time
  return 3 * inverse * inverse * time * p1
    + 3 * inverse * time * time * p2
    + time * time * time
}

function cubicBezierDerivative(time: number, p1: number, p2: number): number {
  const inverse = 1 - time
  return 3 * inverse * inverse * p1
    + 6 * inverse * time * (p2 - p1)
    + 3 * time * time * (1 - p2)
}

function cloneBone(bone: SkelFormBone): SkelFormBone {
  return {
    ...bone,
    pos: { ...bone.pos },
    scale: { ...bone.scale },
    init_pos: { ...bone.init_pos },
    init_scale: { ...bone.init_scale },
  }
}

function resetInheritance(cached: SkelFormBone[], source: SkelFormBone[]): void {
  for (let index = 0; index < cached.length; index++) {
    cached[index].pos = { ...source[index].pos }
    cached[index].scale = { ...source[index].scale }
    cached[index].rot = source[index].rot
    cached[index].hidden = source[index].hidden
  }
}

function applyInheritance(
  bones: SkelFormBone[],
  ikRotations: ReadonlyMap<number, number>,
  physics: readonly SkelFormPhysics[],
): void {
  for (const bone of bones) {
    if (bone.parent_id < 0) continue
    const parent = bones[bone.parent_id]
    if (!parent) continue
    const physical = physics[bone.physics_id]
    let orbitRotation = parent.rot
    if (physical?.sway) orbitRotation -= physical.global_orbit_diff ?? 0

    bone.rot += orbitRotation
    bone.scale = multiply(bone.scale, parent.scale)
    bone.pos = add(rotate(multiply(bone.pos, parent.scale), orbitRotation), parent.pos)

    const ikRotation = ikRotations.get(bone.id)
    if (ikRotation !== undefined) bone.rot = ikRotation
    if (physical?.rot_damping) bone.rot = physical.global_rot ?? bone.rot
    if (physical?.pos_damping) bone.pos = { ...(physical.global_pos ?? bone.pos) }
    if (physical?.scale_damping) bone.scale = { ...(physical.global_scale ?? bone.scale) }
  }
}

function applyInverseKinematics(
  bones: SkelFormBone[],
  families: readonly SkelFormInverseKinematics[],
): Map<number, number> {
  const rotations = new Map<number, number>()
  for (const family of families) {
    if (family.bone_ids.length < 2) continue
    const first = bones[family.bone_ids[0]]
    const targetBone = bones[family.target_id]
    if (!first || !targetBone) continue
    const root = { ...first.pos }
    const target = { ...targetBone.pos }

    if (family.mode === 'FABRIK') {
      for (let iteration = 0; iteration < 10; iteration++) {
        fabrik(bones, family.bone_ids, root, target)
      }
    } else {
      arcIk(bones, family.bone_ids, root, target)
    }

    const endBone = bones[family.bone_ids.at(-1)!]
    let tip = { ...endBone.pos }
    for (let index = family.bone_ids.length - 2; index >= 0; index--) {
      const bone = bones[family.bone_ids[index]]
      const direction = subtract(tip, bone.pos)
      bone.rot = Math.atan2(direction.y, direction.x)
      tip = { ...bone.pos }
    }

    const jointDirection = normalize(subtract(bones[family.bone_ids[1]].pos, root))
    const baseDirection = normalize(subtract(target, root))
    const direction = jointDirection.x * baseDirection.y - baseDirection.x * jointDirection.y
    const baseAngle = Math.atan2(baseDirection.y, baseDirection.x)
    const clockwise = family.constraint === 'Clockwise' && direction > 0
    const counterClockwise = family.constraint === 'CounterClockwise' && direction < 0
    if (clockwise || counterClockwise) {
      for (const id of family.bone_ids) bones[id].rot = -bones[id].rot + baseAngle * 2
    }

    for (let index = 0; index < family.bone_ids.length - 1; index++) {
      const bone = bones[family.bone_ids[index]]
      rotations.set(bone.id, bone.rot)
    }
  }
  return rotations
}

function fabrik(
  bones: SkelFormBone[],
  ids: readonly number[],
  root: SkelFormVec2,
  target: SkelFormVec2,
): void {
  let nextPosition = { ...target }
  let nextLength = 0
  for (let reverseIndex = ids.length - 1; reverseIndex >= 0; reverseIndex--) {
    const bone = bones[ids[reverseIndex]]
    const length = scale(normalize(subtract(nextPosition, bone.pos)), nextLength)
    if (reverseIndex > 0) {
      nextLength = magnitude(subtract(bone.pos, bones[ids[reverseIndex - 1]].pos))
    }
    bone.pos = subtract(nextPosition, length)
    nextPosition = { ...bone.pos }
  }

  let previousPosition = { ...root }
  let previousLength = 0
  for (let index = 0; index < ids.length; index++) {
    const bone = bones[ids[index]]
    const length = scale(normalize(subtract(previousPosition, bone.pos)), previousLength)
    if (index < ids.length - 1) {
      previousLength = magnitude(subtract(bone.pos, bones[ids[index + 1]].pos))
    }
    bone.pos = subtract(previousPosition, length)
    previousPosition = { ...bone.pos }
  }
}

function arcIk(
  bones: SkelFormBone[],
  ids: readonly number[],
  root: SkelFormVec2,
  target: SkelFormVec2,
): void {
  const distances = [0]
  const maxLength = magnitude(subtract(bones[ids.at(-1)!].pos, root))
  if (maxLength === 0) return
  let currentLength = 0
  for (let index = 1; index < ids.length; index++) {
    currentLength += magnitude(subtract(bones[ids[index]].pos, bones[ids[index - 1]].pos))
    distances.push(currentLength / maxLength)
  }

  const base = subtract(target, root)
  const baseAngle = Math.atan2(base.y, base.x)
  const baseMagnitude = Math.max(1e-6, Math.min(magnitude(base), maxLength))
  const peak = maxLength / baseMagnitude
  const valley = baseMagnitude / maxLength
  for (let index = 1; index < ids.length; index++) {
    const bone = bones[ids[index]]
    bone.pos = {
      x: bone.pos.x * valley,
      y: root.y + (1 - peak) * Math.sin(distances[index] * Math.PI) * baseMagnitude,
    }
    bone.pos = add(rotate(subtract(bone.pos, root), baseAngle), root)
  }
}

function simulatePhysics(bones: SkelFormBone[], physics: SkelFormPhysics[]): void {
  const startHandle = { x: 0.3, y: 0.3 }
  const endHandle = { x: 0.6, y: 0.6 }
  for (const bone of bones) {
    const physical = physics[bone.physics_id]
    if (!physical) continue
    physical.global_pos ??= { ...bone.pos }
    physical.global_scale ??= { ...bone.scale }
    physical.global_rot ??= bone.rot
    physical.global_orbit ??= 0
    physical.global_orbit_vel ??= 0
    const previousPosition = { ...physical.global_pos }

    if (physical.pos_damping || physical.sway) {
      const damping = {
        x: physical.pos_damping ?? 0,
        y: physical.pos_damping ?? 0,
      }
      if ((physical.pos_ratio ?? 0) < 0) damping.y *= 1 - Math.abs(physical.pos_ratio!)
      else if ((physical.pos_ratio ?? 0) > 0) damping.x *= 1 - physical.pos_ratio!
      physical.global_pos = {
        x: interpolate(2, damping.x, physical.global_pos.x, bone.pos.x, startHandle, endHandle),
        y: interpolate(2, damping.y, physical.global_pos.y, bone.pos.y, startHandle, endHandle),
      }
    }

    if (physical.scale_damping) {
      const damping = { x: physical.scale_damping, y: physical.scale_damping }
      if ((physical.scale_ratio ?? 0) < 0) damping.y *= 1 - Math.abs(physical.scale_ratio!)
      else if ((physical.scale_ratio ?? 0) > 0) damping.x *= 1 - physical.scale_ratio!
      physical.global_scale.x = interpolate(
        2, damping.x, physical.global_scale.x, bone.scale.x, startHandle, endHandle,
      )
      physical.global_scale.y = interpolate(
        2, damping.y, physical.global_scale.y, bone.scale.y, startHandle, endHandle,
      )
    }

    if (physical.rot_damping) {
      physical.global_rot += shortestAngleDelta(physical.global_rot, bone.rot) / physical.rot_damping
    }

    const parent = bones[bone.parent_id]
    if (physical.sway && parent) {
      const difference = normalize(subtract(bone.pos, parent.pos))
      const differenceAngle = Math.atan2(difference.y, difference.x)
      let restingRotation = shortestAngleDelta(physical.global_orbit, differenceAngle)
      if (physical.rot_bounce && physical.rot_bounce <= 1) {
        restingRotation += physical.global_orbit_vel / (2 - physical.rot_bounce)
        physical.global_orbit_vel = restingRotation
      }
      physical.global_orbit += restingRotation / 10

      const velocity = normalize(subtract(physical.global_pos, previousPosition))
      const angle = Math.atan2(-velocity.y, -velocity.x)
      const velocityRotation = shortestAngleDelta(physical.global_orbit, angle)
      const strength = magnitude(subtract(physical.global_pos, previousPosition)) / 1000
      physical.global_orbit += velocityRotation * strength * physical.sway
      physical.global_orbit_diff = differenceAngle - physical.global_orbit
    }
  }
}

function constructVertices(bones: SkelFormBone[], visuals: SkelFormVisual[]): void {
  for (const bone of bones) {
    const visual = visuals[bone.visuals_id]
    if (!visual?.vertices) continue
    for (const vertex of visual.vertices) {
      vertex.pos = inheritVertex(vertex.init_pos, bone, visual.pivot_scale, visual.pivot_rot)
    }

    const binds = visual.binds ?? []
    for (let bindIndex = 0; bindIndex < binds.length; bindIndex++) {
      const bind = binds[bindIndex]
      const bindBone = bones[bind.bone_id]
      if (!bindBone) continue
      for (const boundVertex of bind.verts) {
        const vertex = visual.vertices[boundVertex.id]
        if (!vertex) continue
        if (!bind.is_path) {
          const endPosition = subtract(
            inheritVertex(vertex.init_pos, bindBone, visual.pivot_scale, visual.pivot_rot),
            vertex.pos,
          )
          vertex.pos = add(vertex.pos, scale(endPosition, boundVertex.weight))
          continue
        }

        const previousBind = binds[Math.max(0, bindIndex - 1)]
        const nextBind = binds[Math.min(binds.length - 1, bindIndex + 1)]
        const previousBone = bones[previousBind.bone_id]
        const nextBone = bones[nextBind.bone_id]
        if (!previousBone || !nextBone) continue
        const previousDirection = subtract(bindBone.pos, previousBone.pos)
        const nextDirection = subtract(nextBone.pos, bindBone.pos)
        const normal = add(
          normalize({ x: -previousDirection.y, y: previousDirection.x }),
          normalize({ x: -nextDirection.y, y: nextDirection.x }),
        )
        const normalAngle = Math.atan2(normal.y, normal.x)
        const position = add(vertex.init_pos, bindBone.pos)
        const rotated = rotate(subtract(position, bindBone.pos), normalAngle)
        vertex.pos = add(bindBone.pos, scale(rotated, boundVertex.weight))
      }
    }
  }
}

function inheritVertex(
  position: SkelFormVec2,
  bone: SkelFormBone,
  pivotScale: SkelFormVec2,
  pivotRotation: number,
): SkelFormVec2 {
  return add(
    rotate(multiply(position, multiply(bone.scale, pivotScale)), bone.rot + pivotRotation),
    bone.pos,
  )
}

function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

function add(left: SkelFormVec2, right: SkelFormVec2): SkelFormVec2 {
  return { x: left.x + right.x, y: left.y + right.y }
}

function subtract(left: SkelFormVec2, right: SkelFormVec2): SkelFormVec2 {
  return { x: left.x - right.x, y: left.y - right.y }
}

function multiply(left: SkelFormVec2, right: SkelFormVec2): SkelFormVec2 {
  return { x: left.x * right.x, y: left.y * right.y }
}

function scale(vector: SkelFormVec2, amount: number): SkelFormVec2 {
  return { x: vector.x * amount, y: vector.y * amount }
}

function rotate(point: SkelFormVec2, radians: number): SkelFormVec2 {
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  }
}

function magnitude(vector: SkelFormVec2): number {
  return Math.hypot(vector.x, vector.y)
}

function normalize(vector: SkelFormVec2): SkelFormVec2 {
  const length = magnitude(vector)
  return length === 0 ? { x: 0, y: 0 } : scale(vector, 1 / length)
}
