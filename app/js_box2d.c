#include "js_box2d.h"

#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifdef JS_SDL_HAS_BOX2D
#include <box2d/box2d.h>
#endif

#define MAX_WORLDS 128
#define MAX_BODIES 4096

#ifdef JS_SDL_HAS_BOX2D
typedef struct JsBox2DBody {
    bool active;
    int world_handle;
    int user_data;
    b2BodyId id;
} JsBox2DBody;

typedef struct JsBox2DWorld {
    bool active;
    b2WorldId id;
} JsBox2DWorld;

typedef struct JsDebugDrawContext {
    JSContext *ctx;
    JSValue array;
    uint32_t count;
    float pixels_per_meter;
} JsDebugDrawContext;

static JsBox2DWorld g_worlds[MAX_WORLDS];
static JsBox2DBody g_bodies[MAX_BODIES];

static b2Vec2 js_vec2(JSContext *ctx, JSValueConst value)
{
    b2Vec2 result = {0.0f, 0.0f};
    JSValue x = JS_GetPropertyStr(ctx, value, "x");
    JSValue y = JS_GetPropertyStr(ctx, value, "y");
    double dx = 0.0;
    double dy = 0.0;
    JS_ToFloat64(ctx, &dx, x);
    JS_ToFloat64(ctx, &dy, y);
    JS_FreeValue(ctx, x);
    JS_FreeValue(ctx, y);
    result.x = (float)dx;
    result.y = (float)dy;
    return result;
}

static b2Rot js_rot(double radians)
{
    b2CosSin cs = b2ComputeCosSin((float)radians);
    b2Rot rot = {cs.cosine, cs.sine};
    return rot;
}

static double js_angle(b2Rot rot)
{
    return (double)b2Atan2(rot.s, rot.c);
}

static JSValue js_debug_point(JSContext *ctx, double x, double y, float pixels_per_meter)
{
    JSValue point = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, point, "x", JS_NewFloat64(ctx, x * pixels_per_meter));
    JS_SetPropertyStr(ctx, point, "y", JS_NewFloat64(ctx, y * pixels_per_meter));
    return point;
}

static void js_debug_set_color(JSContext *ctx, JSValue object, b2HexColor color)
{
    JS_SetPropertyStr(ctx, object, "color", JS_NewInt32(ctx, (int)color));
}

static void js_debug_append(JsDebugDrawContext *context, JSValue object)
{
    JS_SetPropertyUint32(context->ctx, context->array, context->count++, object);
}

static void js_debug_append_line(
    JsDebugDrawContext *context, b2Pos p1, b2Pos p2, b2HexColor color)
{
    JSContext *ctx = context->ctx;
    JSValue object = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, object, "type", JS_NewString(ctx, "line"));
    JS_SetPropertyStr(ctx, object, "x1", JS_NewFloat64(ctx, p1.x * context->pixels_per_meter));
    JS_SetPropertyStr(ctx, object, "y1", JS_NewFloat64(ctx, p1.y * context->pixels_per_meter));
    JS_SetPropertyStr(ctx, object, "x2", JS_NewFloat64(ctx, p2.x * context->pixels_per_meter));
    JS_SetPropertyStr(ctx, object, "y2", JS_NewFloat64(ctx, p2.y * context->pixels_per_meter));
    js_debug_set_color(ctx, object, color);
    js_debug_append(context, object);
}

static void js_debug_append_circle(
    JsDebugDrawContext *context, b2Pos center, float radius, b2HexColor color, bool fill)
{
    JSContext *ctx = context->ctx;
    JSValue object = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, object, "type", JS_NewString(ctx, "circle"));
    JS_SetPropertyStr(ctx, object, "x", JS_NewFloat64(ctx, center.x * context->pixels_per_meter));
    JS_SetPropertyStr(ctx, object, "y", JS_NewFloat64(ctx, center.y * context->pixels_per_meter));
    JS_SetPropertyStr(ctx, object, "radius", JS_NewFloat64(ctx, radius * context->pixels_per_meter));
    if (fill) JS_SetPropertyStr(ctx, object, "fill", JS_NewBool(ctx, true));
    js_debug_set_color(ctx, object, color);
    js_debug_append(context, object);
}

