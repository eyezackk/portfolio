import { findSticker, toSvgString } from "trazo-stickers/svg";

document.querySelectorAll("[data-sticker]").forEach(function (slot) {
    var def = findSticker(slot.getAttribute("data-sticker"));
    if (!def) return;
    var size = Number(slot.getAttribute("data-size")) || 48;
    var rotate = Number(slot.getAttribute("data-rotate")) || 0;
    slot.innerHTML = toSvgString(def, { size: size, rotate: rotate });
});
