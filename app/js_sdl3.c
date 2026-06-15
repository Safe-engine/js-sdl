#include "js_sdl3.h"
#include <SDL3_image/SDL_image.h>
#include <SDL3_ttf/SDL_ttf.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* --- global state --- */
static SDL_Window   *g_window   = NULL;
static SDL_Renderer *g_renderer = NULL;
static int           g_win_w    = 1280;
static int           g_win_h    = 720;

#define MAX_TEXTURES 256
typedef enum TextureKind {
    TEXTURE_FILE,
    TEXTURE_TEXT
} TextureKind;

typedef struct TextureAsset {
    SDL_Texture *texture;
    char *key;
    int refs;
    int width;
    int height;
    TextureKind kind;
    int font_id;
} TextureAsset;

static TextureAsset g_textures[MAX_TEXTURES];

#define MAX_FONTS 64
typedef struct FontAsset {
    TTF_Font *font;
    char *path;
    int ptsize;
    int refs;
} FontAsset;

static FontAsset g_fonts[MAX_FONTS];

#define MAX_AUDIO_ASSETS 128
typedef struct AudioAsset {
    Uint8 *data;
    Uint32 length;
    SDL_AudioSpec spec;
    char *path;
    int refs;
} AudioAsset;

static AudioAsset g_audio_assets[MAX_AUDIO_ASSETS];

#define MAX_AUDIO_VOICES 32
typedef struct AudioVoice {
    SDL_AudioStream *stream;
    int audio_id;
    bool loop;
    bool paused;
    Uint64 started_at;
    Uint64 paused_at;
    Uint64 paused_duration;
    Uint64 duration;
} AudioVoice;

static AudioVoice g_audio_voices[MAX_AUDIO_VOICES];

#define MAX_CLIP_DEPTH 32
static SDL_Rect g_clip_stack[MAX_CLIP_DEPTH];
static int g_clip_depth = 0;

/* --- JS callbacks --- */
static JSValue g_onInit   = JS_UNDEFINED;
static JSValue g_onUpdate = JS_UNDEFINED;
static JSValue g_onRender = JS_UNDEFINED;

static JSValue g_touchStart = JS_UNDEFINED;
static JSValue g_touchMove  = JS_UNDEFINED;
static JSValue g_touchEnd   = JS_UNDEFINED;

static JSValue g_onPause             = JS_UNDEFINED;
static JSValue g_onResume            = JS_UNDEFINED;
static JSValue g_onBackground        = JS_UNDEFINED;
static JSValue g_onForeground        = JS_UNDEFINED;
static JSValue g_onInterruption      = JS_UNDEFINED;
static JSValue g_onLowMemory         = JS_UNDEFINED;
static JSValue g_onOrientationChange = JS_UNDEFINED;
static JSValue g_onTerminate         = JS_UNDEFINED;

/* ---- helpers ---- */

static char *copy_string(const char *value)
{
    size_t length = strlen(value) + 1;
    char *copy = malloc(length);
    if (copy) memcpy(copy, value, length);
    return copy;
}

static char *resolve_resource_path(const char *path)
{
    if (!path || !*path || path[0] == '/' || strstr(path, "://")) {
        return copy_string(path);
    }

    const char *base_path = SDL_GetBasePath();
    if (!base_path) return copy_string(path);

    size_t length = strlen(base_path) + strlen(path) + 1;
    char *resolved = malloc(length);
    if (!resolved) return NULL;
    snprintf(resolved, length, "%s%s", base_path, path);
    return resolved;
}

static int find_free_texture_slot(void)
{
    for (int i = 0; i < MAX_TEXTURES; i++) {
        if (!g_textures[i].texture) return i;
    }
    return -1;
}

static int find_free_font_slot(void)
{
    for (int i = 0; i < MAX_FONTS; i++) {
        if (!g_fonts[i].font) return i;
    }
    return -1;
}

static int valid_texture_id(int id)
{
    return id >= 0 && id < MAX_TEXTURES && g_textures[id].texture;
}

static int valid_font_id(int id)
{
    return id >= 0 && id < MAX_FONTS && g_fonts[id].font;
}

static int valid_audio_id(int id)
{
    return id >= 0 && id < MAX_AUDIO_ASSETS && g_audio_assets[id].data;
}

static int valid_audio_voice_id(int id)
{
    return id >= 0 && id < MAX_AUDIO_VOICES && g_audio_voices[id].stream;
}

static int find_free_audio_slot(void)
{
    for (int i = 0; i < MAX_AUDIO_ASSETS; i++) {
        if (!g_audio_assets[i].data) return i;
    }
    return -1;
}