static void js_debug_append_polygon(
    JsDebugDrawContext *context,
    b2WorldTransform transform,
    const b2Vec2 *vertices,
    int vertex_count,
    b2HexColor color,
    bool fill)
{
    JSContext *ctx = context->ctx;
    JSValue object = JS_NewObject(ctx);
    JSValue points = JS_NewArray(ctx);
    JS_SetPropertyStr(ctx, object, "type", JS_NewString(ctx, "polygon"));
    for (int i = 0; i < vertex_count; i++) {
        b2Pos p = b2TransformWorldPoint(transform, vertices[i]);
        JS_SetPropertyUint32(
            ctx,
            points,
            (uint32_t)i,
            js_debug_point(ctx, p.x, p.y, context->pixels_per_meter));
    }
    JS_SetPropertyStr(ctx, object, "points", points);
    if (fill) JS_SetPropertyStr(ctx, object, "fill", JS_NewBool(ctx, true));
    js_debug_set_color(ctx, object, color);
    js_debug_append(context, object);
}

static int alloc_world(b2WorldId id)
{
    for (int i = 1; i < MAX_WORLDS; i++) {
        if (!g_worlds[i].active) {
            g_worlds[i].active = true;
            g_worlds[i].id = id;
            return i;
        }
    }
    return 0;
}

static int alloc_body(int world_handle, int user_data, b2BodyId id)
{
    for (int i = 1; i < MAX_BODIES; i++) {
        if (!g_bodies[i].active) {
            g_bodies[i].active = true;
            g_bodies[i].world_handle = world_handle;
            g_bodies[i].user_data = user_data;
            g_bodies[i].id = id;
            b2Body_SetUserData(id, &g_bodies[i]);
            return i;
        }
    }
    return 0;
}

static JsBox2DWorld *get_world(int handle)
{
    if (handle <= 0 || handle >= MAX_WORLDS || !g_worlds[handle].active) return NULL;
    if (!b2World_IsValid(g_worlds[handle].id)) return NULL;
    return &g_worlds[handle];
}

static JsBox2DBody *get_body(int handle)
{
    if (handle <= 0 || handle >= MAX_BODIES || !g_bodies[handle].active) return NULL;
    if (!b2Body_IsValid(g_bodies[handle].id)) return NULL;
    return &g_bodies[handle];
}

static b2BodyType js_body_type(int type)
{
    switch (type) {
        case 0: return b2_staticBody;
        case 1: return b2_kinematicBody;
        default: return b2_dynamicBody;
    }
}

static JsBox2DBody *body_from_shape(b2ShapeId shape_id)
{
    if (!b2Shape_IsValid(shape_id)) return NULL;
    b2BodyId body_id = b2Shape_GetBody(shape_id);
    if (!b2Body_IsValid(body_id)) return NULL;
    return b2Body_GetUserData(body_id);
}

static b2ShapeDef js_shape_def(JSContext *ctx, int argc, JSValueConst *argv, int first)
{
    b2ShapeDef def = b2DefaultShapeDef();
    double density = 1.0;
    double friction = 0.2;
    double restitution = 0.0;
    int is_sensor = 0;

    if (argc > first) JS_ToFloat64(ctx, &density, argv[first]);
    if (argc > first + 1) JS_ToFloat64(ctx, &friction, argv[first + 1]);
    if (argc > first + 2) JS_ToFloat64(ctx, &restitution, argv[first + 2]);
    if (argc > first + 3) JS_ToInt32(ctx, &is_sensor, argv[first + 3]);

    def.density = (float)density;
    def.material.friction = (float)friction;
    def.material.restitution = (float)restitution;
    def.isSensor = is_sensor != 0;
    def.enableContactEvents = true;
    def.enableSensorEvents = true;
    def.enablePreSolveEvents = true;
    return def;
}

static void js_draw_polygon(
    b2WorldTransform transform,
    const b2Vec2 *vertices,
    int vertex_count,
    b2HexColor color,
    void *data)
{
    js_debug_append_polygon(data, transform, vertices, vertex_count, color, false);
}

static void js_draw_solid_polygon(
    b2WorldTransform transform,
    const b2Vec2 *vertices,
    int vertex_count,
    float radius,
    b2HexColor color,
    void *data)
{
    (void)radius;
    js_debug_append_polygon(data, transform, vertices, vertex_count, color, true);
}

static void js_draw_circle(b2Pos center, float radius, b2HexColor color, void *data)
{
    js_debug_append_circle(data, center, radius, color, false);
}

static void js_draw_solid_circle(
    b2WorldTransform transform,
    b2Vec2 center,
    float radius,
    b2HexColor color,
    void *data)
{
    b2Pos world_center = b2TransformWorldPoint(transform, center);
    js_debug_append_circle(data, world_center, radius, color, true);
}

