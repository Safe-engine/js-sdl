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

# chatgpt response

Với SDL3 + QuickJS-NG cài từ Homebrew, kiến trúc đơn giản nhất là:

```text
project/
├── CMakeLists.txt
├── app/
│   ├── main.c
│   ├── js_sdl3.c
│   └── js_sdl3.h
├── src/
│   └── main.js
├── res/
│   ├── player.png
│   └── bullet.png
```

Mục tiêu:

```js
import {
  createWindow,
  onInit,
  onUpdate,
  onRender,
  loadTexture,
  clear,
  drawTexture,
  present
} from "sdl3";
```

---

# CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.20)

project(SafeXEngine C)

set(CMAKE_C_STANDARD 11)

find_package(SDL3 REQUIRED)
find_package(PkgConfig REQUIRED)

pkg_check_modules(QUICKJS REQUIRED quickjs)

include_directories(
    ${SDL3_INCLUDE_DIRS}
    ${QUICKJS_INCLUDE_DIRS}
    app
)

link_directories(
    ${QUICKJS_LIBRARY_DIRS}
)

add_executable(
    safex
    app/main.c
    app/js_sdl3.c
)

target_link_libraries(
    safex
    SDL3::SDL3
    ${QUICKJS_LIBRARIES}
)
```

---

# app/js_sdl3.h

```c
#pragma once

#include <quickjs.h>
#include <SDL3/SDL.h>

int js_init_sdl3(JSContext *ctx);
```

---

# app/js_sdl3.c

```c
#include "js_sdl3.h"

static SDL_Window* g_window = NULL;
static SDL_Renderer* g_renderer = NULL;

#define MAX_TEXTURES 256

static SDL_Texture* g_textures[MAX_TEXTURES];
static int g_textureCount = 0;

static JSValue js_createWindow(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    const char* title =
        JS_ToCString(ctx, argv[0]);

    int width;
    int height;

    JS_ToInt32(ctx, &width, argv[1]);
    JS_ToInt32(ctx, &height, argv[2]);

    g_window = SDL_CreateWindow(
        title,
        width,
        height,
        0
    );

    g_renderer = SDL_CreateRenderer(
        g_window,
        NULL
    );

    JS_FreeCString(ctx, title);

    return JS_UNDEFINED;
}

