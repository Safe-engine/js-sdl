#include <stdio.h>
#include <stdlib.h>

#include <SDL3/SDL.h>
#include <SDL3_ttf/SDL_ttf.h>

#include <quickjs.h>

#include "js_sdl3.h"

static JSRuntime *rt;
static JSContext *ctx;

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
        Uint64 now  = SDL_GetTicks();
        float  dt   = (float)(now - prev) / 1000.0f;
        prev = now;

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
            }
        }

        /* tick */
        js_execute_pending_job(rt);
        js_call_onUpdate_dt(ctx, dt);
        js_call_onRender(ctx);

        SDL_Delay(1);
    }

    js_sdl3_shutdown(ctx);
    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    TTF_Quit();
    SDL_Quit();
    return 0;
}