static void js_draw_solid_capsule(
    b2Pos p1, b2Pos p2, float radius, b2HexColor color, void *data)
{
    js_debug_append_line(data, p1, p2, color);
    js_debug_append_circle(data, p1, radius, color, true);
    js_debug_append_circle(data, p2, radius, color, true);
}

static void js_draw_line(b2Pos p1, b2Pos p2, b2HexColor color, void *data)
{
    js_debug_append_line(data, p1, p2, color);
}

static void js_draw_transform(b2WorldTransform transform, void *data)
{
    b2Pos origin = transform.p;
    b2Pos x_axis = {
        origin.x + 0.35f * transform.q.c,
        origin.y + 0.35f * transform.q.s,
    };
    b2Pos y_axis = {
        origin.x - 0.35f * transform.q.s,
        origin.y + 0.35f * transform.q.c,
    };
    js_debug_append_line(data, origin, x_axis, b2_colorRed);
    js_debug_append_line(data, origin, y_axis, b2_colorGreen);
}

static void js_draw_point(b2Pos p, float size, b2HexColor color, void *data)
{
    JSContext *ctx = ((JsDebugDrawContext *)data)->ctx;
    JsDebugDrawContext *context = data;
    JSValue object = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, object, "type", JS_NewString(ctx, "point"));
    JS_SetPropertyStr(ctx, object, "x", JS_NewFloat64(ctx, p.x * context->pixels_per_meter));
    JS_SetPropertyStr(ctx, object, "y", JS_NewFloat64(ctx, p.y * context->pixels_per_meter));
    JS_SetPropertyStr(ctx, object, "size", JS_NewFloat64(ctx, size));
    js_debug_set_color(ctx, object, color);
    js_debug_append(context, object);
}

static void js_draw_bounds(b2AABB aabb, b2HexColor color, void *data)
{
    JsDebugDrawContext *context = data;
    JSContext *ctx = context->ctx;
    JSValue object = JS_NewObject(ctx);
    JSValue points = JS_NewArray(ctx);
    JS_SetPropertyStr(ctx, object, "type", JS_NewString(ctx, "polygon"));
    JS_SetPropertyUint32(
        ctx, points, 0,
        js_debug_point(ctx, aabb.lowerBound.x, aabb.lowerBound.y, context->pixels_per_meter));
    JS_SetPropertyUint32(
        ctx, points, 1,
        js_debug_point(ctx, aabb.upperBound.x, aabb.lowerBound.y, context->pixels_per_meter));
    JS_SetPropertyUint32(
        ctx, points, 2,
        js_debug_point(ctx, aabb.upperBound.x, aabb.upperBound.y, context->pixels_per_meter));
    JS_SetPropertyUint32(
        ctx, points, 3,
        js_debug_point(ctx, aabb.lowerBound.x, aabb.upperBound.y, context->pixels_per_meter));
    JS_SetPropertyStr(ctx, object, "points", points);
    js_debug_set_color(ctx, object, color);
    js_debug_append(context, object);
}

static JSValue js_createWorld(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    b2WorldDef def = b2DefaultWorldDef();
    if (argc > 0 && JS_IsObject(argv[0])) def.gravity = js_vec2(ctx, argv[0]);
    def.workerCount = 1;

    b2WorldId id = b2CreateWorld(&def);
    int handle = alloc_world(id);
    if (handle == 0) {
        b2DestroyWorld(id);
        return JS_NewInt32(ctx, 0);
    }
    return JS_NewInt32(ctx, handle);
}

static JSValue js_destroyWorld(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    JsBox2DWorld *world = get_world(handle);
    if (!world) return JS_UNDEFINED;

    for (int i = 1; i < MAX_BODIES; i++) {
        if (g_bodies[i].active && g_bodies[i].world_handle == handle) {
            g_bodies[i].active = false;
        }
    }
    b2DestroyWorld(world->id);
    memset(world, 0, sizeof(*world));
    return JS_UNDEFINED;
}

static JSValue js_stepWorld(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    double dt = 0.0;
    int sub_steps = 4;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    if (argc > 1) JS_ToFloat64(ctx, &dt, argv[1]);
    if (argc > 2) JS_ToInt32(ctx, &sub_steps, argv[2]);
    JsBox2DWorld *world = get_world(handle);
    if (world) b2World_Step(world->id, (float)dt, sub_steps);
    return JS_UNDEFINED;
}

static JSValue js_setGravity(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    JsBox2DWorld *world = get_world(handle);
    if (world && argc > 1) b2World_SetGravity(world->id, js_vec2(ctx, argv[1]));
    return JS_UNDEFINED;
}

