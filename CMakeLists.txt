cmake_minimum_required(VERSION 3.20)

project(SDL3Game C)

set(CMAKE_C_STANDARD 11)

find_package(SDL3 REQUIRED)
find_package(SDL3_image REQUIRED)
find_package(SDL3_ttf REQUIRED)
find_package(qjs REQUIRED)

add_executable(
    sdl3js
    app/main.c
    app/js_sdl3.c
)

target_link_libraries(
    sdl3js
    SDL3::SDL3
    SDL3_image::SDL3_image
    SDL3_ttf::SDL3_ttf
    qjs
)
