// ===================== Particle systems =====================
// A particle system is a lot of points that each move on their own.
// Every system here is an object with:
//   count     - how many particles
//   positions - x, y, z of every particle (one Float32Array, ready to copy into a buffer)
//   color     - the color of the points
//   size      - how wide one point is (in world units)
// No WebGL here: main.js copies `positions` into a buffer and draws it with gl.POINTS.

// ---------------------------------------------------------------- snow
const SNOW_AREA = 60;     // flakes fall over x and z from -60 to 60
const SNOW_TOP = 40;      // and start up to this high

function createSnow(count) {
  const snow = {
    count: count,
    positions: new Float32Array(count * 3),
    speeds: new Float32Array(count),       // each flake falls a bit differently
    color: [1.0, 1.0, 1.0],
    size: 0.15
  };
  for (let i = 0; i < count; i++) resetFlake(snow, i, true);
  return snow;
}

// put flake i somewhere random: anywhere in the air at the start, at the top after that
function resetFlake(snow, i, anyHeight) {
  snow.positions[i * 3] = (Math.random() * 2 - 1) * SNOW_AREA;
  snow.positions[i * 3 + 1] = anyHeight ? Math.random() * SNOW_TOP : SNOW_TOP + Math.random() * 5;
  snow.positions[i * 3 + 2] = (Math.random() * 2 - 1) * SNOW_AREA;
  snow.speeds[i] = 0.7 + Math.random() * 0.6;
}

// move every flake forward by dt seconds
function updateSnow(snow, dt, time) {
  const p = snow.positions;
  for (let i = 0; i < snow.count; i++) {
    p[i * 3 + 1] -= 2.5 * snow.speeds[i] * dt;              // fall slowly (snow is light)
    p[i * 3] += Math.sin(time * 1.5 + i) * 0.4 * dt;        // drift side to side
    p[i * 3 + 2] += Math.cos(time * 1.2 + i) * 0.4 * dt;

    if (p[i * 3 + 1] < 0) resetFlake(snow, i, false);      // hit the ground: back to the top
  }
}
