#include "js_sdl3.h"
#ifdef JS_SDL_ENABLE_BOX2D_MODULE
#include "js_box2d.h"
#endif
#include <SDL3_image/SDL_image.h>
#include <ft2build.h>
#include FT_FREETYPE_H
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* --- global state --- */
static SDL_Window   *g_window   = NULL;
static SDL_Renderer *g_renderer = NULL;
static int           g_win_w    = 1280;
static int           g_win_h    = 720;
static SDL_RendererLogicalPresentation g_resolution_policy =
    SDL_LOGICAL_PRESENTATION_LETTERBOX;
static FT_Library    g_ft_library = NULL;

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
    FT_Face face;
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
static JSValue g_textInput  = JS_UNDEFINED;
static JSValue g_keyDown    = JS_UNDEFINED;
static JSValue g_keyUp      = JS_UNDEFINED;

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

static bool has_resource_prefix(const char *path)
{
    return strncmp(path, "res/", 4) == 0 || strncmp(path, "res\\", 4) == 0;
}

static char *resource_prefixed_path(const char *path)
{
    if (!path || !*path || path[0] == '/' || strstr(path, "://") ||
        has_resource_prefix(path)) {
        return NULL;
    }

    size_t length = strlen("res/") + strlen(path) + 1;
    char *resolved = malloc(length);
    if (!resolved) return NULL;
    snprintf(resolved, length, "res/%s", path);
    return resolved;
}

static char *resolve_resource_path(const char *path)
{
    if (!path || !*path || path[0] == '/' || strstr(path, "://")) {
        return copy_string(path);
    }

    const char *base_path = SDL_GetBasePath();
    if (!base_path) return copy_string(path);

    const char *resource_prefix = has_resource_prefix(path) ? "" : "res/";
    size_t length =
        strlen(base_path) +
        strlen(resource_prefix) +
        strlen(path) +
        1;
    char *resolved = malloc(length);
    if (!resolved) return NULL;
    snprintf(resolved, length, "%s%s%s", base_path, resource_prefix, path);
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
        if (!g_fonts[i].face) return i;
    }
    return -1;
}

static int valid_texture_id(int id)
{
    return id >= 0 && id < MAX_TEXTURES && g_textures[id].texture;
}