static JSValue js_loadTexture(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    const char* path =
        JS_ToCString(ctx, argv[0]);

    SDL_Surface* surface =
        SDL_LoadBMP(path);

    if (!surface)
    {
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    SDL_Texture* tex =
        SDL_CreateTextureFromSurface(
            g_renderer,
            surface
        );

    SDL_DestroySurface(surface);

    int id = g_textureCount++;

    g_textures[id] = tex;

    JS_FreeCString(ctx, path);

    return JS_NewInt32(ctx, id);
}

static JSValue js_clear(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    SDL_SetRenderDrawColor(
        g_renderer,
        9,
        15,
        29,
        255
    );

    SDL_RenderClear(g_renderer);

    return JS_UNDEFINED;
}

static JSValue js_drawTexture(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id;
    float x;
    float y;

    JS_ToInt32(ctx, &id, argv[0]);

    double dx;
    double dy;

    JS_ToFloat64(ctx, &dx, argv[1]);
    JS_ToFloat64(ctx, &dy, argv[2]);

    x = (float)dx;
    y = (float)dy;

    SDL_FRect dst;

    dst.x = x;
    dst.y = y;
    dst.w = 64;
    dst.h = 64;

    SDL_RenderTexture(
        g_renderer,
        g_textures[id],
        NULL,
        &dst
    );

    return JS_UNDEFINED;
}

static JSValue js_present(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    SDL_RenderPresent(g_renderer);
    return JS_UNDEFINED;
}

static const JSCFunctionListEntry funcs[] =
{
    JS_CFUNC_DEF(
        "createWindow",
        3,
        js_createWindow),

    JS_CFUNC_DEF(
        "loadTexture",
        1,
        js_loadTexture),

    JS_CFUNC_DEF(
        "clear",
        0,
        js_clear),

    JS_CFUNC_DEF(
        "drawTexture",
        3,
        js_drawTexture),

    JS_CFUNC_DEF(
        "present",
        0,
        js_present),
};

static int js_sdl3_init(
    JSContext *ctx,
    JSModuleDef *m)
{
    return JS_SetModuleExportList(
        ctx,
        m,
        funcs,
        sizeof(funcs) /
        sizeof(JSCFunctionListEntry)
    );
}

JSModuleDef* js_init_module_sdl3(
    JSContext *ctx,
    const char *module_name)
{
    JSModuleDef *m =
        JS_NewCModule(
            ctx,
            module_name,
            js_sdl3_init
        );

    JS_AddModuleExportList(
        ctx,
        m,
        funcs,
        sizeof(funcs) /
        sizeof(JSCFunctionListEntry)
    );

    return m;
}

int js_init_sdl3(JSContext *ctx)
{
    js_init_module_sdl3(ctx, "sdl3");
    return 0;
}
```

---

# app/main.c

```c
#include <stdio.h>

#include <SDL3/SDL.h>

#include <quickjs.h>

#include "js_sdl3.h"

static JSRuntime* rt;
static JSContext* ctx;

int main()
{
    SDL_Init(SDL_INIT_VIDEO);

    rt = JS_NewRuntime();
    ctx = JS_NewContext(rt);

    js_init_sdl3(ctx);

    FILE* fp =
        fopen("src/main.js", "rb");

    fseek(fp, 0, SEEK_END);
    long len = ftell(fp);
    rewind(fp);

    char* code =
        malloc(len + 1);

    fread(code, 1, len, fp);
    code[len] = 0;

    fclose(fp);

    JSValue result =
        JS_Eval(
            ctx,
            code,
            len,
            "main.js",
            JS_EVAL_TYPE_MODULE
        );

    free(code);

    JS_FreeValue(ctx, result);

    int running = 1;

    while (running)
    {
        SDL_Event event;

        while (SDL_PollEvent(&event))
        {
            if (event.type == SDL_EVENT_QUIT)
            {
                running = 0;
            }
        }

        SDL_Delay(16);
    }

    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);

    SDL_Quit();

    return 0;
}
```

---

# src/main.js

```js
import {
    createWindow,
    loadTexture,
    clear,
    drawTexture,
    present
} from "sdl3";

createWindow(
    "SafeX Engine",
    1280,
    720
);

const player =
    loadTexture(
        "res/player.bmp"
    );

let x = 100;

function frame()
{
    clear();

    drawTexture(
        player,
        x,
        200
    );

    present();

    x += 1;

    setTimeout(
        frame,
        16
    );
}

frame();
```

---

# Hỗ trợ PNG thực sự

`SDL_LoadBMP()` chỉ đọc BMP.

Để load PNG:

```bash
brew install sdl3_image
```

CMake:

```cmake
find_package(SDL3_image REQUIRED)

target_link_libraries(
    safex
    SDL3::SDL3
    SDL3_image::SDL3_image
    ${QUICKJS_LIBRARIES}
)
```

Trong `js_loadTexture`:

```c
#include <SDL3_image/SDL_image.h>

SDL_Texture* tex =
    IMG_LoadTexture(
        g_renderer,
        path
    );
```

Khi đó:

```js
const player = loadTexture(
    "res/player.png"
);
```

---

Để hỗ trợ đúng API kiểu game engine:

```js
import {
  onInit,
  onUpdate,
  onRender
} from "sdl3";
```

thì nên thiết kế phía C giữ callback JS:

```c
JSValue g_onInit;
JSValue g_onUpdate;
JSValue g_onRender;
```

và game loop C gọi:

```c
onInit();

while(running)
{
    onUpdate(dt);
    onRender();
}
```

Cách này giống Unity/Cocos Creator hơn, không dùng `setTimeout()` trong JS và cho hiệu năng tốt hơn nhiều.

---

# you asked

message time: 2026-06-12 10:15:17

add onTouchStart, onTouchMove, onTouchEnd,

---

# chatgpt response

Để hỗ trợ:

```js
import {
  onTouchStart,
  onTouchMove,
  onTouchEnd
} from "sdl3";
```

thì nên làm giống Cocos:

```js
onTouchStart((x, y) => {
    console.log("start", x, y);
});

onTouchMove((x, y) => {
    console.log("move", x, y);
});

