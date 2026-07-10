export interface SkelFormVec2 {
  x: number
  y: number
}

export type SkelFormData = string | ArrayBuffer | Uint8Array

export interface SkelFormProps {
  data: SkelFormData
  animation?: string
  styles?: string[]
  timeScale?: number
  loop?: boolean
  smoothFrames?: number
  onAnimationComplete?: (animationName?: string, loopCount?: number) => void
}

export interface SkelFormKeyframe {
  frame: number
  bone_id: number
  element: string
  value: number
  start_handle: SkelFormVec2
  end_handle: SkelFormVec2
  next_kf: number
}

export interface SkelFormAnimation {
  id: number
  name: string
  fps: number
  keyframes: SkelFormKeyframe[]
}

export interface SkelFormBone {
  id: number
  name: string
  parent_id: number
  pos: SkelFormVec2
  scale: SkelFormVec2
  rot: number
  hidden?: boolean
  init_pos: SkelFormVec2
  init_scale: SkelFormVec2
  init_rot: number
  init_hidden?: boolean
  physics_id: number
  visuals_id: number
}

export interface SkelFormVertex {
  id: number
  pos: SkelFormVec2
  uv: SkelFormVec2
  init_pos: SkelFormVec2
}

export interface SkelFormVisual {
  tex: string
  zindex: number
  pivot_scale: SkelFormVec2
  pivot_rot: number
  vertices?: SkelFormVertex[]
  indices?: number[]
  binds?: Array<{
    bone_id: number
    is_path: boolean
    verts: Array<{ id: number, weight: number }>
  }>
}

export interface SkelFormTexture {
  name: string
  offset: SkelFormVec2
  size: SkelFormVec2
  atlas_idx: number
}

export interface SkelFormStyle {
  id: number
  name: string
  textures: SkelFormTexture[]
}

export interface SkelFormAtlas {
  filename: string
  size: SkelFormVec2
  textureId?: number
}

export interface SkelFormInverseKinematics {
  constraint: string
  mode: string
  target_id: number
  bone_ids: number[]
}

export interface SkelFormPhysics {
  pos_damping?: number
  pos_ratio?: number
  scale_damping?: number
  scale_ratio?: number
  rot_damping?: number
  sway?: number
  rot_bounce?: number
  global_pos?: SkelFormVec2
  global_scale?: SkelFormVec2
  global_rot?: number
  global_orbit?: number
  global_orbit_diff?: number
  global_orbit_vel?: number
}

export interface SkelFormArmature {
  version: string
  bones: SkelFormBone[]
  animations: SkelFormAnimation[]
  atlases: SkelFormAtlas[]
  styles: SkelFormStyle[]
  visuals: SkelFormVisual[]
  inverse_kinematics?: SkelFormInverseKinematics[]
  physics?: SkelFormPhysics[]
  cachedBones?: SkelFormBone[]
}