static JSValue js_createBody(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int world_handle = 0;
    int type = 2;
    int user_data = 0;
    double angle = 0.0;
    double gravity_scale = 1.0;
    if (argc > 0) JS_ToInt32(ctx, &world_handle, argv[0]);
    if (argc > 1) JS_ToInt32(ctx, &type, argv[1]);
    if (argc > 3) JS_ToFloat64(ctx, &angle, argv[3]);
    if (argc > 4) JS_ToFloat64(ctx, &gravity_scale, argv[4]);
    if (argc > 5) JS_ToInt32(ctx, &user_data, argv[5]);

    JsBox2DWorld *world = get_world(world_handle);
    if (!world) return JS_NewInt32(ctx, 0);

    b2BodyDef def = b2DefaultBodyDef();
    def.type = js_body_type(type);
    if (argc > 2) def.position = js_vec2(ctx, argv[2]);
    def.rotation = js_rot(angle);
    def.gravityScale = (float)gravity_scale;
    def.userData = NULL;

    b2BodyId id = b2CreateBody(world->id, &def);
    return JS_NewInt32(ctx, alloc_body(world_handle, user_data, id));
}

static JSValue js_destroyBody(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    JsBox2DBody *body = get_body(handle);
    if (!body) return JS_UNDEFINED;
    b2DestroyBody(body->id);
    memset(body, 0, sizeof(*body));
    return JS_UNDEFINED;
}

static JSValue js_createBoxShape(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int body_handle = 0;
    double hx = 0.0;
    double hy = 0.0;
    double angle = 0.0;
    if (argc > 0) JS_ToInt32(ctx, &body_handle, argv[0]);
    if (argc > 1) JS_ToFloat64(ctx, &hx, argv[1]);
    if (argc > 2) JS_ToFloat64(ctx, &hy, argv[2]);
    if (argc > 4) JS_ToFloat64(ctx, &angle, argv[4]);
    JsBox2DBody *body = get_body(body_handle);
    if (!body) return JS_NewInt32(ctx, 0);

    b2ShapeDef def = js_shape_def(ctx, argc, argv, 5);
    b2Vec2 center = argc > 3 ? js_vec2(ctx, argv[3]) : b2Vec2_zero;
    b2Polygon polygon = b2MakeOffsetBox((float)hx, (float)hy, center, js_rot(angle));
    b2ShapeId shape = b2CreatePolygonShape(body->id, &def, &polygon);
    return JS_NewInt32(ctx, B2_IS_NON_NULL(shape) ? 1 : 0);
}

static JSValue js_createCircleShape(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int body_handle = 0;
    double radius = 0.0;
    if (argc > 0) JS_ToInt32(ctx, &body_handle, argv[0]);
    if (argc > 1) JS_ToFloat64(ctx, &radius, argv[1]);
    JsBox2DBody *body = get_body(body_handle);
    if (!body) return JS_NewInt32(ctx, 0);

    b2ShapeDef def = js_shape_def(ctx, argc, argv, 3);
    b2Circle circle = {argc > 2 ? js_vec2(ctx, argv[2]) : b2Vec2_zero, (float)radius};
    b2ShapeId shape = b2CreateCircleShape(body->id, &def, &circle);
    return JS_NewInt32(ctx, B2_IS_NON_NULL(shape) ? 1 : 0);
}

static JSValue js_createPolygonShape(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int body_handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &body_handle, argv[0]);
    JsBox2DBody *body = get_body(body_handle);
    if (!body || argc < 2) return JS_NewInt32(ctx, 0);

    int64_t length_value = 0;
    JS_GetLength(ctx, argv[1], &length_value);
    uint32_t length = length_value > 0 ? (uint32_t)length_value : 0;
    if (length < 3) return JS_NewInt32(ctx, 0);
    if (length > B2_MAX_POLYGON_VERTICES) length = B2_MAX_POLYGON_VERTICES;

    b2Vec2 points[B2_MAX_POLYGON_VERTICES];
    for (uint32_t i = 0; i < length; i++) {
        JSValue point = JS_GetPropertyUint32(ctx, argv[1], i);
        points[i] = js_vec2(ctx, point);
        JS_FreeValue(ctx, point);
    }

    b2Hull hull = b2ComputeHull(points, (int)length);
    if (hull.count < 3) return JS_NewInt32(ctx, 0);

    b2ShapeDef def = js_shape_def(ctx, argc, argv, 2);
    b2Polygon polygon = b2MakePolygon(&hull, 0.0f);
    b2ShapeId shape = b2CreatePolygonShape(body->id, &def, &polygon);
    return JS_NewInt32(ctx, B2_IS_NON_NULL(shape) ? 1 : 0);
}

