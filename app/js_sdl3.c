#include "js_sdl3.h"
#include <SDL3_image/SDL_image.h>
#include <SDL3_ttf/SDL_ttf.h>
#include <stdio.h>
#include <string.h>

/* --- global state --- */
static SDL_Window   *g_window   = NULL;
static SDL_Renderer *g_renderer = NULL;
static int           g_win_w    = 1280;
static int           g_win_h    = 720;

#define MAX_TEXTURES 256
static SDL_Texture *g_textures[MAX_TEXTURES];
static int          g_textureCount = 0;

#define MAX_FONTS 64
static TTF_Font *g_fonts[MAX_FONTS];
static int       g_fontCount = 0;

/* --- JS callbacks --- */
static JSValue g_onInit   = JS_UNDEFINED;
static JSValue g_onUpdate = JS_UNDEFINED;
static JSValue g_onRender = JS_UNDEFINED;

static JSValue g_touchStart = JS_UNDEFINED;
static JSValue g_touchMove  = JS_UNDEFINED;
static JSValue g_touchEnd   = JS_UNDEFINED;

/* ---- helpers ---- */

static void js_print_exception(JSContext *ctx)
{
    JSValue exc = JS_GetException(ctx);
    const char *str = JS_ToCString(ctx, exc);
    fprintf(stderr, "JS exception: %s\n", str);
    JS_FreeCString(ctx, str);

    JSValue stack = JS_GetPropertyStr(ctx, exc, "stack");
    if (!JS_IsUndefined(stack)) {
        const char *trace = JS_ToCString(ctx, stack);
        fprintf(stderr, "Stack trace:\n%s\n", trace);
        JS_FreeCString(ctx, trace);
    }
    JS_FreeValue(ctx, stack);
    JS_FreeValue(ctx, exc);
}

static void js_call_void(JSContext *ctx, JSValue func)
{
    if (JS_IsUndefined(func)) return;
    JSValue ret = JS_Call(ctx, func, JS_UNDEFINED, 0, NULL);
    if (JS_IsException(ret)) js_print_exception(ctx);
    JS_FreeValue(ctx, ret);
}

static void js_call_touch(JSContext *ctx, JSValue func, float x, float y)
{
    if (JS_IsUndefined(func)) return;
    JSValue argv[2];
    argv[0] = JS_NewFloat64(ctx, (double)x);
    argv[1] = JS_NewFloat64(ctx, (double)y);
    JSValue ret = JS_Call(ctx, func, JS_UNDEFINED, 2, argv);
    if (JS_IsException(ret)) js_print_exception(ctx);
    JS_FreeValue(ctx, argv[0]);
    JS_FreeValue(ctx, argv[1]);
    JS_FreeValue(ctx, ret);
}

/* --- Binding: createWindow(title, w, h) --- */
static JSValue js_createWindow(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    const char *title = JS_ToCString(ctx, argv[0]);
    JS_ToInt32(ctx, &g_win_w, argv[1]);
    JS_ToInt32(ctx, &g_win_h, argv[2]);

    g_window = SDL_CreateWindow(title, g_win_w, g_win_h, 0);
    g_renderer = SDL_CreateRenderer(g_window, NULL);

    JS_FreeCString(ctx, title);
    return JS_UNDEFINED;
}

/* --- Binding: loadTexture(path) → id --- */
static JSValue js_loadTexture(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    const char *path = JS_ToCString(ctx, argv[0]);
    SDL_Texture *tex = IMG_LoadTexture(g_renderer, path);
    JS_FreeCString(ctx, path);

    if (!tex) return JS_NewInt32(ctx, -1);

    int id = g_textureCount++;
    g_textures[id] = tex;
    return JS_NewInt32(ctx, id);
}

/* --- Binding: loadFont(path, ptsize) → id --- */
static JSValue js_loadFont(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    const char *path = JS_ToCString(ctx, argv[0]);
    int ptsize = 24;
    JS_ToInt32(ctx, &ptsize, argv[1]);

    TTF_Font *font = TTF_OpenFont(path, (float)ptsize);
    JS_FreeCString(ctx, path);

    if (!font) return JS_NewInt32(ctx, -1);

    int id = g_fontCount++;
    g_fonts[id] = font;
    return JS_NewInt32(ctx, id);
}

/* --- Binding: clear() --- */
static JSValue js_clear(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    SDL_SetRenderDrawColor(g_renderer, 9, 15, 29, 255);
    SDL_RenderClear(g_renderer);
    return JS_UNDEFINED;
}

