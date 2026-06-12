#pragma once

#include <quickjs.h>
#include <SDL3/SDL.h>

int  js_init_sdl3(JSContext *ctx);

/* helpers for main.c game loop */
void js_call_onInit(JSContext *ctx);
void js_call_onUpdate(JSContext *ctx);
void js_call_onUpdate_dt(JSContext *ctx, float dt);
void js_call_onRender(JSContext *ctx);
void js_call_touchStart(JSContext *ctx, float x, float y);
void js_call_touchMove(JSContext *ctx, float x, float y);
void js_call_touchEnd(JSContext *ctx, float x, float y);
int  js_get_win_w(void);
int  js_get_win_h(void);