onTouchEnd((x, y) => {
    console.log("end", x, y);
});
```

---

# js_sdl3.c

## Callback global

```c
static JSValue g_touchStart = JS_UNDEFINED;
static JSValue g_touchMove  = JS_UNDEFINED;
static JSValue g_touchEnd   = JS_UNDEFINED;
```

---

## register callback

```c
static JSValue js_onTouchStart(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0]))
        return JS_EXCEPTION;

    JS_FreeValue(ctx, g_touchStart);

    g_touchStart =
        JS_DupValue(ctx, argv[0]);

    return JS_UNDEFINED;
}

static JSValue js_onTouchMove(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0]))
        return JS_EXCEPTION;

    JS_FreeValue(ctx, g_touchMove);

    g_touchMove =
        JS_DupValue(ctx, argv[0]);

    return JS_UNDEFINED;
}

static JSValue js_onTouchEnd(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0]))
        return JS_EXCEPTION;

    JS_FreeValue(ctx, g_touchEnd);

    g_touchEnd =
        JS_DupValue(ctx, argv[0]);

    return JS_UNDEFINED;
}
```

---

## Export module

Thêm vào:

```c
JS_CFUNC_DEF(
    "onTouchStart",
    1,
    js_onTouchStart),

JS_CFUNC_DEF(
    "onTouchMove",
    1,
    js_onTouchMove),

JS_CFUNC_DEF(
    "onTouchEnd",
    1,
    js_onTouchEnd),
```

---

# helper gọi JS callback

```c
void js_call_touch(
    JSContext* ctx,
    JSValue func,
    float x,
    float y)
{
    if (JS_IsUndefined(func))
        return;

    JSValue argv[2];

    argv[0] =
        JS_NewFloat64(ctx, x);

    argv[1] =
        JS_NewFloat64(ctx, y);

    JSValue ret =
        JS_Call(
            ctx,
            func,
            JS_UNDEFINED,
            2,
            argv
        );

    JS_FreeValue(ctx, argv[0]);
    JS_FreeValue(ctx, argv[1]);
    JS_FreeValue(ctx, ret);
}
```

---

# main.c event loop

SDL3 mouse event:

```c
while(SDL_PollEvent(&event))
{
    switch(event.type)
    {
        case SDL_EVENT_QUIT:
            running = 0;
            break;

        case SDL_EVENT_MOUSE_BUTTON_DOWN:
        {
            js_call_touch(
                ctx,
                g_touchStart,
                event.button.x,
                event.button.y
            );
            break;
        }

        case SDL_EVENT_MOUSE_MOTION:
        {
            if(event.motion.state)
            {
                js_call_touch(
                    ctx,
                    g_touchMove,
                    event.motion.x,
                    event.motion.y
                );
            }
            break;
        }

        case SDL_EVENT_MOUSE_BUTTON_UP:
        {
            js_call_touch(
                ctx,
                g_touchEnd,
                event.button.x,
                event.button.y
            );
            break;
        }
    }
}
```

---

# Mobile touch thật

SDL3 có event touch:

```c
SDL_EVENT_FINGER_DOWN
SDL_EVENT_FINGER_MOTION
SDL_EVENT_FINGER_UP
```

Ví dụ:

```c
case SDL_EVENT_FINGER_DOWN:
{
    float x =
        event.tfinger.x * g_windowWidth;

    float y =
        event.tfinger.y * g_windowHeight;

    js_call_touch(
        ctx,
        g_touchStart,
        x,
        y
    );
    break;
}
```

`tfinger.x` và `tfinger.y` nằm trong khoảng:

```text
0.0 ~ 1.0
```

nên phải nhân với kích thước cửa sổ.

---

# API cuối cùng trong JS

```js
import {
    createWindow,
    onTouchStart,
    onTouchMove,
    onTouchEnd
} from "sdl3";

createWindow(
    "Demo",
    1280,
    720
);

onTouchStart((x, y) => {
    print("start", x, y);
});

onTouchMove((x, y) => {
    print("move", x, y);
});

onTouchEnd((x, y) => {
    print("end", x, y);
});
```

Tiếp theo bạn nên bổ sung:

```js
onInit(cb)
onUpdate(dt)
onRender()
onTouchStart()
onTouchMove()
onTouchEnd()
```

để JS layer có kiến trúc gần giống Cocos Creator/Unity, toàn bộ game loop chạy từ C còn JS chỉ đăng ký callback. Điều này sẽ giúp hot-reload và ECS sau này dễ triển khai hơn.