import {
  instantiate,
  Label,
  loadAll,
  loadScene,
  Panel,
  ProgressBar,
  Scene,
} from '../engine'
import * as allAssets from './assets'
import {
  sf_button
} from './assets'
import { HomeScene } from './HomeScene'

export class LoadingScene extends Scene {
  private progressBar: ProgressBar | null = null
  private percentLabel: Label
  private loadStarted = false

  onEnter(): void {
    if (this.loadStarted) return
    this.loadStarted = true
    void this.load()
  }

  async load(): Promise<void> {
    try {
      await loadAll(allAssets, (progress) => {
        this.progressBar?.setValue(progress)
        this.percentLabel.string = (`${Math.round(progress * 100)}%`)
        console.info('LoadingScene load assets', progress)
      })
      loadScene(HomeScene)
    } catch (error) {
      console.error('LoadingScene failed to load assets', error)
      this.percentLabel.string = ('LOAD FAILED')
    }
  }

  __view() {
    const backgroundComp = instantiate(Panel, {})
    this.node.addChild(backgroundComp.node)
    backgroundComp.node.x = 360
    backgroundComp.node.y = 640
    backgroundComp.node.width = 720
    backgroundComp.node.height = 1280
    backgroundComp.color = { r: 15, g: 23, b: 42, a: 255 }

    const titleComp = instantiate(Label, {
      string: 'LOADING',
      size: 36,
      align: 'center',
      verticalAlign: 'middle',
    })
    this.node.addChild(titleComp.node)
    titleComp.node.x = 360
    titleComp.node.y = 560
    titleComp.node.width = 360
    titleComp.node.height = 48

    const progressBar = instantiate(ProgressBar, {
      spriteFrame: sf_button,
      fillRange: 0,
    })
    this.node.addChild(progressBar.node)
    progressBar.node.x = 360
    progressBar.node.y = 640
    progressBar.node.width = 480
    progressBar.node.height = 34
    this.progressBar = progressBar

    const percentLabel = instantiate(Label, {
      string: '0%',
      size: 28,
      align: 'center',
      verticalAlign: 'middle',
    })
    this.node.addChild(percentLabel.node)
    percentLabel.node.x = 360
    percentLabel.node.y = 700
    percentLabel.node.width = 160
    percentLabel.node.height = 40
    this.percentLabel = percentLabel
  }
}