/* --- Binding: drawTexture(id, x, y) --- */
static JSValue js_drawTexture(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id;
    double dx, dy;
    JS_ToInt32(ctx, &id, argv[0]);
    JS_ToFloat64(ctx, &dx, argv[1]);
    JS_ToFloat64(ctx, &dy, argv[2]);

    SDL_FRect dst = { (float)dx, (float)dy, 64, 64 };
    SDL_RenderTexture(g_renderer, g_textures[id], NULL, &dst);
    return JS_UNDEFINED;
}

/* --- Binding: drawTextureRotated(id, x, y, w, h, angle, centerX, centerY, flipX, flipY) --- */
static JSValue js_drawTextureRotated(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id, flipX, flipY;
    double dx, dy, dw, dh, angle, centerX, centerY;
    JS_ToInt32(ctx, &id,    argv[0]);
    JS_ToFloat64(ctx, &dx,  argv[1]);
    JS_ToFloat64(ctx, &dy,  argv[2]);
    JS_ToFloat64(ctx, &dw,  argv[3]);
    JS_ToFloat64(ctx, &dh,  argv[4]);
    JS_ToFloat64(ctx, &angle, argv[5]);
    JS_ToFloat64(ctx, &centerX, argv[6]);
    JS_ToFloat64(ctx, &centerY, argv[7]);
    JS_ToInt32(ctx, &flipX, argv[8]);
    JS_ToInt32(ctx, &flipY, argv[9]);

    SDL_FRect dst = { (float)dx, (float)dy, (float)dw, (float)dh };
    SDL_FPoint center = { (float)centerX, (float)centerY };
    SDL_FlipMode flip = SDL_FLIP_NONE;
    if (flipX) flip |= SDL_FLIP_HORIZONTAL;
    if (flipY) flip |= SDL_FLIP_VERTICAL;

    SDL_RenderTextureRotated(g_renderer, g_textures[id], NULL, &dst, (double)angle, &center, flip);
    return JS_UNDEFINED;
}

/* --- Binding: drawLabelTTF(id, text, x, y, anchorX, anchorY, scaleX, scaleY, angle) --- */
static JSValue js_drawLabelTTF(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int fid;
    JS_ToInt32(ctx, &fid, argv[0]);

    const char *text = JS_ToCString(ctx, argv[1]);

    double dx, dy, anchorX, anchorY, scaleX, scaleY, angle;
    JS_ToFloat64(ctx, &dx, argv[2]);
    JS_ToFloat64(ctx, &dy, argv[3]);
    JS_ToFloat64(ctx, &anchorX, argv[4]);
    JS_ToFloat64(ctx, &anchorY, argv[5]);
    JS_ToFloat64(ctx, &scaleX, argv[6]);
    JS_ToFloat64(ctx, &scaleY, argv[7]);
    JS_ToFloat64(ctx, &angle, argv[8]);

    /* white text */
    SDL_Color color = { 220, 220, 220, 255 };

    size_t tlen = strlen(text);
    SDL_Surface *surf = TTF_RenderText_Blended(g_fonts[fid], text, tlen, color);
    if (!surf) { JS_FreeCString(ctx, text); return JS_UNDEFINED; }

    SDL_Texture *tex = SDL_CreateTextureFromSurface(g_renderer, surf);
    const float width = (float)surf->w * (float)scaleX;
    const float height = (float)surf->h * (float)scaleY;
    const float centerX = (float)anchorX * width;
    const float centerY = (float)anchorY * height;
    SDL_FRect dst = {
        (float)dx - centerX,
        (float)dy - centerY,
        width,
        height
    };
    SDL_FPoint center = { centerX, centerY };
    SDL_RenderTextureRotated(g_renderer, tex, NULL, &dst, angle, &center, SDL_FLIP_NONE);

    SDL_DestroyTexture(tex);
    SDL_DestroySurface(surf);
    JS_FreeCString(ctx, text);
    return JS_UNDEFINED;
}

/* --- Binding: present() --- */
static JSValue js_present(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    SDL_RenderPresent(g_renderer);
    return JS_UNDEFINED;
}

/* --- Binding: onInit(cb) --- */
static JSValue js_onInit(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_onInit);
    g_onInit = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

/* --- Binding: onUpdate(cb) --- */
static JSValue js_onUpdate(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_onUpdate);
    g_onUpdate = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

/* --- Binding: onRender(cb) --- */
static JSValue js_onRender(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_onRender);
    g_onRender = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

