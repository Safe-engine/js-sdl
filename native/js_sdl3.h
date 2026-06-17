#pragma once

#include <quickjs.h>
#include <SDL3/SDL.h>

int  js_init_sdl3(JSContext *ctx);
void js_sdl3_shutdown(JSContext *ctx);
void js_execute_pending_job(JSRuntime *rt);

/* helpers for main.c game loop */
void js_call_onInit(JSContext *ctx);
void js_call_onUpdate(JSContext *ctx);
void js_call_onUpdate_dt(JSContext *ctx, float dt);
void js_call_onRender(JSContext *ctx);
void js_call_touchStart(JSContext *ctx, float x, float y);
void js_call_touchMove(JSContext *ctx, float x, float y);
void js_call_touchEnd(JSContext *ctx, float x, float y);
void js_call_pause(JSContext *ctx);
void js_call_resume(JSContext *ctx);
void js_call_background(JSContext *ctx);
void js_call_foreground(JSContext *ctx);
void js_call_interruption(JSContext *ctx, int active);
void js_call_low_memory(JSContext *ctx);
void js_call_orientation_change(
    JSContext *ctx, SDL_DisplayOrientation orientation, int width, int height);
void js_call_terminate(JSContext *ctx);
void js_get_window_size(int *width, int *height);
int  js_get_win_w(void);
int  js_get_win_h(void);
void js_convert_event_to_render_coordinates(SDL_Event *event);
