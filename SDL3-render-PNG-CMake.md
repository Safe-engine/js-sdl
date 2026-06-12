> From: https://chatgpt.com/c/6a2b79c5-ab8c-83ec-8e24-266b72c2eb3e

# you asked

message time: 2026-06-12 09:58:24

write code sdl3 render image png, cmake, use c, add quickjs-ng for js binding export module to js import {onInit,onUpdate,onRender,  createWindow,
onTouchStart, onTouchMove, onTouchEnd,
  loadTexture, loadFont, loadShader,
  clear,
  drawTexture,  drawLabelTTF, drawShader,
  present,
... } from 'sdl3'. quickjs-ng sdl3 cài từ homebrew. viết code cho từng file trong kiến trúc project/
├── CMakeLists.txt
├── app/
│   ├── main.c
│   ├── js_sdl3.c
│   └── js_sdl3.h
├── src/
│   └── main.js
├── res/
   └── player.png, bullet.png

---