static JSValue js_createSegmentShape(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int body_handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &body_handle, argv[0]);
    JsBox2DBody *body = get_body(body_handle);
    if (!body || argc < 3) return JS_NewInt32(ctx, 0);

    b2ShapeDef def = js_shape_def(ctx, argc, argv, 3);
    b2Segment segment = {js_vec2(ctx, argv[1]), js_vec2(ctx, argv[2])};
    b2ShapeId shape = b2CreateSegmentShape(body->id, &def, &segment);
    return JS_NewInt32(ctx, B2_IS_NON_NULL(shape) ? 1 : 0);
}

static JSValue js_getBodyTransform(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    JsBox2DBody *body = get_body(handle);
    if (!body) return JS_NULL;

    b2Transform transform = b2Body_GetTransform(body->id);
    JSValue result = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, result, "x", JS_NewFloat64(ctx, transform.p.x));
    JS_SetPropertyStr(ctx, result, "y", JS_NewFloat64(ctx, transform.p.y));
    JS_SetPropertyStr(ctx, result, "angle", JS_NewFloat64(ctx, js_angle(transform.q)));
    return result;
}

static JSValue js_setBodyTransform(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    double angle = 0.0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    if (argc > 2) JS_ToFloat64(ctx, &angle, argv[2]);
    JsBox2DBody *body = get_body(handle);
    if (body && argc > 1) b2Body_SetTransform(body->id, js_vec2(ctx, argv[1]), js_rot(angle));
    return JS_UNDEFINED;
}

static JSValue js_setLinearVelocity(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    JsBox2DBody *body = get_body(handle);
    if (body && argc > 1) b2Body_SetLinearVelocity(body->id, js_vec2(ctx, argv[1]));
    return JS_UNDEFINED;
}

static JSValue js_applyForceToCenter(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    JsBox2DBody *body = get_body(handle);
    if (body && argc > 1) b2Body_ApplyForceToCenter(body->id, js_vec2(ctx, argv[1]), true);
    return JS_UNDEFINED;
}

static JSValue js_applyLinearImpulseToCenter(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    JsBox2DBody *body = get_body(handle);
    if (body && argc > 1) b2Body_ApplyLinearImpulseToCenter(body->id, js_vec2(ctx, argv[1]), true);
    return JS_UNDEFINED;
}

static JSValue js_getContactEvents(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    JsBox2DWorld *world = get_world(handle);
    JSValue result = JS_NewObject(ctx);
    JSValue begin = JS_NewArray(ctx);
    JSValue end = JS_NewArray(ctx);
    if (!world) {
        JS_SetPropertyStr(ctx, result, "begin", begin);
        JS_SetPropertyStr(ctx, result, "end", end);
        return result;
    }

    b2ContactEvents events = b2World_GetContactEvents(world->id);
    for (int i = 0; i < events.beginCount; i++) {
        JsBox2DBody *a = body_from_shape(events.beginEvents[i].shapeIdA);
        JsBox2DBody *b = body_from_shape(events.beginEvents[i].shapeIdB);
        if (!a || !b) continue;
        JSValue pair = JS_NewArray(ctx);
        JS_SetPropertyUint32(ctx, pair, 0, JS_NewInt32(ctx, a->user_data));
        JS_SetPropertyUint32(ctx, pair, 1, JS_NewInt32(ctx, b->user_data));
        JS_SetPropertyUint32(ctx, begin, (uint32_t)i, pair);
    }
    for (int i = 0; i < events.endCount; i++) {
        JsBox2DBody *a = body_from_shape(events.endEvents[i].shapeIdA);
        JsBox2DBody *b = body_from_shape(events.endEvents[i].shapeIdB);
        if (!a || !b) continue;
        JSValue pair = JS_NewArray(ctx);
        JS_SetPropertyUint32(ctx, pair, 0, JS_NewInt32(ctx, a->user_data));
        JS_SetPropertyUint32(ctx, pair, 1, JS_NewInt32(ctx, b->user_data));
        JS_SetPropertyUint32(ctx, end, (uint32_t)i, pair);
    }
    JS_SetPropertyStr(ctx, result, "begin", begin);
    JS_SetPropertyStr(ctx, result, "end", end);
    return result;
}