static int find_free_audio_voice_slot(void)
{
    for (int i = 0; i < MAX_AUDIO_VOICES; i++) {
        if (!g_audio_voices[i].stream) return i;
    }
    return -1;
}

static void release_font_id(int id);
static void release_audio_id(int id);

static void release_texture_id(int id)
{
    if (!valid_texture_id(id)) return;
    TextureAsset *asset = &g_textures[id];
    if (--asset->refs > 0) return;
    SDL_DestroyTexture(asset->texture);
    free(asset->key);
    if (asset->kind == TEXTURE_TEXT) release_font_id(asset->font_id);
    memset(asset, 0, sizeof(*asset));
}

static void release_font_id(int id)
{
    if (!valid_font_id(id)) return;
    FontAsset *asset = &g_fonts[id];
    if (--asset->refs > 0) return;
    TTF_CloseFont(asset->font);
    free(asset->path);
    memset(asset, 0, sizeof(*asset));
}

static void release_audio_id(int id)
{
    if (!valid_audio_id(id)) return;
    AudioAsset *asset = &g_audio_assets[id];
    if (--asset->refs > 0) return;
    SDL_free(asset->data);
    free(asset->path);
    memset(asset, 0, sizeof(*asset));
}

static void destroy_audio_voice(int id)
{
    if (!valid_audio_voice_id(id)) return;
    AudioVoice *voice = &g_audio_voices[id];
    int audio_id = voice->audio_id;
    SDL_DestroyAudioStream(voice->stream);
    memset(voice, 0, sizeof(*voice));
    release_audio_id(audio_id);
}

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

static void js_call_bool(JSContext *ctx, JSValue func, int value)
{
    if (JS_IsUndefined(func)) return;
    JSValue arg = JS_NewBool(ctx, value);
    JSValue ret = JS_Call(ctx, func, JS_UNDEFINED, 1, &arg);
    if (JS_IsException(ret)) js_print_exception(ctx);
    JS_FreeValue(ctx, arg);
    JS_FreeValue(ctx, ret);
}

static void js_call_orientation(
    JSContext *ctx, JSValue func, SDL_DisplayOrientation orientation,
    int width, int height)
{
    if (JS_IsUndefined(func)) return;
    JSValue argv[3] = {
        JS_NewInt32(ctx, (int)orientation),
        JS_NewInt32(ctx, width),
        JS_NewInt32(ctx, height),
    };
    JSValue ret = JS_Call(ctx, func, JS_UNDEFINED, 3, argv);
    if (JS_IsException(ret)) js_print_exception(ctx);
    for (int i = 0; i < 3; i++) JS_FreeValue(ctx, argv[i]);
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
    SDL_SetRenderLogicalPresentation(
        g_renderer,
        g_win_w,
        g_win_h,
        SDL_LOGICAL_PRESENTATION_LETTERBOX);

    JS_FreeCString(ctx, title);
    return JS_UNDEFINED;
}

/* --- Binding: getViewportMetrics() --- */
static JSValue js_getViewportMetrics(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    (void)argv;

    int screen_w = g_win_w;
    int screen_h = g_win_h;
    SDL_Rect safe = { 0, 0, screen_w, screen_h };
    SDL_GetWindowSize(g_window, &screen_w, &screen_h);
    float scale_x = (float)screen_w / (float)g_win_w;
    float scale_y = (float)screen_h / (float)g_win_h;
    float scale = SDL_min(scale_x, scale_y);
    SDL_FRect viewport = {
        ((float)screen_w - (float)g_win_w * scale) * 0.5f,
        ((float)screen_h - (float)g_win_h * scale) * 0.5f,
        (float)g_win_w * scale,
        (float)g_win_h * scale,
    };
    if (!SDL_GetWindowSafeArea(g_window, &safe)) {
        safe = (SDL_Rect){ 0, 0, screen_w, screen_h };
    }

    float safe_x = 0.0f;
    float safe_y = 0.0f;
    float safe_right = (float)g_win_w;
    float safe_bottom = (float)g_win_h;
    SDL_RenderCoordinatesFromWindow(
        g_renderer, (float)safe.x, (float)safe.y, &safe_x, &safe_y);
    SDL_RenderCoordinatesFromWindow(
        g_renderer,
        (float)(safe.x + safe.w),
        (float)(safe.y + safe.h),
        &safe_right,
        &safe_bottom);
    safe_x = SDL_clamp(safe_x, 0.0f, (float)g_win_w);
    safe_y = SDL_clamp(safe_y, 0.0f, (float)g_win_h);
    safe_right = SDL_clamp(safe_right, 0.0f, (float)g_win_w);
    safe_bottom = SDL_clamp(safe_bottom, 0.0f, (float)g_win_h);

    double values[] = {
        g_win_w, g_win_h, screen_w, screen_h,
        viewport.x, viewport.y, viewport.w, viewport.h,
        safe_x, safe_y, safe_right - safe_x, safe_bottom - safe_y,
    };
    JSValue result = JS_NewArray(ctx);
    for (uint32_t i = 0; i < 12; i++) {
        JS_SetPropertyUint32(ctx, result, i, JS_NewFloat64(ctx, values[i]));
    }
    return result;
}

