cmake_minimum_required(VERSION 3.20)

project(SDL3Game VERSION 1.0.0 LANGUAGES C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

include(CTest)

option(JS_SDL_USE_VENDORED "Build mobile dependencies from third_party" OFF)

if(ANDROID OR CMAKE_SYSTEM_NAME STREQUAL "iOS")
    set(JS_SDL_USE_VENDORED ON CACHE BOOL "" FORCE)
endif()

if(JS_SDL_USE_VENDORED)
    foreach(dependency SDL SDL_image SDL_ttf quickjs box2d)
        if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/third_party/${dependency}/CMakeLists.txt")
            message(FATAL_ERROR
                "Missing third_party/${dependency}. Run scripts/bootstrap-mobile-deps.sh first.")
        endif()
    endforeach()

    if(ANDROID)
        set(SDL_SHARED ON CACHE BOOL "" FORCE)
        set(SDL_STATIC OFF CACHE BOOL "" FORCE)
    else()
        set(SDL_SHARED OFF CACHE BOOL "" FORCE)
        set(SDL_STATIC ON CACHE BOOL "" FORCE)
    endif()
    set(SDLIMAGE_VENDORED ON CACHE BOOL "" FORCE)
    set(SDLIMAGE_DEPS_SHARED OFF CACHE BOOL "" FORCE)
    # The app does not ship AVIF assets, and its bundled codecs currently fail
    # with Android NDK 28 on 32-bit ARM and x86_64.
    set(SDLIMAGE_AVIF OFF CACHE BOOL "" FORCE)
    set(SDLIMAGE_AVIF_SHARED OFF CACHE BOOL "" FORCE)
    set(SDLIMAGE_JPG_SHARED OFF CACHE BOOL "" FORCE)
    set(SDLIMAGE_JXL_SHARED OFF CACHE BOOL "" FORCE)
    set(SDLIMAGE_PNG_SHARED OFF CACHE BOOL "" FORCE)
    set(SDLIMAGE_TIF_SHARED OFF CACHE BOOL "" FORCE)
    set(SDLIMAGE_WEBP_SHARED OFF CACHE BOOL "" FORCE)
    set(SDLTTF_VENDORED ON CACHE BOOL "" FORCE)
    set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

    if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
        # SDL_image enables libwebp's desktop webpmux tool, whose install rule
        # is invalid for iOS bundles. Keep the mux library, but skip the CLI.
        cmake_policy(SET CMP0126 NEW)
        set(WEBP_BUILD_WEBPMUX OFF)
    endif()

    add_subdirectory(third_party/SDL EXCLUDE_FROM_ALL)
    add_subdirectory(third_party/SDL_image EXCLUDE_FROM_ALL)
    add_subdirectory(third_party/SDL_ttf EXCLUDE_FROM_ALL)
    add_subdirectory(third_party/quickjs EXCLUDE_FROM_ALL)
else()
    find_package(SDL3 REQUIRED)
    find_package(SDL3_image REQUIRED)
    find_package(SDL3_ttf REQUIRED)
    find_package(qjs REQUIRED)
    find_package(box2d QUIET)
endif()

set(JS_SDL_SOURCES
    app/main.c
    app/box2d.c
    app/js_sdl3.c
)

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/third_party/box2d/CMakeLists.txt")
    set(BOX2D_SAMPLES OFF CACHE BOOL "" FORCE)
    set(BOX2D_BENCHMARKS OFF CACHE BOOL "" FORCE)
    set(BOX2D_DOCS OFF CACHE BOOL "" FORCE)
    set(BOX2D_UNIT_TESTS OFF CACHE BOOL "" FORCE)
    add_subdirectory(third_party/box2d EXCLUDE_FROM_ALL)
endif()

if(ANDROID)
    add_library(main SHARED ${JS_SDL_SOURCES})
elseif(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    add_executable(sdl3js MACOSX_BUNDLE ${JS_SDL_SOURCES})
else()
    add_executable(sdl3js ${JS_SDL_SOURCES})
endif()

set(JS_SDL_TARGET main)
if(NOT ANDROID)
    set(JS_SDL_TARGET sdl3js)
endif()

set(QUICKJS_TARGET qjs)
if(TARGET qjs::qjs)
    set(QUICKJS_TARGET qjs::qjs)
elseif(TARGET quickjs)
    set(QUICKJS_TARGET quickjs)
endif()

target_link_libraries(
    ${JS_SDL_TARGET}
    PRIVATE
        SDL3::SDL3
        SDL3_image::SDL3_image
        SDL3_ttf::SDL3_ttf
        ${QUICKJS_TARGET}
)

set(BOX2D_TARGET "")
if(TARGET box2d::box2d)
    set(BOX2D_TARGET box2d::box2d)
elseif(TARGET box2d)
    set(BOX2D_TARGET box2d)
endif()

if(BOX2D_TARGET)
    target_link_libraries(${JS_SDL_TARGET} PRIVATE ${BOX2D_TARGET})
    target_compile_definitions(${JS_SDL_TARGET} PRIVATE JS_SDL_HAS_BOX2D=1)
endif()

if(BUILD_TESTING)
    add_executable(js_sdl3_native_tests
        tests/native_binding_tests.c
        app/box2d.c
        app/js_sdl3.c
    )
    target_include_directories(js_sdl3_native_tests PRIVATE app)
    target_link_libraries(
        js_sdl3_native_tests
        PRIVATE
            SDL3::SDL3
            SDL3_image::SDL3_image
            SDL3_ttf::SDL3_ttf
            ${QUICKJS_TARGET}
    )
    if(BOX2D_TARGET)
        target_link_libraries(js_sdl3_native_tests PRIVATE ${BOX2D_TARGET})
        target_compile_definitions(js_sdl3_native_tests PRIVATE JS_SDL_HAS_BOX2D=1)
    endif()
    add_test(NAME js_sdl3_native_tests COMMAND js_sdl3_native_tests)
endif()

if(CMAKE_SYSTEM_NAME STREQUAL "iOS")
    file(GLOB_RECURSE JS_BUNDLE_FILES CONFIGURE_DEPENDS
        "${CMAKE_CURRENT_SOURCE_DIR}/dist/*"
        "${CMAKE_CURRENT_SOURCE_DIR}/res/*")

    foreach(bundle_file IN LISTS JS_BUNDLE_FILES)
        file(RELATIVE_PATH bundle_path "${CMAKE_CURRENT_SOURCE_DIR}" "${bundle_file}")
        get_filename_component(bundle_directory "${bundle_path}" DIRECTORY)
        set_source_files_properties(
            "${bundle_file}"
            PROPERTIES MACOSX_PACKAGE_LOCATION "Resources/${bundle_directory}")
    endforeach()

    target_sources(sdl3js PRIVATE ${JS_BUNDLE_FILES})
    set_target_properties(sdl3js PROPERTIES
        MACOSX_BUNDLE_BUNDLE_NAME "JS SDL"
        MACOSX_BUNDLE_GUI_IDENTIFIER "com.safeengine.jssdl"
        MACOSX_BUNDLE_SHORT_VERSION_STRING "${PROJECT_VERSION}"
        MACOSX_BUNDLE_BUNDLE_VERSION "1"
        MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/ios/Info.plist.in"
        XCODE_ATTRIBUTE_ASSETCATALOG_COMPILER_APPICON_NAME "AppIcon"
        XCODE_ATTRIBUTE_CODE_SIGN_STYLE "Automatic"
        XCODE_ATTRIBUTE_DEVELOPMENT_TEAM "${JS_SDL_DEVELOPMENT_TEAM}"
        XCODE_ATTRIBUTE_IPHONEOS_DEPLOYMENT_TARGET "15.0"
        XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "com.safeengine.jssdl"
        XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY "1,2"
    )

    target_sources(sdl3js PRIVATE ios/Assets.xcassets)
    set_source_files_properties(
        ios/Assets.xcassets
        PROPERTIES MACOSX_PACKAGE_LOCATION Resources)
endif()