static int valid_font_id(int id)
{
    return id >= 0 && id < MAX_FONTS && g_fonts[id].face;
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
    FT_Done_Face(asset->face);
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

static void js_call_string(JSContext *ctx, JSValue func, const char *value)
{
    if (JS_IsUndefined(func) || !value) return;
    JSValue arg = JS_NewString(ctx, value);
    JSValue ret = JS_Call(ctx, func, JS_UNDEFINED, 1, &arg);
    if (JS_IsException(ret)) js_print_exception(ctx);
    JS_FreeValue(ctx, arg);
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
static SDL_RendererLogicalPresentation js_resolution_policy(
    JSContext *ctx,
    JSValueConst value)
{
    if (JS_IsUndefined(value)) return SDL_LOGICAL_PRESENTATION_LETTERBOX;
    const char *policy = JS_ToCString(ctx, value);
    if (!policy) return SDL_LOGICAL_PRESENTATION_LETTERBOX;

    SDL_RendererLogicalPresentation result = SDL_LOGICAL_PRESENTATION_LETTERBOX;
    if (strcmp(policy, "overscan") == 0) {
        result = SDL_LOGICAL_PRESENTATION_OVERSCAN;
    } else if (strcmp(policy, "stretch") == 0) {
        result = SDL_LOGICAL_PRESENTATION_STRETCH;
    } else if (strcmp(policy, "integer-scale") == 0) {
        result = SDL_LOGICAL_PRESENTATION_INTEGER_SCALE;
    }

    JS_FreeCString(ctx, policy);
    return result;
}

static SDL_FRect js_presentation_rect(int screen_w, int screen_h)
{
    float width = (float)screen_w;
    float height = (float)screen_h;
    if (g_resolution_policy != SDL_LOGICAL_PRESENTATION_STRETCH) {
        float scale_x = (float)screen_w / (float)g_win_w;
        float scale_y = (float)screen_h / (float)g_win_h;
        float scale = g_resolution_policy == SDL_LOGICAL_PRESENTATION_OVERSCAN
            ? SDL_max(scale_x, scale_y)
            : SDL_min(scale_x, scale_y);
        if (g_resolution_policy == SDL_LOGICAL_PRESENTATION_INTEGER_SCALE) {
            scale = SDL_max(1.0f, (float)((int)scale));
        }
        width = (float)g_win_w * scale;
        height = (float)g_win_h * scale;
    }

    return (SDL_FRect){
        ((float)screen_w - width) * 0.5f,
        ((float)screen_h - height) * 0.5f,
        width,
        height,
    };
}

static JSValue js_createWindow(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    const char *title = JS_ToCString(ctx, argv[0]);
    JS_ToInt32(ctx, &g_win_w, argv[1]);
    JS_ToInt32(ctx, &g_win_h, argv[2]);
    g_resolution_policy = js_resolution_policy(
        ctx,
        argc > 3 ? argv[3] : JS_UNDEFINED);

    g_window = SDL_CreateWindow(title, g_win_w, g_win_h, 0);
    g_renderer = SDL_CreateRenderer(g_window, NULL);
    SDL_SetRenderLogicalPresentation(
        g_renderer,
        g_win_w,
        g_win_h,
        g_resolution_policy);

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
    SDL_FRect viewport = js_presentation_rect(screen_w, screen_h);
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

/* --- Binding: getWinSize() --- */
static void get_window_size_in_pixels(int *width, int *height)
{
    if (g_window && SDL_GetWindowSizeInPixels(g_window, width, height)) {
        return;
    }
    if (g_window && SDL_GetWindowSize(g_window, width, height)) {
        return;
    }
    *width = g_win_w;
    *height = g_win_h;
}

static JSValue js_getWinSize(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    (void)argv;

    int width;
    int height;
    get_window_size_in_pixels(&width, &height);

    JSValue result = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, result, "width", JS_NewInt32(ctx, width));
    JS_SetPropertyStr(ctx, result, "height", JS_NewInt32(ctx, height));
    return result;
}

static void *load_file_contents(const char *path, size_t *length)
{
    char *resolved_path = resolve_resource_path(path);
    void *contents = resolved_path
        ? SDL_LoadFile(resolved_path, length)
        : NULL;
    if (!contents && resolved_path && strcmp(resolved_path, path) != 0) {
        contents = SDL_LoadFile(path, length);
    }
    char *prefixed_path = resource_prefixed_path(path);
    if (!contents && prefixed_path) {
        contents = SDL_LoadFile(prefixed_path, length);
    }
    free(prefixed_path);
    free(resolved_path);
    return contents;
}

/* --- Binding: loadTextFile(path) -> string|null --- */
static JSValue js_loadTextFile(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    if (argc < 1) return JS_NULL;

    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_EXCEPTION;

    size_t length = 0;
    void *contents = load_file_contents(path, &length);
    JS_FreeCString(ctx, path);

    if (!contents) return JS_NULL;
    JSValue result = JS_NewStringLen(ctx, contents, length);
    SDL_free(contents);
    return result;
}

/* --- Binding: loadBinaryFile(path) -> ArrayBuffer|null --- */
static JSValue js_loadBinaryFile(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    if (argc < 1) return JS_NULL;

    const char *path = JS_ToCString(ctx, argv[0]);
    if (!path) return JS_EXCEPTION;

    size_t length = 0;
    void *contents = load_file_contents(path, &length);
    JS_FreeCString(ctx, path);

    if (!contents) return JS_NULL;
    JSValue result = JS_NewArrayBufferCopy(ctx, contents, length);
    SDL_free(contents);
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
    char *prefixed_path = resource_prefixed_path(path);
    if (!tex && prefixed_path) {
        tex = IMG_LoadTexture(g_renderer, prefixed_path);
    }
    free(prefixed_path);
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

static bool ensure_freetype(void)
{
    return g_ft_library || FT_Init_FreeType(&g_ft_library) == 0;
}

static const char *next_utf8_codepoint(const char *text, FT_ULong *codepoint)
{
    const unsigned char *cursor = (const unsigned char *)text;
    unsigned char first = cursor[0];

    if (first < 0x80) {
        *codepoint = first;
        return (const char *)(cursor + 1);
    }
    if ((first & 0xE0) == 0xC0 && (cursor[1] & 0xC0) == 0x80) {
        *codepoint = ((FT_ULong)(first & 0x1F) << 6) |
                     (FT_ULong)(cursor[1] & 0x3F);
        return (const char *)(cursor + 2);
    }
    if ((first & 0xF0) == 0xE0 &&
        (cursor[1] & 0xC0) == 0x80 &&
        (cursor[2] & 0xC0) == 0x80) {
        *codepoint = ((FT_ULong)(first & 0x0F) << 12) |
                     ((FT_ULong)(cursor[1] & 0x3F) << 6) |
                     (FT_ULong)(cursor[2] & 0x3F);
        return (const char *)(cursor + 3);
    }
    if ((first & 0xF8) == 0xF0 &&
        (cursor[1] & 0xC0) == 0x80 &&
        (cursor[2] & 0xC0) == 0x80 &&
        (cursor[3] & 0xC0) == 0x80) {
        *codepoint = ((FT_ULong)(first & 0x07) << 18) |
                     ((FT_ULong)(cursor[1] & 0x3F) << 12) |
                     ((FT_ULong)(cursor[2] & 0x3F) << 6) |
                     (FT_ULong)(cursor[3] & 0x3F);
        return (const char *)(cursor + 4);
    }

    *codepoint = 0xFFFD;
    return (const char *)(cursor + 1);
}

static Uint8 glyph_bitmap_alpha(const FT_Bitmap *bitmap, int x, int y)
{
    const unsigned char *row = bitmap->buffer +
        (bitmap->pitch >= 0 ? y : (int)bitmap->rows - 1 - y) *
        abs(bitmap->pitch);

    if (bitmap->pixel_mode == FT_PIXEL_MODE_MONO) {
        return (row[x / 8] & (0x80 >> (x % 8))) ? 255 : 0;
    }
    if (bitmap->pixel_mode == FT_PIXEL_MODE_GRAY) {
        return row[x];
    }
    return 0;
}

static void measure_text_bounds(
    FT_Face face,
    const char *text,
    int *out_min_x,
    int *out_min_y,
    int *out_max_x,
    int *out_max_y)
{
    int min_x = 0;
    int min_y = 0;
    int max_x = 1;
    int max_y = 1;
    int pen_x = 0;
    int baseline = face->size ? (int)(face->size->metrics.ascender >> 6) : 0;
    bool saw_glyph = false;
    FT_UInt previous_glyph = 0;

    for (const char *cursor = text; *cursor;) {
        FT_ULong codepoint;
        cursor = next_utf8_codepoint(cursor, &codepoint);
        FT_UInt glyph_index = FT_Get_Char_Index(face, codepoint);

        if (previous_glyph && glyph_index && FT_HAS_KERNING(face)) {
            FT_Vector delta;
            if (FT_Get_Kerning(
                    face,
                    previous_glyph,
                    glyph_index,
                    FT_KERNING_DEFAULT,
                    &delta) == 0) {
                pen_x += (int)(delta.x >> 6);
            }
        }

        if (FT_Load_Glyph(face, glyph_index, FT_LOAD_RENDER) == 0) {
            FT_GlyphSlot glyph = face->glyph;
            int x0 = pen_x + glyph->bitmap_left;
            int y0 = baseline - glyph->bitmap_top;
            int x1 = x0 + (int)glyph->bitmap.width;
            int y1 = y0 + (int)glyph->bitmap.rows;

            if (!saw_glyph || x0 < min_x) min_x = x0;
            if (!saw_glyph || y0 < min_y) min_y = y0;
            if (!saw_glyph || x1 > max_x) max_x = x1;
            if (!saw_glyph || y1 > max_y) max_y = y1;
            pen_x += (int)(glyph->advance.x >> 6);
            if (pen_x > max_x) max_x = pen_x;
            saw_glyph = true;
        }

        previous_glyph = glyph_index;
    }

    if (!saw_glyph) {
        int line_height = face->size ? (int)(face->size->metrics.height >> 6) : 1;
        max_y = line_height > 0 ? line_height : 1;
    }

    *out_min_x = min_x;
    *out_min_y = min_y;
    *out_max_x = max_x > min_x ? max_x : min_x + 1;
    *out_max_y = max_y > min_y ? max_y : min_y + 1;
}

static SDL_Surface *render_text_surface(
    FT_Face face,
    const char *text,
    SDL_Color color)
{
    int min_x;
    int min_y;
    int max_x;
    int max_y;
    measure_text_bounds(face, text, &min_x, &min_y, &max_x, &max_y);

    SDL_Surface *surface = SDL_CreateSurface(
        max_x - min_x,
        max_y - min_y,
        SDL_PIXELFORMAT_RGBA32);
    if (!surface) return NULL;
    SDL_memset(surface->pixels, 0, (size_t)surface->pitch * surface->h);

    int pen_x = -min_x;
    int baseline = (face->size ? (int)(face->size->metrics.ascender >> 6) : 0) -
        min_y;
    FT_UInt previous_glyph = 0;

    for (const char *cursor = text; *cursor;) {
        FT_ULong codepoint;
        cursor = next_utf8_codepoint(cursor, &codepoint);
        FT_UInt glyph_index = FT_Get_Char_Index(face, codepoint);

        if (previous_glyph && glyph_index && FT_HAS_KERNING(face)) {
            FT_Vector delta;
            if (FT_Get_Kerning(
                    face,
                    previous_glyph,
                    glyph_index,
                    FT_KERNING_DEFAULT,
                    &delta) == 0) {
                pen_x += (int)(delta.x >> 6);
            }
        }

        if (FT_Load_Glyph(face, glyph_index, FT_LOAD_RENDER) == 0) {
            FT_GlyphSlot glyph = face->glyph;
            FT_Bitmap *bitmap = &glyph->bitmap;
            int origin_x = pen_x + glyph->bitmap_left;
            int origin_y = baseline - glyph->bitmap_top;

            for (int y = 0; y < (int)bitmap->rows; y++) {
                int dst_y = origin_y + y;
                if (dst_y < 0 || dst_y >= surface->h) continue;

                for (int x = 0; x < (int)bitmap->width; x++) {
                    int dst_x = origin_x + x;
                    if (dst_x < 0 || dst_x >= surface->w) continue;

                    Uint8 coverage = glyph_bitmap_alpha(bitmap, x, y);
                    if (coverage == 0) continue;

                    Uint8 alpha = (Uint8)((coverage * color.a + 127) / 255);
                    Uint32 *pixel = (Uint32 *)((Uint8 *)surface->pixels +
                        dst_y * surface->pitch +
                        dst_x * (int)sizeof(Uint32));
                    *pixel = SDL_MapSurfaceRGBA(
                        surface,
                        color.r,
                        color.g,
                        color.b,
                        alpha);
                }
            }

            pen_x += (int)(glyph->advance.x >> 6);
        }

        previous_glyph = glyph_index;
    }

    return surface;
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
        if (asset->face && asset->ptsize == ptsize &&
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

    if (!ensure_freetype()) {
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    char *resolved_path = resolve_resource_path(path);
    FT_Face face = NULL;
    if (resolved_path) {
        FT_New_Face(g_ft_library, resolved_path, 0, &face);
    }
    if (!face && resolved_path && strcmp(resolved_path, path) != 0) {
        FT_New_Face(g_ft_library, path, 0, &face);
    }
    char *prefixed_path = resource_prefixed_path(path);
    if (!face && prefixed_path) {
        FT_New_Face(g_ft_library, prefixed_path, 0, &face);
    }
    free(prefixed_path);
    free(resolved_path);
    if (!face) {
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }
    if (FT_Set_Pixel_Sizes(face, 0, (FT_UInt)ptsize) != 0) {
        FT_Done_Face(face);
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }
    char *stored_path = copy_string(path);
    if (!stored_path) {
        FT_Done_Face(face);
        JS_FreeCString(ctx, path);
        return JS_NewInt32(ctx, -1);
    }

    FontAsset *asset = &g_fonts[id];
    asset->face = face;
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

    SDL_Color color = { 255, 255, 255, 255 };
    SDL_Surface *surface = render_text_surface(g_fonts[font_id].face, text, color);
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
    char *prefixed_path = resource_prefixed_path(path);
    if (!loaded && prefixed_path) {
        loaded = SDL_LoadWAV(prefixed_path, &spec, &data, &length);
    }
    free(prefixed_path);
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

/* --- Binding: drawTextureQuad(id, x0, y0, u0, v0, ... x3, y3, u3, v3, red, green, blue, alpha) --- */
static JSValue js_drawTextureQuad(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    int id;
    double values[16];
    double red = 255, green = 255, blue = 255, alpha = 255;
    JS_ToInt32(ctx, &id, argv[0]);
    for (int i = 0; i < 16; i++) {
        JS_ToFloat64(ctx, &values[i], argv[i + 1]);
    }
    if (argc > 17) JS_ToFloat64(ctx, &red, argv[17]);
    if (argc > 18) JS_ToFloat64(ctx, &green, argv[18]);
    if (argc > 19) JS_ToFloat64(ctx, &blue, argv[19]);
    if (argc > 20) JS_ToFloat64(ctx, &alpha, argv[20]);

    if (!valid_texture_id(id)) return JS_UNDEFINED;
    SDL_FColor color = {
        (float)(SDL_clamp(red, 0, 255) / 255.0),
        (float)(SDL_clamp(green, 0, 255) / 255.0),
        (float)(SDL_clamp(blue, 0, 255) / 255.0),
        (float)(SDL_clamp(alpha, 0, 255) / 255.0),
    };
    SDL_Vertex vertices[4];
    for (int i = 0; i < 4; i++) {
        int offset = i * 4;
        vertices[i].position.x = (float)values[offset];
        vertices[i].position.y = (float)values[offset + 1];
        vertices[i].color = color;
        vertices[i].tex_coord.x = (float)values[offset + 2];
        vertices[i].tex_coord.y = (float)values[offset + 3];
    }
    int indices[6] = { 0, 1, 2, 2, 1, 3 };
    SDL_RenderGeometry(g_renderer, g_textures[id].texture, vertices, 4, indices, 6);
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

static void js_set_draw_color(
    double red, double green, double blue, double alpha)
{
    SDL_SetRenderDrawBlendMode(g_renderer, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(
        g_renderer,
        (Uint8)SDL_clamp(red, 0, 255),
        (Uint8)SDL_clamp(green, 0, 255),
        (Uint8)SDL_clamp(blue, 0, 255),
        (Uint8)SDL_clamp(alpha, 0, 255));
}

static JSValue js_drawLine(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    double x1, y1, x2, y2, red, green, blue, alpha = 255;
    JS_ToFloat64(ctx, &x1, argv[0]);
    JS_ToFloat64(ctx, &y1, argv[1]);
    JS_ToFloat64(ctx, &x2, argv[2]);
    JS_ToFloat64(ctx, &y2, argv[3]);
    JS_ToFloat64(ctx, &red, argv[4]);
    JS_ToFloat64(ctx, &green, argv[5]);
    JS_ToFloat64(ctx, &blue, argv[6]);
    if (argc > 7) JS_ToFloat64(ctx, &alpha, argv[7]);

    js_set_draw_color(red, green, blue, alpha);
    SDL_RenderLine(g_renderer, (float)x1, (float)y1, (float)x2, (float)y2);
    return JS_UNDEFINED;
}

static JSValue js_drawPoint(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    double x, y, red, green, blue, alpha = 255;
    JS_ToFloat64(ctx, &x, argv[0]);
    JS_ToFloat64(ctx, &y, argv[1]);
    JS_ToFloat64(ctx, &red, argv[2]);
    JS_ToFloat64(ctx, &green, argv[3]);
    JS_ToFloat64(ctx, &blue, argv[4]);
    if (argc > 5) JS_ToFloat64(ctx, &alpha, argv[5]);

    js_set_draw_color(red, green, blue, alpha);
    SDL_RenderPoint(g_renderer, (float)x, (float)y);
    return JS_UNDEFINED;
}

static JSValue js_drawCircle(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    double x, y, radius, red, green, blue, alpha = 255;
    int fill = 0;
    JS_ToFloat64(ctx, &x, argv[0]);
    JS_ToFloat64(ctx, &y, argv[1]);
    JS_ToFloat64(ctx, &radius, argv[2]);
    JS_ToFloat64(ctx, &red, argv[3]);
    JS_ToFloat64(ctx, &green, argv[4]);
    JS_ToFloat64(ctx, &blue, argv[5]);
    if (argc > 6) JS_ToFloat64(ctx, &alpha, argv[6]);
    if (argc > 7) JS_ToInt32(ctx, &fill, argv[7]);

    js_set_draw_color(red, green, blue, alpha);
    int r = (int)SDL_max(0.0, radius);
    int cx = (int)x;
    int cy = (int)y;

    for (int dy = -r; dy <= r; dy++) {
        int dx_limit = (int)SDL_sqrt((float)(r * r - dy * dy));
        if (fill) {
            SDL_RenderLine(
                g_renderer,
                (float)(cx - dx_limit),
                (float)(cy + dy),
                (float)(cx + dx_limit),
                (float)(cy + dy));
        } else {
            SDL_RenderPoint(g_renderer, (float)(cx - dx_limit), (float)(cy + dy));
            SDL_RenderPoint(g_renderer, (float)(cx + dx_limit), (float)(cy + dy));
        }
    }
    return JS_UNDEFINED;
}

static JSValue js_drawPolyline(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)this_val;
    if (argc < 5) return JS_UNDEFINED;
    int closed = 0;
    double red, green, blue, alpha = 255;
    JS_ToFloat64(ctx, &red, argv[1]);
    JS_ToFloat64(ctx, &green, argv[2]);
    JS_ToFloat64(ctx, &blue, argv[3]);
    if (argc > 4) JS_ToFloat64(ctx, &alpha, argv[4]);
    if (argc > 5) JS_ToInt32(ctx, &closed, argv[5]);

    int64_t length_value = 0;
    JS_GetLength(ctx, argv[0], &length_value);
    if (length_value < 2) return JS_UNDEFINED;

    js_set_draw_color(red, green, blue, alpha);
    double first_x = 0, first_y = 0, previous_x = 0, previous_y = 0;
    for (int64_t i = 0; i < length_value; i++) {
        JSValue point = JS_GetPropertyUint32(ctx, argv[0], (uint32_t)i);
        JSValue x_value = JS_GetPropertyStr(ctx, point, "x");
        JSValue y_value = JS_GetPropertyStr(ctx, point, "y");
        double x = 0, y = 0;
        JS_ToFloat64(ctx, &x, x_value);
        JS_ToFloat64(ctx, &y, y_value);
        JS_FreeValue(ctx, x_value);
        JS_FreeValue(ctx, y_value);
        JS_FreeValue(ctx, point);

        if (i == 0) {
            first_x = previous_x = x;
            first_y = previous_y = y;
            continue;
        }
        SDL_RenderLine(
            g_renderer,
            (float)previous_x, (float)previous_y,
            (float)x, (float)y);
        previous_x = x;
        previous_y = y;
    }
    if (closed) {
        SDL_RenderLine(
            g_renderer,
            (float)previous_x, (float)previous_y,
            (float)first_x, (float)first_y);
    }
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

/* --- Binding: onTextInput(cb) --- */
static JSValue js_onTextInput(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_textInput);
    g_textInput = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

/* --- Binding: onKeyDown(cb) --- */
static JSValue js_onKeyDown(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_keyDown);
    g_keyDown = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

/* --- Binding: onKeyUp(cb) --- */
static JSValue js_onKeyUp(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (!JS_IsFunction(ctx, argv[0])) return JS_EXCEPTION;
    JS_FreeValue(ctx, g_keyUp);
    g_keyUp = JS_DupValue(ctx, argv[0]);
    return JS_UNDEFINED;
}

static JSValue js_startTextInput(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)ctx;
    (void)this_val;
    (void)argc;
    (void)argv;
    SDL_StartTextInput(g_window);
    return JS_UNDEFINED;
}

static JSValue js_stopTextInput(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    (void)ctx;
    (void)this_val;
    (void)argc;
    (void)argv;
    SDL_StopTextInput(g_window);
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
    JS_CFUNC_DEF("getWinSize",              0, js_getWinSize),
    JS_CFUNC_DEF("loadTextFile",            1, js_loadTextFile),
    JS_CFUNC_DEF("loadBinaryFile",          1, js_loadBinaryFile),
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
    JS_CFUNC_DEF("drawTextureQuad",        21, js_drawTextureQuad),
    JS_CFUNC_DEF("drawRect",                8, js_drawRect),
    JS_CFUNC_DEF("drawLine",                8, js_drawLine),
    JS_CFUNC_DEF("drawPoint",               6, js_drawPoint),
    JS_CFUNC_DEF("drawCircle",              8, js_drawCircle),
    JS_CFUNC_DEF("drawPolyline",            6, js_drawPolyline),
    JS_CFUNC_DEF("pushClipRect",            4, js_pushClipRect),
    JS_CFUNC_DEF("popClipRect",             0, js_popClipRect),
    JS_CFUNC_DEF("present",                 0, js_present),
    JS_CFUNC_DEF("onInit",                  1, js_onInit),
    JS_CFUNC_DEF("onUpdate",                1, js_onUpdate),
    JS_CFUNC_DEF("onRender",                1, js_onRender),
    JS_CFUNC_DEF("onTouchStart",            1, js_onTouchStart),
    JS_CFUNC_DEF("onTouchMove",             1, js_onTouchMove),
    JS_CFUNC_DEF("onTouchEnd",              1, js_onTouchEnd),
    JS_CFUNC_DEF("onTextInput",             1, js_onTextInput),
    JS_CFUNC_DEF("onKeyDown",               1, js_onKeyDown),
    JS_CFUNC_DEF("onKeyUp",                 1, js_onKeyUp),
    JS_CFUNC_DEF("startTextInput",          0, js_startTextInput),
    JS_CFUNC_DEF("stopTextInput",           0, js_stopTextInput),
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

static JSValue js_consoleAssert(
    JSContext *ctx,
    JSValueConst this_val,
    int argc,
    JSValueConst *argv)
{
    if (argc > 0 && JS_ToBool(ctx, argv[0])) {
        return JS_UNDEFINED;
    }

    printf("Assertion failed");
    for (int i = 1; i < argc; i++) {
        const char *str = JS_ToCString(ctx, argv[i]);
        printf("%s%s", i == 1 ? ": " : " ", str ? str : "undefined");
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
    JS_SetPropertyStr(ctx, console, "log",
        JS_NewCFunction(ctx, js_consoleLog, "log", 1));
    JS_SetPropertyStr(ctx, console, "info",
        JS_NewCFunction(ctx, js_consoleLog, "info", 1));
    JS_SetPropertyStr(ctx, console, "warn",
        JS_NewCFunction(ctx, js_consoleLog, "warn", 1));
    JS_SetPropertyStr(ctx, console, "error",
        JS_NewCFunction(ctx, js_consoleLog, "error", 1));
    JS_SetPropertyStr(ctx, console, "assert",
        JS_NewCFunction(ctx, js_consoleAssert, "assert", 1));
    JS_SetPropertyStr(ctx, global, "console", console);
    JS_FreeValue(ctx, global);
    return 0;
}

int js_init_sdl3(JSContext *ctx)
{
    js_init_module_sdl3(ctx, "sdl3");
#ifdef JS_SDL_ENABLE_BOX2D_MODULE
    js_init_box2d(ctx);
#endif
    js_init_console(ctx);
    return 0;
}

void js_sdl3_shutdown(JSContext *ctx)
{
#ifdef JS_SDL_ENABLE_BOX2D_MODULE
    js_box2d_shutdown();
#endif

    JS_FreeValue(ctx, g_onInit);
    JS_FreeValue(ctx, g_onUpdate);
    JS_FreeValue(ctx, g_onRender);
    JS_FreeValue(ctx, g_touchStart);
    JS_FreeValue(ctx, g_touchMove);
    JS_FreeValue(ctx, g_touchEnd);
    JS_FreeValue(ctx, g_textInput);
    JS_FreeValue(ctx, g_keyDown);
    JS_FreeValue(ctx, g_keyUp);
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
    g_textInput = g_keyDown = g_keyUp = JS_UNDEFINED;
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
        if (g_fonts[i].face) {
            FT_Done_Face(g_fonts[i].face);
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
    if (g_ft_library) {
        FT_Done_FreeType(g_ft_library);
        g_ft_library = NULL;
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
void js_call_textInput(JSContext *ctx, const char *text)
    { js_call_string(ctx, g_textInput, text); }
void js_call_keyDown(JSContext *ctx, const char *key)
    { js_call_string(ctx, g_keyDown, key); }
void js_call_keyUp(JSContext *ctx, const char *key)
    { js_call_string(ctx, g_keyUp, key); }
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
    get_window_size_in_pixels(width, height);
}

int js_get_win_w(void) { return g_win_w; }
int js_get_win_h(void) { return g_win_h; }

void js_convert_event_to_render_coordinates(SDL_Event *event)
{
    if (g_renderer) {
        SDL_ConvertEventToRenderCoordinates(g_renderer, event);
    }
}