static JSValue js_getDebugDraw(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    int handle = 0;
    double pixels_per_meter = 32.0;
    if (argc > 0) JS_ToInt32(ctx, &handle, argv[0]);
    if (argc > 1) JS_ToFloat64(ctx, &pixels_per_meter, argv[1]);

    JsBox2DWorld *world = get_world(handle);
    JSValue result = JS_NewArray(ctx);
    if (!world) return result;

    JsDebugDrawContext context = {
        ctx,
        result,
        0,
        (float)pixels_per_meter,
    };
    b2DebugDraw draw = b2DefaultDebugDraw();
    draw.DrawPolygonFcn = js_draw_polygon;
    draw.DrawSolidPolygonFcn = js_draw_solid_polygon;
    draw.DrawCircleFcn = js_draw_circle;
    draw.DrawSolidCircleFcn = js_draw_solid_circle;
    draw.DrawSolidCapsuleFcn = js_draw_solid_capsule;
    draw.DrawLineFcn = js_draw_line;
    draw.DrawTransformFcn = js_draw_transform;
    draw.DrawPointFcn = js_draw_point;
    draw.DrawBoundsFcn = js_draw_bounds;
    draw.drawShapes = true;
    draw.drawJoints = true;
    draw.drawBounds = false;
    draw.drawMass = false;
    draw.context = &context;

    b2World_Draw(world->id, &draw);
    return result;
}
#endif

#ifndef JS_SDL_HAS_BOX2D
static JSValue js_box2dUnavailable(JSContext *ctx, JSValueConst this_val, int argc, JSValueConst *argv)
{
    (void)this_val;
    (void)argc;
    (void)argv;
    return JS_ThrowReferenceError(ctx, "box2d native module was not linked");
}
#endif

static const JSCFunctionListEntry funcs[] = {
#ifdef JS_SDL_HAS_BOX2D
    JS_CFUNC_DEF("createWorld", 1, js_createWorld),
    JS_CFUNC_DEF("destroyWorld", 1, js_destroyWorld),
    JS_CFUNC_DEF("stepWorld", 3, js_stepWorld),
    JS_CFUNC_DEF("setGravity", 2, js_setGravity),
    JS_CFUNC_DEF("createBody", 6, js_createBody),
    JS_CFUNC_DEF("destroyBody", 1, js_destroyBody),
    JS_CFUNC_DEF("createBoxShape", 9, js_createBoxShape),
    JS_CFUNC_DEF("createCircleShape", 7, js_createCircleShape),
    JS_CFUNC_DEF("createPolygonShape", 6, js_createPolygonShape),
    JS_CFUNC_DEF("createSegmentShape", 7, js_createSegmentShape),
    JS_CFUNC_DEF("getBodyTransform", 1, js_getBodyTransform),
    JS_CFUNC_DEF("setBodyTransform", 3, js_setBodyTransform),
    JS_CFUNC_DEF("setLinearVelocity", 2, js_setLinearVelocity),
    JS_CFUNC_DEF("applyForceToCenter", 2, js_applyForceToCenter),
    JS_CFUNC_DEF("applyLinearImpulseToCenter", 2, js_applyLinearImpulseToCenter),
    JS_CFUNC_DEF("getContactEvents", 1, js_getContactEvents),
    JS_CFUNC_DEF("getDebugDraw", 2, js_getDebugDraw),
#else
    JS_CFUNC_DEF("createWorld", 1, js_box2dUnavailable),
    JS_CFUNC_DEF("getDebugDraw", 2, js_box2dUnavailable),
#endif
};

static int js_box2d_init(JSContext *ctx, JSModuleDef *m)
{
    return JS_SetModuleExportList(ctx, m, funcs, sizeof(funcs) / sizeof(JSCFunctionListEntry));
}

int js_init_box2d(JSContext *ctx)
{
    JSModuleDef *m = JS_NewCModule(ctx, "box2d", js_box2d_init);
    JS_AddModuleExportList(ctx, m, funcs, sizeof(funcs) / sizeof(JSCFunctionListEntry));
    return 0;
}

void js_box2d_shutdown(void)
{
#ifdef JS_SDL_HAS_BOX2D
    for (int i = 1; i < MAX_WORLDS; i++) {
        if (g_worlds[i].active && b2World_IsValid(g_worlds[i].id)) {
            b2DestroyWorld(g_worlds[i].id);
        }
    }
    memset(g_worlds, 0, sizeof(g_worlds));
    memset(g_bodies, 0, sizeof(g_bodies));
#endif
}
