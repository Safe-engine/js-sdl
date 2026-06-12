import {
    createWindow,
    loadTexture,
    loadFont,
    clear,
    drawTexture,
    drawLabelTTF,
    present,
    onInit,
    onUpdate,
    onRender,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
} from "sdl3";

let playerTex;
let bulletTex;
let font;
let x = 100;
let y = 350;

onInit(() => {
    createWindow("SDL3 + QuickJS-NG", 1280, 720);
console.log("Hello, SDL3 + QuickJS-NG!");
    playerTex = loadTexture("res/player.png");
    bulletTex = loadTexture("res/bullet.png");
    font      = loadFont("/System/Library/Fonts/Helvetica.ttc", 24);
});

onUpdate((dt) => {
    x += 120 * dt;
    if (x > 1280) x = -64;
});

onRender(() => {
    clear();
    drawTexture(playerTex, x, y);
    drawTexture(bulletTex, x + 80, y + 20);
    drawLabelTTF(font, "SDL3 + QuickJS-NG", 20, 20);
    present();
});

onTouchStart((tx, ty) => {
    /* touch/mouse down at tx, ty */
});

onTouchMove((tx, ty) => {
    /* touch/mouse move */
});

onTouchEnd((tx, ty) => {
    /* touch/mouse up */
});