/* --- Binding: loadTexture(path) → id --- */
static JSValue js_loadTexture(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_EXCEPTION;

    for (int i = 0; i < MAX_TEXTURES; i++) {
        TextureAsset *asset = &g_textures[i];
        if (asset->texture && asset->kind == TEXTURE_FILE &&
            strcmp(asset->key, path) == 0) {
            asset->refs++;
            JS_FreeCString(ctx, path);
            return JS_NewInt32(ctx, i);
        }
    }

    int id = find_free_texture_slot();
    if (id < 0) {
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    char *resolved_path = resolve_resource_path(path);
    SDL_Texture *tex = resolved_path
        ? IMG_LoadTexture(g_renderer, resolved_path)
        : NULL;
    if (!tex && resolved_path && strcmp(resolved_path, path) != 0) {
        tex = IMG_LoadTexture(g_renderer, path);
    }
    free(resolved_path);
    if (!tex) {
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }
    char *key = copy_string(path);
    if (!key) {
        SDL_DestroyTexture(tex);
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    TextureAsset *asset = &g_textures[id];
    asset->texture = tex;
    asset->key = key;
    asset->refs = 1;
    asset->kind = TEXTURE_FILE;
    float width = 0;
    float height = 0;
    SDL_GetTextureSize(tex, &width, &height);
    asset->width = (int)width;
    asset->height = (int)height;
    JS_FreeCString(ctx, path);
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
    if (!path) return JS_EXCEPTION;
    int ptsize = 24;
    JS_ToInt32(ctx, &ptsize, argv[1]);

    for (int i = 0; i < MAX_FONTS; i++) {
        FontAsset *asset = &g_fonts[i];
        if (asset->font && asset->ptsize == ptsize &&
            strcmp(asset->path, path) == 0) {
            asset->refs++;
            JS_FreeCString(ctx, path);
            return JS_NewInt32(ctx, i);
        }
    }

    int id = find_free_font_slot();
    if (id < 0) {
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    char *resolved_path = resolve_resource_path(path);
    TTF_Font *font = resolved_path
        ? TTF_OpenFont(resolved_path, (float)ptsize)
        : NULL;
    if (!font && resolved_path && strcmp(resolved_path, path) != 0) {
        font = TTF_OpenFont(path, (float)ptsize);
    }
    free(resolved_path);
    if (!font) {
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }
    char *stored_path = copy_string(path);
    if (!stored_path) {
        TTF_CloseFont(font);
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    FontAsset *asset = &g_fonts[id];
    asset->font = font;
    asset->path = stored_path;
    asset->ptsize = ptsize;
    asset->refs = 1;
    JS_FreeCString(ctx, path);
    return JS_NewInt32(ctx, id);
}

/* --- Binding: loadTextTexture(fontId, text) -> texture id --- */
static JSValue js_loadTextTexture(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int font_id;
    JS_ToInt32(ctx, &font_id, argv[0]);
    if (!valid_font_id(font_id)) return JS_NewInt32(ctx, -1);

    const char *text = JS_ToCString(ctx, argv[1]);
    if (!text) return JS_EXCEPTION;

    size_t key_length = strlen(text) + 32;
    char *key = malloc(key_length);
    if (!key) {
        JS_FreeCString(ctx, text);
        return JS_NewInt32(ctx, -1);
    }
    snprintf(key, key_length, "%d:%s", font_id, text);

    for (int i = 0; i < MAX_TEXTURES; i++) {
        TextureAsset *asset = &g_textures[i];
        if (asset->texture && asset->kind == TEXTURE_TEXT &&
            strcmp(asset->key, key) == 0) {
            asset->refs++;
            free(key);
            JS_FreeCString(ctx, text);
            return JS_NewInt32(ctx, i);
        }
    }

    int id = find_free_texture_slot();
    if (id < 0) {
        free(key);
        JS_FreeCString(ctx, text);
        return JS_NewInt32(ctx, -1);
    }

    SDL_Color color = { 220, 220, 220, 255 };
    SDL_Surface *surface = TTF_RenderText_Blended(
        g_fonts[font_id].font, text, strlen(text), color);
    JS_FreeCString(ctx, text);
    if (!surface) {
        free(key);
        return JS_NewInt32(ctx, -1);
    }

    SDL_Texture *texture = SDL_CreateTextureFromSurface(g_renderer, surface);
    if (!texture) {
        SDL_DestroySurface(surface);
        free(key);
        return JS_NewInt32(ctx, -1);
    }

    TextureAsset *asset = &g_textures[id];
    asset->texture = texture;
    asset->key = key;
    asset->refs = 1;
    asset->width = surface->w;
    asset->height = surface->h;
    asset->kind = TEXTURE_TEXT;
    asset->font_id = font_id;
    g_fonts[font_id].refs++;
    SDL_DestroySurface(surface);
    return JS_NewInt32(ctx, id);
}

static JSValue js_releaseTexture(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    release_texture_id(id);
    return JS_UNDEFINED;
}

static JSValue js_releaseFont(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    release_font_id(id);
    return JS_UNDEFINED;
}

static JSValue js_getTextureWidth(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    return JS_NewInt32(ctx, valid_texture_id(id) ? g_textures[id].width : 0);
}

static JSValue js_getTextureHeight(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    return JS_NewInt32(ctx, valid_texture_id(id) ? g_textures[id].height : 0);
}

static JSValue js_loadAudio(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_EXCEPTION;

    for (int i = 0; i < MAX_AUDIO_ASSETS; i++) {
        AudioAsset *asset = &g_audio_assets[i];
        if (asset->data && strcmp(asset->path, path) == 0) {
            asset->refs++;
            JS_FreeCString(ctx, path);
            return JS_NewInt32(ctx, i);
        }
    }

    int id = find_free_audio_slot();
    if (id < 0) {
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    char *resolved_path = resolve_resource_path(path);
    SDL_AudioSpec spec;
    Uint8 *data = NULL;
    Uint32 length = 0;
    bool loaded = resolved_path &&
        SDL_LoadWAV(resolved_path, &spec, &data, &length);
    if (!loaded && resolved_path && strcmp(resolved_path, path) != 0) {
        loaded = SDL_LoadWAV(path, &spec, &data, &length);
    }
    free(resolved_path);
    if (!loaded) {
        SDL_LogError(
            SDL_LOG_CATEGORY_AUDIO,
            "Cannot load audio '%s': %s",
            path,
            SDL_GetError());
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    char *stored_path = copy_string(path);
    JS_FreeCString(ctx, path);
    if (!stored_path) {
        SDL_free(data);
        return JS_NewInt32(ctx, -1);
    }

    AudioAsset *asset = &g_audio_assets[id];
    asset->data = data;
    asset->length = length;
    asset->spec = spec;
    asset->path = stored_path;
    asset->refs = 1;
    return JS_NewInt32(ctx, id);
}

static JSValue js_releaseAudio(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    release_audio_id(id);
    return JS_UNDEFINED;
}

static JSValue js_playAudio(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    int audio_id;
    int loop = 0;
    double volume = 1.0;
    JS_ToInt32(ctx, &audio_id, argv[0]);
    JS_ToInt32(ctx, &loop, argv[1]);
    if (argc > 2) JS_ToFloat64(ctx, &volume, argv[2]);
    if (!valid_audio_id(audio_id)) return JS_NewInt32(ctx, -1);

    int voice_id = find_free_audio_voice_slot();
    if (voice_id < 0) return JS_NewInt32(ctx, -1);

    AudioAsset *asset = &g_audio_assets[audio_id];
    SDL_AudioStream *stream = SDL_OpenAudioDeviceStream(
        SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK,
        &asset->spec,
        NULL,
        NULL);
    if (!stream ||
        !SDL_SetAudioStreamGain(stream, (float)SDL_clamp(volume, 0.0, 1.0)) ||
        !SDL_PutAudioStreamData(stream, asset->data, (int)asset->length) ||
        (loop && !SDL_PutAudioStreamData(
            stream, asset->data, (int)asset->length)) ||
        !SDL_ResumeAudioStreamDevice(stream)) {
        if (stream) SDL_DestroyAudioStream(stream);
        return JS_NewInt32(ctx, -1);
    }

    int bytes_per_frame =
        SDL_AUDIO_BYTESIZE(asset->spec.format) * asset->spec.channels;
    Uint64 frames = bytes_per_frame > 0
        ? asset->length / (Uint32)bytes_per_frame
        : 0;
    AudioVoice *voice = &g_audio_voices[voice_id];
    voice->stream = stream;
    voice->audio_id = audio_id;
    voice->loop = loop != 0;
    voice->started_at = SDL_GetTicks();
    voice->duration = asset->spec.freq > 0
        ? (frames * 1000) / (Uint64)asset->spec.freq
        : 0;
    asset->refs++;
    return JS_NewInt32(ctx, voice_id);
}

static JSValue js_stopAudio(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    destroy_audio_voice(id);
    return JS_UNDEFINED;
}

static JSValue js_pauseAudio(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (valid_audio_voice_id(id) && !g_audio_voices[id].paused) {
        SDL_PauseAudioStreamDevice(g_audio_voices[id].stream);
        g_audio_voices[id].paused = true;
        g_audio_voices[id].paused_at = SDL_GetTicks();
    }
    return JS_UNDEFINED;
}

static JSValue js_resumeAudio(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (valid_audio_voice_id(id) && g_audio_voices[id].paused) {
        AudioVoice *voice = &g_audio_voices[id];
        voice->paused_duration += SDL_GetTicks() - voice->paused_at;
        voice->paused = false;
        SDL_ResumeAudioStreamDevice(voice->stream);
    }
    return JS_UNDEFINED;
}

static JSValue js_setAudioVolume(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    int id;
    double volume;
    JS_ToInt32(ctx, &id, argv[0]);
    JS_ToFloat64(ctx, &volume, argv[1]);
    if (valid_audio_voice_id(id)) {
        SDL_SetAudioStreamGain(
            g_audio_voices[id].stream,
            (float)SDL_clamp(volume, 0.0, 1.0));
    }
    return JS_UNDEFINED;
}

static bool audio_voice_finished(int id)
{
    AudioVoice *voice = &g_audio_voices[id];
    if (!voice->stream || voice->loop || voice->paused) return false;
    return SDL_GetTicks() >=
        voice->started_at + voice->paused_duration + voice->duration;
}

static JSValue js_isAudioPlaying(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    int id;
    JS_ToInt32(ctx, &id, argv[0]);
    if (!valid_audio_voice_id(id)) return JS_NewBool(ctx, false);
    if (audio_voice_finished(id)) {
        destroy_audio_voice(id);
        return JS_NewBool(ctx, false);
    }
    return JS_NewBool(ctx, true);
}

static JSValue js_updateAudio(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)ctx;
    (void)this_val;
    (void)argc;
    (void)argv;
    for (int i = 0; i < MAX_AUDIO_VOICES; i++) {
        AudioVoice *voice = &g_audio_voices[i];
        if (!voice->stream || voice->paused) continue;
        if (voice->loop) {
            AudioAsset *asset = &g_audio_assets[voice->audio_id];
            int queued = SDL_GetAudioStreamQueued(voice->stream);
            if (queued >= 0 && queued <= (int)asset->length) {
                SDL_PutAudioStreamData(
                    voice->stream, asset->data, (int)asset->length);
            }
        } else if (audio_voice_finished(i)) {
            destroy_audio_voice(i);
        }
    }
    return JS_UNDEFINED;
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

    if (!valid_texture_id(id)) return JS_UNDEFINED;
    SDL_FRect dst = { (float)dx, (float)dy, 64, 64 };
    SDL_RenderTexture(g_renderer, g_textures[id].texture, NULL, &dst);
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
    double red = 255, green = 255, blue = 255, alpha = 255;
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
    if (argc > 10) JS_ToFloat64(ctx, &red, argv[10]);
    if (argc > 11) JS_ToFloat64(ctx, &green, argv[11]);
    if (argc > 12) JS_ToFloat64(ctx, &blue, argv[12]);
    if (argc > 13) JS_ToFloat64(ctx, &alpha, argv[13]);

    if (!valid_texture_id(id)) return JS_UNDEFINED;
    SDL_Texture *texture = g_textures[id].texture;
    SDL_SetTextureColorMod(
        texture,
        (Uint8)SDL_clamp(red, 0, 255),
        (Uint8)SDL_clamp(green, 0, 255),
        (Uint8)SDL_clamp(blue, 0, 255));
    SDL_SetTextureAlphaMod(texture, (Uint8)SDL_clamp(alpha, 0, 255));
    SDL_FRect dst = { (float)dx, (float)dy, (float)dw, (float)dh };
    SDL_FPoint center = { (float)centerX, (float)centerY };
    SDL_FlipMode flip = SDL_FLIP_NONE;
    if (flipX) flip |= SDL_FLIP_HORIZONTAL;
    if (flipY) flip |= SDL_FLIP_VERTICAL;

    SDL_RenderTextureRotated(g_renderer, texture, NULL, &dst, (double)angle, &center, flip);
    return JS_UNDEFINED;
}

/* --- Binding: drawTextureRegionRotated(id, sx, sy, sw, sh, x, y, w, h, angle, centerX, centerY, flipX, flipY) --- */
static JSValue js_drawTextureRegionRotated(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id, flipX, flipY;
    double sx, sy, sw, sh, dx, dy, dw, dh, angle, centerX, centerY;
    double red = 255, green = 255, blue = 255, alpha = 255;
    JS_ToInt32(ctx, &id, argv[0]);
    JS_ToFloat64(ctx, &sx, argv[1]);
    JS_ToFloat64(ctx, &sy, argv[2]);
    JS_ToFloat64(ctx, &sw, argv[3]);
    JS_ToFloat64(ctx, &sh, argv[4]);
    JS_ToFloat64(ctx, &dx, argv[5]);
    JS_ToFloat64(ctx, &dy, argv[6]);
    JS_ToFloat64(ctx, &dw, argv[7]);
    JS_ToFloat64(ctx, &dh, argv[8]);
    JS_ToFloat64(ctx, &angle, argv[9]);
    JS_ToFloat64(ctx, &centerX, argv[10]);
    JS_ToFloat64(ctx, &centerY, argv[11]);
    JS_ToInt32(ctx, &flipX, argv[12]);
    JS_ToInt32(ctx, &flipY, argv[13]);
    if (argc > 14) JS_ToFloat64(ctx, &red, argv[14]);
    if (argc > 15) JS_ToFloat64(ctx, &green, argv[15]);
    if (argc > 16) JS_ToFloat64(ctx, &blue, argv[16]);
    if (argc > 17) JS_ToFloat64(ctx, &alpha, argv[17]);

    if (!valid_texture_id(id)) return JS_UNDEFINED;
    SDL_Texture *texture = g_textures[id].texture;
    SDL_SetTextureColorMod(
        texture,
        (Uint8)SDL_clamp(red, 0, 255),
        (Uint8)SDL_clamp(green, 0, 255),
        (Uint8)SDL_clamp(blue, 0, 255));
    SDL_SetTextureAlphaMod(texture, (Uint8)SDL_clamp(alpha, 0, 255));
    SDL_FRect src = { (float)sx, (float)sy, (float)sw, (float)sh };
    SDL_FRect dst = { (float)dx, (float)dy, (float)dw, (float)dh };
    SDL_FPoint center = { centerX, centerY };
    SDL_FlipMode flip = SDL_FLIP_NONE;
    if (flipX) flip |= SDL_FLIP_HORIZONTAL;
    if (flipY) flip |= SDL_FLIP_VERTICAL;
    SDL_RenderTextureRotated(
        g_renderer, texture, &src, &dst, angle, &center, flip);
    return JS_UNDEFINED;
}

static JSValue js_drawRect(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    double x, y, width, height, red, green, blue, alpha = 255;
    JS_ToFloat64(ctx, &x, argv[0]);
    JS_ToFloat64(ctx, &y, argv[1]);
    JS_ToFloat64(ctx, &width, argv[2]);
    JS_ToFloat64(ctx, &height, argv[3]);
    JS_ToFloat64(ctx, &red, argv[4]);
    JS_ToFloat64(ctx, &green, argv[5]);
    JS_ToFloat64(ctx, &blue, argv[6]);
    if (argc > 7) JS_ToFloat64(ctx, &alpha, argv[7]);

    SDL_SetRenderDrawBlendMode(g_renderer, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(
        g_renderer,
        (Uint8)SDL_clamp(red, 0, 255),
        (Uint8)SDL_clamp(green, 0, 255),
        (Uint8)SDL_clamp(blue, 0, 255),
        (Uint8)SDL_clamp(alpha, 0, 255));
    SDL_FRect rect = {
        (float)x, (float)y, (float)width, (float)height
    };
    SDL_RenderFillRect(g_renderer, &rect);
    return JS_UNDEFINED;
}

static JSValue js_pushClipRect(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    double x, y, width, height;
    JS_ToFloat64(ctx, &x, argv[0]);
    JS_ToFloat64(ctx, &y, argv[1]);
    JS_ToFloat64(ctx, &width, argv[2]);
    JS_ToFloat64(ctx, &height, argv[3]);
    if (g_clip_depth >= MAX_CLIP_DEPTH) return JS_UNDEFINED;

    SDL_Rect clip = {
        (int)x, (int)y, (int)SDL_max(0.0, width), (int)SDL_max(0.0, height)
    };
    if (g_clip_depth > 0) {
        SDL_Rect intersection;
        if (SDL_GetRectIntersection(
                &g_clip_stack[g_clip_depth - 1], &clip, &intersection)) {
            clip = intersection;
        } else {
            clip = (SDL_Rect){ 0, 0, 0, 0 };
        }
    }
    g_clip_stack[g_clip_depth++] = clip;
    SDL_SetRenderClipRect(g_renderer, &clip);
    return JS_UNDEFINED;
}

static JSValue js_popClipRect(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (g_clip_depth > 0) g_clip_depth--;
    SDL_SetRenderClipRect(
        g_renderer,
        g_clip_depth > 0 ? &g_clip_stack[g_clip_depth - 1] : NULL);
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

static JSValue js_set_callback(
    JSContext *ctx, JSValueConst callback, JSValue *slot)
{
    if (!JS_IsFunction(ctx, callback)) return JS_EXCEPTION;
    JS_FreeValue(ctx, *slot);
    *slot = JS_DupValue(ctx, callback);
    return JS_UNDEFINED;
}

#define DEFINE_CALLBACK_BINDING(name, slot) \
    static JSValue name( \
        JSContext *ctx, JSValueConst this_val, int argc, \
        JSValueConst *argv) \
    { \
        (void)this_val; \
        (void)argc; \
        return js_set_callback(ctx, argv[0], &slot); \
    }

DEFINE_CALLBACK_BINDING(js_onPause, g_onPause)
DEFINE_CALLBACK_BINDING(js_onResume, g_onResume)
DEFINE_CALLBACK_BINDING(js_onBackground, g_onBackground)
DEFINE_CALLBACK_BINDING(js_onForeground, g_onForeground)
DEFINE_CALLBACK_BINDING(js_onInterruption, g_onInterruption)
DEFINE_CALLBACK_BINDING(js_onLowMemory, g_onLowMemory)
DEFINE_CALLBACK_BINDING(js_onOrientationChange, g_onOrientationChange)
DEFINE_CALLBACK_BINDING(js_onTerminate, g_onTerminate)

#undef DEFINE_CALLBACK_BINDING

/* --- module export table --- */
static const JSCFunctionListEntry funcs[] =
{
    JS_CFUNC_DEF("createWindow",            3, js_createWindow),
    JS_CFUNC_DEF("getViewportMetrics",      0, js_getViewportMetrics),
    JS_CFUNC_DEF("loadTexture",             1, js_loadTexture),
    JS_CFUNC_DEF("loadFont",                2, js_loadFont),
    JS_CFUNC_DEF("loadTextTexture",         2, js_loadTextTexture),
    JS_CFUNC_DEF("releaseTexture",          1, js_releaseTexture),
    JS_CFUNC_DEF("releaseFont",             1, js_releaseFont),
    JS_CFUNC_DEF("getTextureWidth",         1, js_getTextureWidth),
    JS_CFUNC_DEF("getTextureHeight",        1, js_getTextureHeight),
    JS_CFUNC_DEF("loadAudio",               1, js_loadAudio),
    JS_CFUNC_DEF("releaseAudio",            1, js_releaseAudio),
    JS_CFUNC_DEF("playAudio",               3, js_playAudio),
    JS_CFUNC_DEF("stopAudio",               1, js_stopAudio),
    JS_CFUNC_DEF("pauseAudio",              1, js_pauseAudio),
    JS_CFUNC_DEF("resumeAudio",             1, js_resumeAudio),
    JS_CFUNC_DEF("setAudioVolume",          2, js_setAudioVolume),
    JS_CFUNC_DEF("isAudioPlaying",          1, js_isAudioPlaying),
    JS_CFUNC_DEF("updateAudio",              0, js_updateAudio),
    JS_CFUNC_DEF("clear",                   0, js_clear),
    JS_CFUNC_DEF("drawTexture",             3, js_drawTexture),
    JS_CFUNC_DEF("drawTextureRotated",     14, js_drawTextureRotated),
    JS_CFUNC_DEF("drawTextureRegionRotated", 18, js_drawTextureRegionRotated),
    JS_CFUNC_DEF("drawRect",                8, js_drawRect),
    JS_CFUNC_DEF("pushClipRect",            4, js_pushClipRect),
    JS_CFUNC_DEF("popClipRect",             0, js_popClipRect),
    JS_CFUNC_DEF("present",                 0, js_present),
    JS_CFUNC_DEF("onInit",                  1, js_onInit),
    JS_CFUNC_DEF("onUpdate",                1, js_onUpdate),
    JS_CFUNC_DEF("onRender",                1, js_onRender),
    JS_CFUNC_DEF("onTouchStart",            1, js_onTouchStart),
    JS_CFUNC_DEF("onTouchMove",             1, js_onTouchMove),
    JS_CFUNC_DEF("onTouchEnd",              1, js_onTouchEnd),
    JS_CFUNC_DEF("onPause",                 1, js_onPause),
    JS_CFUNC_DEF("onResume",                1, js_onResume),
    JS_CFUNC_DEF("onBackground",            1, js_onBackground),
    JS_CFUNC_DEF("onForeground",            1, js_onForeground),
    JS_CFUNC_DEF("onInterruption",          1, js_onInterruption),
    JS_CFUNC_DEF("onLowMemory",             1, js_onLowMemory),
    JS_CFUNC_DEF("onOrientationChange",      1, js_onOrientationChange),
    JS_CFUNC_DEF("onTerminate",              1, js_onTerminate),
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

void js_sdl3_shutdown(JSContext *ctx)
{
    JS_FreeValue(ctx, g_onInit);
    JS_FreeValue(ctx, g_onUpdate);
    JS_FreeValue(ctx, g_onRender);
    JS_FreeValue(ctx, g_touchStart);
    JS_FreeValue(ctx, g_touchMove);
    JS_FreeValue(ctx, g_touchEnd);
    JS_FreeValue(ctx, g_onPause);
    JS_FreeValue(ctx, g_onResume);
    JS_FreeValue(ctx, g_onBackground);
    JS_FreeValue(ctx, g_onForeground);
    JS_FreeValue(ctx, g_onInterruption);
    JS_FreeValue(ctx, g_onLowMemory);
    JS_FreeValue(ctx, g_onOrientationChange);
    JS_FreeValue(ctx, g_onTerminate);
    g_onInit = g_onUpdate = g_onRender = JS_UNDEFINED;
    g_touchStart = g_touchMove = g_touchEnd = JS_UNDEFINED;
    g_onPause = g_onResume = JS_UNDEFINED;
    g_onBackground = g_onForeground = JS_UNDEFINED;
    g_onInterruption = g_onLowMemory = JS_UNDEFINED;
    g_onOrientationChange = g_onTerminate = JS_UNDEFINED;

    for (int i = 0; i < MAX_TEXTURES; i++) {
        if (g_textures[i].texture) {
            SDL_DestroyTexture(g_textures[i].texture);
            free(g_textures[i].key);
            memset(&g_textures[i], 0, sizeof(g_textures[i]));
        }
    }
    for (int i = 0; i < MAX_FONTS; i++) {
        if (g_fonts[i].font) {
            TTF_CloseFont(g_fonts[i].font);
            free(g_fonts[i].path);
            memset(&g_fonts[i], 0, sizeof(g_fonts[i]));
        }
    }
    for (int i = 0; i < MAX_AUDIO_VOICES; i++) {
        if (g_audio_voices[i].stream) {
            SDL_DestroyAudioStream(g_audio_voices[i].stream);
            memset(&g_audio_voices[i], 0, sizeof(g_audio_voices[i]));
        }
    }
    for (int i = 0; i < MAX_AUDIO_ASSETS; i++) {
        if (g_audio_assets[i].data) {
            SDL_free(g_audio_assets[i].data);
            free(g_audio_assets[i].path);
            memset(&g_audio_assets[i], 0, sizeof(g_audio_assets[i]));
        }
    }

    if (g_renderer) {
        SDL_DestroyRenderer(g_renderer);
        g_renderer = NULL;
    }
    if (g_window) {
        SDL_DestroyWindow(g_window);
        g_window = NULL;
    }
}

void js_execute_pending_job(JSRuntime *rt)
{
    JSContext *job_ctx = NULL;
    int status = JS_ExecutePendingJob(rt, &job_ctx);
    if (status < 0 && job_ctx) js_print_exception(job_ctx);
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
void js_call_pause(JSContext *ctx) { js_call_void(ctx, g_onPause); }
void js_call_resume(JSContext *ctx) { js_call_void(ctx, g_onResume); }
void js_call_background(JSContext *ctx) { js_call_void(ctx, g_onBackground); }
void js_call_foreground(JSContext *ctx) { js_call_void(ctx, g_onForeground); }
void js_call_interruption(JSContext *ctx, int active)
    { js_call_bool(ctx, g_onInterruption, active); }
void js_call_low_memory(JSContext *ctx) { js_call_void(ctx, g_onLowMemory); }
void js_call_orientation_change(
    JSContext *ctx, SDL_DisplayOrientation orientation, int width, int height)
    { js_call_orientation(
        ctx, g_onOrientationChange, orientation, width, height); }
void js_call_terminate(JSContext *ctx) { js_call_void(ctx, g_onTerminate); }

void js_get_window_size(int *width, int *height)
{
    if (!g_window || !SDL_GetWindowSize(g_window, width, height)) {
        *width = g_win_w;
        *height = g_win_h;
    }
}

int js_get_win_w(void) { return g_win_w; }
int js_get_win_h(void) { return g_win_h; }

void js_convert_event_to_render_coordinates(SDL_Event *event)
{
    if (g_renderer) {
        SDL_ConvertEventToRenderCoordinates(g_renderer, event);
    }
}
