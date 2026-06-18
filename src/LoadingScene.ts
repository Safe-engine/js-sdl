import {
  instantiate,
  Label,
  loadAll,
  loadScene,
  Panel,
  ProgressBar,
  Scene
} from "../engine";
import * as Assets from "./assets";
import {
  sf_button
} from "./assets";
import { HomeScene } from "./HomeScene";

export class LoadingScene extends Scene {
  private progressBar: ProgressBar | null = null;
  private percentLabel: Label | null = null;
  private loadStarted = false;

  onEnter(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    void this.load();
  }

  async load(): Promise<void> {
    try {
      await loadAll(Assets, (progress) => {
        this.progressBar?.setFillRange(progress);
        this.percentLabel?.setText(`${Math.round(progress * 100)}%`);
        console.info("LoadingScene load assets", progress);
      });
      loadScene(HomeScene);
    } catch (error) {
      console.error("LoadingScene failed to load assets", error);
      this.percentLabel?.setText("LOAD FAILED");
    }
  }

  __view() {
    const backgroundComp = instantiate(Panel, {});
    this.root.addChild(backgroundComp.node);
    backgroundComp.node.x = 360;
    backgroundComp.node.y = 640;
    backgroundComp.node.width = 720;
    backgroundComp.node.height = 1280;
    backgroundComp.color = { r: 15, g: 23, b: 42, a: 255 };

    const titleComp = instantiate(Label, {
      string: "LOADING",
      size: 36,
      align: "center",
      verticalAlign: "middle",
    });
    this.root.addChild(titleComp.node);
    titleComp.node.x = 360;
    titleComp.node.y = 560;
    titleComp.node.width = 360;
    titleComp.node.height = 48;

    const progressBarComp = instantiate(ProgressBar, {
      spriteFrame: sf_button,
      fillRange: 0,
    });
    this.root.addChild(progressBarComp.node);
    progressBarComp.node.x = 360;
    progressBarComp.node.y = 640;
    progressBarComp.node.width = 480;
    progressBarComp.node.height = 34;
    progressBarComp.backgroundColor = { r: 30, g: 41, b: 59, a: 255 };
    progressBarComp.fillColor = { r: 255, g: 255, b: 255, a: 255 };
    this.progressBar = progressBarComp;

    const percentLabelComp = instantiate(Label, {
      string: "0%",
      size: 28,
      align: "center",
      verticalAlign: "middle",
    });
    this.root.addChild(percentLabelComp.node);
    percentLabelComp.node.x = 360;
    percentLabelComp.node.y = 700;
    percentLabelComp.node.width = 160;
    percentLabelComp.node.height = 40;
    this.percentLabel = percentLabelComp;
  }
}
