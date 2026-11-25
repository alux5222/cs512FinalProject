// ===================== Trees and street lights =====================
// Every tree is a HIERARCHY: each part is placed relative to the part it grows from.
//   Aspen: lower trunk -> upper trunk -> branches + a crown of hundreds of small leaves
//   Fir:   trunk -> bottom cone -> middle cone -> top cone
//   Lamp:  pole -> cap -> glowing bulb
//
// main.js passes in:
//   parts    - mesh + texture + color for each part (see "Tree parts" in main.js)
//   drawPart - draws one part with a model matrix

// ---------------------------------------------------------------- layout
// The ground is flat (y = 0) with a round hole of radius 15 in the middle for the pond
// (createGround(50, 15, ...) in main.js).
const POND_RADIUS = 15;

// Same places as the duck pond picture. That layout was made around a 14 x 9 pond,
// so the positions are stretched to sit in the same spots around a pond of radius 15.
const LAYOUT_SCALE_X = POND_RADIUS / 14;
const LAYOUT_SCALE_Z = POND_RADIUS / 9;
const TREE_SCALE = 1.3;

// [x, z, size] in the duck pond layout
const ASPEN_SPOTS = [
  [-26, -7, 1.3], [-19, -18, 1.2], [-29, 5, 1.15], [-6, -21, 1.1],
  [-34, -18, 1.0], [-12, -26, 1.1], [2, -24, 0.9], [10, -27, 1.0], [24, -22, 1.1], [34, -14, 1.0],
  [30, 0, 0.9], [-40, -4, 0.9], [-30, -30, 0.8], [18, -32, 0.8], [40, -28, 0.9], [-22, -34, 0.9],
  [44, -2, 1.0], [-46, -16, 1.0]
];
const FIR_SPOTS = [[26, 11, 1.3], [33, -6, 1.0], [37, 7, 1.1], [-38, 12, 1.0], [-44, -30, 1.2], [46, -20, 1.1]];

// Street lights stand around the pond at these angles
const LAMP_ANGLES = [0.65, 2.1, 3.1, 4.1, 5.05, 5.95];
const LAMP_RADIUS = POND_RADIUS * 1.92;

function createForest() {
  const trees = [];

  function add(type, spots) {
    for (let i = 0; i < spots.length; i++) {
      let x = spots[i][0] * LAYOUT_SCALE_X;
      let z = spots[i][1] * LAYOUT_SCALE_Z;
      if (z < -36) z = -36;      // stay in front of the mountains (they start at z = -38)
      if (x > 46) x = 46;        // stay on the ground (it ends at x = -50 and 50)
      if (x < -46) x = -46;
      trees.push({ type: type, x: x, y: 0, z: z, size: spots[i][2] * TREE_SCALE,
                   crown: i % 3 });   
    }
  }
  add("aspen", ASPEN_SPOTS);
  add("fir", FIR_SPOTS);
  return trees;
}

function createLamps() {
  const lamps = [];
  for (let i = 0; i < LAMP_ANGLES.length; i++) {
    lamps.push({ x: LAMP_RADIUS * Math.cos(LAMP_ANGLES[i]), y: 0, z: LAMP_RADIUS * Math.sin(LAMP_ANGLES[i]) });
  }
  return lamps;
}

function drawForest(trees, parts, drawPart) {
  for (let i = 0; i < trees.length; i++) {
    if (trees[i].type === "aspen") drawAspen(trees[i], parts, drawPart);
    else drawFir(trees[i], parts, drawPart);
  }
}

function drawLamps(lamps, parts, drawPart) {
  for (let i = 0; i < lamps.length; i++) drawLamp(lamps[i], parts, drawPart);
}

// ---------------------------------------------------------------- aspen
function drawAspen(tree, parts, drawPart) {
  const base = multiply(translate(tree.x, tree.y, tree.z), scale(tree.size, tree.size, tree.size));

  // level 0: lower trunk, y = 0 to 3.6 (the cylinder goes from -1 to 1, so scale and lift it)
  drawPart(parts.aspenTrunk, multiply(base, multiply(translate(0, 1.8, 0), scale(0.16, 1.8, 0.16))));

  // level 1: upper trunk, thinner, y = 3.6 to 6.2
  const upper = multiply(base, translate(0, 3.6, 0));
  drawPart(parts.aspenTrunk, multiply(upper, multiply(translate(0, 1.3, 0), scale(0.1, 1.3, 0.1))));

  // branches: thin sticks going up and out, turning around the trunk as they go up
  for (let i = 0; i < 11; i++) {
    const height = 1.7 + i * 0.38;                               // where on the trunk
    const frame = height < 3.6 ? base : upper;                   // attach to the lower or upper trunk
    const y = height < 3.6 ? height : height - 3.6;
    const branch = multiply(frame, multiply(translate(0, y, 0),
      multiply(rotateY(i * 2.4), rotateZ(0.6 + 0.15 * Math.sin(i * 3.1)))));   // lean 35-45 degrees out
    const length = 0.5 + 0.15 * Math.sin(i * 1.3);
    drawPart(parts.aspenBranch, multiply(branch, multiply(translate(0, length, 0), scale(0.035, length, 0.035))));
  }

  // level 2: the crown of leaves, centered on the upper trunk
  drawPart(parts.aspenCrowns[tree.crown], multiply(upper, translate(0, 0.4, 0)));
}

// ---------------------------------------------------------------- fir
function drawFir(tree, parts, drawPart) {
  const base = multiply(translate(tree.x, tree.y, tree.z), scale(tree.size, tree.size, tree.size));

  // trunk: y = 0 to 1.8
  drawPart(parts.firTrunk, multiply(base, multiply(translate(0, 0.9, 0), scale(0.25, 0.9, 0.25))));

  // level 1-3: three cones, each sitting on the one below (the cone goes from y = 0 to 1)
  let tier = multiply(base, translate(0, 0.9, 0));
  drawPart(parts.firNeedles, multiply(tier, scale(2.0, 2.8, 2.0)));
  tier = multiply(tier, translate(0, 1.6, 0));
  drawPart(parts.firNeedles, multiply(tier, scale(1.6, 2.4, 1.6)));
  tier = multiply(tier, translate(0, 1.5, 0));
  drawPart(parts.firNeedles, multiply(tier, scale(1.1, 2.0, 1.1)));
}

// ---------------------------------------------------------------- street light
function drawLamp(lamp, parts, drawPart) {
  const base = multiply(translate(lamp.x, lamp.y, lamp.z), scale(TREE_SCALE, TREE_SCALE, TREE_SCALE));
  drawPart(parts.lampPole, multiply(base, multiply(translate(0, 1.6, 0), scale(0.07, 1.6, 0.07))));   // pole
  drawPart(parts.lampPole, multiply(base, multiply(translate(0, 3.25, 0), scale(0.18, 0.05, 0.18)))); // cap
  drawPart(parts.lampGlow, multiply(base, multiply(translate(0, 3.45, 0), scale(0.2, 0.2, 0.2))));     // bulb
}