/* --- Binding: onTouchStart(cb) --- */
static JSValue js_onTouchStart(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_touchStart);
    g_touchStart = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

/* --- Binding: onTouchMove(cb) --- */
static JSValue js_onTouchMove(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_touchMove);
    g_touchMove = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

/* --- Binding: onTouchEnd(cb) --- */
static JSValue js_onTouchEnd(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_touchEnd);
    g_touchEnd = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

/* --- module export table --- */
static const JSCFunctionListEntry funcs[] =
{
    JS_CFUNC_DEF("createWindow",            3, js_createWindow),
    JS_CFUNC_DEF("loadTexture",             1, js_loadTexture),
    JS_CFUNC_DEF("loadFont",                2, js_loadFont),
    JS_CFUNC_DEF("clear",                   0, js_clear),
    JS_CFUNC_DEF("drawTexture",             3, js_drawTexture),
    JS_CFUNC_DEF("drawTextureRotated",     10, js_drawTextureRotated),
    JS_CFUNC_DEF("drawLabelTTF",            9, js_drawLabelTTF),
    JS_CFUNC_DEF("present",                 0, js_present),
    JS_CFUNC_DEF("onInit",                  1, js_onInit),
    JS_CFUNC_DEF("onUpdate",                1, js_onUpdate),
    JS_CFUNC_DEF("onRender",                1, js_onRender),
    JS_CFUNC_DEF("onTouchStart",            1, js_onTouchStart),
    JS_CFUNC_DEF("onTouchMove",             1, js_onTouchMove),
    JS_CFUNC_DEF("onTouchEnd",              1, js_onTouchEnd),
};

static int js_sdl3_init(JSContext *ctx, JSModuleDef *m)
{
    return JS_SetModuleExportList(
        ctx, m, funcs,
        sizeof(funcs) / sizeof(JSCFunctionListEntry));
}

JSModuleDef* js_init_module_sdl3(JSContext *ctx, const char *module_name)
{
    JSModuleDef *m = JS_NewCModule(ctx, module_name, js_sdl3_init);
    JS_AddModuleExportList(
        ctx, m, funcs,
        sizeof(funcs) / sizeof(JSCFunctionListEntry));
    return m;
}

/* --- console.log binding --- */
static JSValue js_consoleLog(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    for (int i = 0; i < argc; i++) {
        const char *str = JS_ToCString(ctx, argv[i]);
        if (i > 0) printf(" ");
        printf("%s", str ? str : "undefined");
        JS_FreeCString(ctx, str);
    }
    printf("\n");
    fflush(stdout);
    return JS_UNDEFINED;
}

int js_init_console(JSContext *ctx)
{
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue console = JS_NewObject(ctx);
    JSValue log = JS_NewCFunction(ctx, js_consoleLog, "log", 1);
    JS_SetPropertyStr(ctx, console, "log", log);
    JS_SetPropertyStr(ctx, global, "console", console);
    JS_FreeValue(ctx, global);
    return 0;
}

int js_init_sdl3(JSContext *ctx)
{
    js_init_module_sdl3(ctx, "sdl3");
    js_init_console(ctx);
    return 0;
}

/* --- public API for main.c --- */
void js_call_onInit(JSContext *ctx)   { js_call_void(ctx, g_onInit); }
void js_call_onUpdate(JSContext *ctx) { js_call_void(ctx, g_onUpdate); }
void js_call_onUpdate_dt(JSContext *ctx, float dt)
{
    if (JS_IsUndefined(g_onUpdate)) return;
    JSValue dt_val = JS_NewFloat64(ctx, (double)dt);
    JSValue ret = JS_Call(ctx, g_onUpdate, JS_UNDEFINED, 1, &dt_val);
    if (JS_IsException(ret)) js_print_exception(ctx);
    JS_FreeValue(ctx, dt_val);
    JS_FreeValue(ctx, ret);
}
void js_call_onRender(JSContext *ctx) { js_call_void(ctx, g_onRender); }

void js_call_touchStart(JSContext *ctx, float x, float y)
    { js_call_touch(ctx, g_touchStart, x, y); }
void js_call_touchMove(JSContext *ctx, float x, float y)
    { js_call_touch(ctx, g_touchMove, x, y); }
void js_call_touchEnd(JSContext *ctx, float x, float y)
    { js_call_touch(ctx, g_touchEnd, x, y); }

int js_get_win_w(void) { return g_win_w; }
int js_get_win_h(void) { return g_win_h; }
