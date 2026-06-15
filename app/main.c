#include <stdio.h>
#include <stdlib.h>

#include <SDL3/SDL.h>
#include <SDL3_ttf/SDL_ttf.h>

#include <quickjs.h>

#include "js_sdl3.h"

static JSRuntime *rt;
static JSContext *ctx;
static bool app_active = true;
static bool reset_frame_clock = false;

static bool SDLCALL handle_app_event(void *userdata, SDL_Event *event)
{
    JSContext *event_ctx = userdata;

    switch (event->type) {
        case SDL_EVENT_TERMINATING:
            js_call_terminate(event_ctx);
            break;
        case SDL_EVENT_LOW_MEMORY:
            js_call_low_memory(event_ctx);
            break;
        case SDL_EVENT_WILL_ENTER_BACKGROUND:
            app_active = false;
            js_call_interruption(event_ctx, 1);
            js_call_pause(event_ctx);
            break;
        case SDL_EVENT_DID_ENTER_BACKGROUND:
            js_call_background(event_ctx);
            break;
        case SDL_EVENT_WILL_ENTER_FOREGROUND:
            js_call_foreground(event_ctx);
            break;
        case SDL_EVENT_DID_ENTER_FOREGROUND:
            app_active = true;
            reset_frame_clock = true;
            js_call_resume(event_ctx);
            js_call_interruption(event_ctx, 0);
            break;
    }
    return true;
}

int main()
{
    SDL_Init(SDL_INIT_VIDEO);

    if (!TTF_Init()) {
        fprintf(stderr, "TTF_Init Error: %s\n", SDL_GetError());
        return 1;
    }

    rt = JS_NewRuntime();
    ctx = JS_NewContext(rt);
    js_init_sdl3(ctx);
    SDL_AddEventWatch(handle_app_event, ctx);

    /* eval bundled dist/index.js */
    FILE *fp = fopen("dist/index.js", "rb");
    if (!fp) {
        fprintf(stderr, "cannot open dist/index.js (run: npm run build)\n");
        return 1;
    }
    fseek(fp, 0, SEEK_END);
    long len = ftell(fp);
    rewind(fp);
    char *code = malloc((size_t)len + 1);
    fread(code, 1, (size_t)len, fp);
    code[len] = 0;
    fclose(fp);

    JSValue result = JS_Eval(ctx, code, (size_t)len, "main.js", JS_EVAL_TYPE_MODULE);
    free(code);

    if (JS_IsException(result)) {
        JSValue exc = JS_GetException(ctx);
        const char *str = JS_ToCString(ctx, exc);
        fprintf(stderr, "JS exception: %s\n", str);
        JS_FreeCString(ctx, str);

        /* print stack trace if available */
        JSValue stack = JS_GetPropertyStr(ctx, exc, "stack");
        if (!JS_IsUndefined(stack)) {
            const char *trace = JS_ToCString(ctx, stack);
            fprintf(stderr, "Stack trace:\n%s\n", trace);
            JS_FreeCString(ctx, trace);
        }
        JS_FreeValue(ctx, stack);
        JS_FreeValue(ctx, exc);
    }
    JS_FreeValue(ctx, result);

    /* call onInit once */
    js_call_onInit(ctx);

    /* C-driven game loop */
    Uint64 prev = SDL_GetTicks();
    int running = 1;

    while (running) {
        /* events */
        SDL_Event event;
        while (SDL_PollEvent(&event)) {
            switch (event.type) {
                case SDL_EVENT_QUIT:
                    running = 0;
                    break;

                case SDL_EVENT_MOUSE_BUTTON_DOWN:
                    js_call_touchStart(ctx, event.button.x, event.button.y);
                    break;

                case SDL_EVENT_MOUSE_MOTION:
                    if (event.motion.state)
                        js_call_touchMove(ctx, event.motion.x, event.motion.y);
                    break;

                case SDL_EVENT_MOUSE_BUTTON_UP:
                    js_call_touchEnd(ctx, event.button.x, event.button.y);
                    break;

                case SDL_EVENT_FINGER_DOWN:
                    js_call_touchStart(ctx,
                        event.tfinger.x * js_get_win_w(),
                        event.tfinger.y * js_get_win_h());
                    break;

                case SDL_EVENT_FINGER_MOTION:
                    js_call_touchMove(ctx,
                        event.tfinger.x * js_get_win_w(),
                        event.tfinger.y * js_get_win_h());
                    break;

                case SDL_EVENT_FINGER_UP:
                    js_call_touchEnd(ctx,
                        event.tfinger.x * js_get_win_w(),
                        event.tfinger.y * js_get_win_h());
                    break;

                case SDL_EVENT_DISPLAY_ORIENTATION: {
                    int width;
                    int height;
                    js_get_window_size(&width, &height);
                    js_call_orientation_change(
                        ctx,
                        (SDL_DisplayOrientation)event.display.data1,
                        width,
                        height);
                    break;
                }
            }
        }

        Uint64 now = SDL_GetTicks();
        float dt = reset_frame_clock
            ? 0.0f
            : (float)(now - prev) / 1000.0f;
        prev = now;
        reset_frame_clock = false;

        /* tick */
        js_execute_pending_job(rt);
        if (app_active) {
            js_call_onUpdate_dt(ctx, dt);
            js_call_onRender(ctx);
        }

        SDL_Delay(1);
    }

    SDL_RemoveEventWatch(handle_app_event, ctx);
    js_sdl3_shutdown(ctx);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    TTF_Quit();
    SDL_Quit();
    return 0;
}
