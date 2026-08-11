// data/rooms.js — room config (single room today; multi-room ready)
// To add a second room, append one entry here — the "Change room" control enables itself.

export const rooms = [
  {
    id: "study",
    name: "Study",
    img: "assets/img/room.png",
    video: "assets/video/room-bg.mp4",
    poster: "assets/img/room.png",
    aspect: 1376 / 768,        // actual room image ratio 1.7917 (1376×768)
    width: 1376,              // native pixel width (used for SVG hotspot coordinate maths)
    height: 768,              // native pixel height
    focus: { x: 50, y: 50 },   // desktop: this point of the image aligns with the viewport centre
    focusSm: { x: 50, y: 42 }  // mobile: biased toward the desk area
  }
  // Example: a second room
  // ,{
  //   id: "lab", name: "Workshop",
  //   img: "assets/img/room-lab.jpg", aspect: 16/9,
  //   focus: { x: 50, y: 50 }, focusSm: { x: 50, y: 40 }
  // }
];
