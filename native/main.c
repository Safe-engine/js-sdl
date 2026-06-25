#define SDL_MAIN_USE_CALLBACKS 1

#include <stdio.h>
#include <stdlib.h>

#include <SDL3/SDL.h>
#include <SDL3/SDL_main.h>

#include <quickjs.h>

#include "js_sdl3.h"

typedef struct AppState {
    JSRuntime *runtime;
    JSContext *context;
    Uint64 previous_ticks;
    bool active;
    bool reset_frame_clock;
} AppState;

static void print_js_exception(JSContext *ctx)
{
    JSValue exception = JS_GetException(ctx);
    const char *message = JS_ToCString(ctx, exception);
    SDL_LogError(SDL_LOG_CATEGORY_APPLICATION, "JS exception: %s", message);
    JS_FreeCString(ctx, message);

    JSValue stack = JS_GetPropertyStr(ctx, exception, "stack");
    if (!JS_IsUndefined(stack)) {
        const char *trace = JS_ToCString(ctx, stack);
        SDL_LogError(SDL_LOG_CATEGORY_APPLICATION, "Stack trace:\n%s", trace);
        JS_FreeCString(ctx, trace);
    }
    JS_FreeValue(ctx, stack);
    JS_FreeValue(ctx, exception);
}

static bool evaluate_bundle(JSContext *ctx)
{
    const char *base_path = SDL_GetBasePath();
    char *bundle_path = NULL;
    if (base_path) SDL_asprintf(&bundle_path, "%sdist/main.js", base_path);

    size_t length = 0;
    void *contents = SDL_LoadFile(
        bundle_path ? bundle_path : "dist/main.js",
        &length);
    if (!contents && bundle_path) {
        contents = SDL_LoadFile("dist/main.js", &length);
    }
    SDL_free(bundle_path);
    if (!contents) {
        SDL_LogError(
            SDL_LOG_CATEGORY_APPLICATION,
            "Cannot load dist/main.js: %s (run: bun run build)",
            SDL_GetError());
        return false;
    }

    JSValue result = JS_Eval(
        ctx,
        contents,
        length,
        "dist/main.js",
        JS_EVAL_TYPE_MODULE);
    SDL_free(contents);

    if (JS_IsException(result)) {
        print_js_exception(ctx);
        JS_FreeValue(ctx, result);
        return false;
    }

    JS_FreeValue(ctx, result);
    return true;
}

SDL_AppResult SDL_AppInit(void **appstate, int argc, char *argv[])
{
    (void)argc;
    (void)argv;

    if (!SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO)) {
        SDL_LogError(
            SDL_LOG_CATEGORY_APPLICATION,
            "SDL_Init failed: %s",
            SDL_GetError());
        return SDL_APP_FAILURE;
    }

    AppState *state = SDL_calloc(1, sizeof(*state));
    if (!state) {
        SDL_Quit();
        return SDL_APP_FAILURE;
    }

    state->runtime = JS_NewRuntime();
    state->context = state->runtime ? JS_NewContext(state->runtime) : NULL;
    state->active = true;
    state->previous_ticks = SDL_GetTicks();

    if (!state->runtime || !state->context ||
        js_init_sdl3(state->context) < 0 ||
        !evaluate_bundle(state->context)) {
        if (state->context) {
            js_sdl3_shutdown(state->context);
            JS_FreeContext(state->context);
        }
        if (state->runtime) JS_FreeRuntime(state->runtime);
        SDL_free(state);
        SDL_Quit();
        return SDL_APP_FAILURE;
    }

    js_call_onInit(state->context);
    *appstate = state;
    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppEvent(void *appstate, SDL_Event *event)
{
    AppState *state = appstate;
    JSContext *ctx = state->context;

    js_convert_event_to_render_coordinates(event);

    switch (event->type) {
        case SDL_EVENT_QUIT:
            js_call_terminate(ctx);
            return SDL_APP_SUCCESS;
        case SDL_EVENT_TERMINATING:
            js_call_terminate(ctx);
            return SDL_APP_SUCCESS;
        case SDL_EVENT_LOW_MEMORY:
            js_call_low_memory(ctx);
            break;
        case SDL_EVENT_WILL_ENTER_BACKGROUND:
            state->active = false;
            js_call_interruption(ctx, 1);
            js_call_pause(ctx);
            break;
        case SDL_EVENT_DID_ENTER_BACKGROUND:
            js_call_background(ctx);
            break;
        case SDL_EVENT_WILL_ENTER_FOREGROUND:
            js_call_foreground(ctx);
            break;
        case SDL_EVENT_DID_ENTER_FOREGROUND:
            state->active = true;
            state->reset_frame_clock = true;
            js_call_resume(ctx);
            js_call_interruption(ctx, 0);
            break;
        case SDL_EVENT_MOUSE_BUTTON_DOWN: {
            if (event->button.which == SDL_TOUCH_MOUSEID) break;
            js_call_touchStart(ctx, event->button.x, event->button.y);
            break;
        }
        case SDL_EVENT_MOUSE_MOTION: {
            if (event->motion.which == SDL_TOUCH_MOUSEID) break;
            if (event->motion.state != 0) {
                js_call_touchMove(ctx, event->motion.x, event->motion.y);
            }
            break;
        }
        case SDL_EVENT_MOUSE_BUTTON_UP: {
            if (event->button.which == SDL_TOUCH_MOUSEID) break;
            js_call_touchEnd(ctx, event->button.x, event->button.y);
            break;
        }
        case SDL_EVENT_FINGER_DOWN:
            js_call_touchStart(ctx, event->tfinger.x, event->tfinger.y);
            break;
        case SDL_EVENT_FINGER_MOTION:
            js_call_touchMove(ctx, event->tfinger.x, event->tfinger.y);
            break;
        case SDL_EVENT_FINGER_UP:
            js_call_touchEnd(ctx, event->tfinger.x, event->tfinger.y);
            break;
        case SDL_EVENT_TEXT_INPUT:
            js_call_textInput(ctx, event->text.text);
            break;
        case SDL_EVENT_KEY_DOWN:
            if (!event->key.repeat) {
                js_call_keyDown(ctx, SDL_GetKeyName(event->key.key));
            }
            break;
        case SDL_EVENT_KEY_UP:
            js_call_keyUp(ctx, SDL_GetKeyName(event->key.key));
            break;
        case SDL_EVENT_DISPLAY_ORIENTATION: {
            int width;
            int height;
            js_get_window_size(&width, &height);
            js_call_orientation_change(
                ctx,
                (SDL_DisplayOrientation)event->display.data1,
                width,
                height);
            break;
        }
    }

    return SDL_APP_CONTINUE;
}

SDL_AppResult SDL_AppIterate(void *appstate)
{
    AppState *state = appstate;
    Uint64 now = SDL_GetTicks();
    float delta_time = state->reset_frame_clock
        ? 0.0f
        : (float)(now - state->previous_ticks) / 1000.0f;

    state->previous_ticks = now;
    state->reset_frame_clock = false;

    js_execute_pending_job(state->runtime);
    if (state->active) {
        js_call_onUpdate_dt(state->context, delta_time);
        js_call_onRender(state->context);
    }

    SDL_Delay(1);
    return SDL_APP_CONTINUE;
}

void SDL_AppQuit(void *appstate, SDL_AppResult result)
{
    (void)result;

    AppState *state = appstate;
    if (state) {
        js_sdl3_shutdown(state->context);
        JS_FreeContext(state->context);
        JS_FreeRuntime(state->runtime);
        SDL_free(state);
    }

    SDL_Quit();
}
