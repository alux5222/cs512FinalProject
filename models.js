function createCube() {
  const positions = new Float32Array([
    -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1,   // front
     1, -1, -1,  -1, -1, -1,  -1,  1, -1,   1,  1, -1,   // back
    -1,  1,  1,   1,  1,  1,   1,  1, -1,  -1,  1, -1,   // top
    -1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,   // bottom
     1, -1,  1,   1, -1, -1,   1,  1, -1,   1,  1,  1,   // right
    -1, -1, -1,  -1, -1,  1,  -1,  1,  1,  -1,  1, -1    // left
  ]);
  const faceNormals = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
  const normals = new Float32Array(faceNormals.flatMap(n => [...n, ...n, ...n, ...n]));

  // Tangent; bitangent = cross(N, T)
  const faceTangents = [[1, 0, 0], [-1, 0, 0], [1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1]];
  const tangents = new Float32Array(faceTangents.flatMap(t => [...t, ...t, ...t, ...t]));

  const texCoords = new Float32Array(faceNormals.flatMap(() => [0, 0, 1, 0, 1, 1, 0, 1]));

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,   // front
     4,  5,  6,   4,  6,  7,   // back
     8,  9, 10,   8, 10, 11,   // top
    12, 13, 14,  12, 14, 15,   // bottom
    16, 17, 18,  16, 18, 19,   // right
    20, 21, 22,  20, 22, 23    // left
  ]);
  return { positions, normals, tangents, texCoords, indices };
}

function createPlane(size) {
  const uRepeat = 10;
  const vRepeat = 10;
  const normals = new Float32Array([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0
  ]);

  const tangents = new Float32Array([
    1, 0, 0,
    1, 0, 0,
    1, 0, 0,
    1, 0, 0
  ]);

  const texCoords = new Float32Array([
    0, 0,
    uRepeat, 0,
    uRepeat, vRepeat,
    0, vRepeat
  ]);
    // 4 corners of a 2x2 plane centered at (0, 0, 0) on the XZ floor
  const vertices = new Float32Array([
    -size, 0, -size,
     size, 0, -size,
     size, 0,  size,
    -size, 0,  size
  ]);

  const indices = new Uint16Array([
    0, 3, 2,
    0, 2, 1 
  ]);

 
  return {
    positions: vertices, normals, tangents, texCoords, indices
  };
}  

function createCylinder(segments = 64, uRepeat = 3) {
  const positions = [], normals = [], tangents = [], texCoords = [], indices = [];

  // Side: theta grows with u, so T points along the circle and B = cross(N, T) points up
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, theta = 2 * Math.PI * u;
    const s = Math.sin(theta), c = Math.cos(theta);
    for (const y of [-1, 1]) {
      positions.push(s, y, c);
      normals.push(s, 0, c);
      tangents.push(c, 0, -s);
      texCoords.push(u * uRepeat, (y + 1) / 2);
    }
  }
  for (let i = 0; i < segments; i++) {
    const k = 2 * i;
    indices.push(k, k + 2, k + 3, k, k + 3, k + 1);
  }

  // Caps: planar mapping of x, z into the texture, T = +x on both
  for (const y of [1, -1]) {
    const center = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, y, 0);
    tangents.push(1, 0, 0);
    texCoords.push(0.5, 0.5);
    for (let i = 0; i <= segments; i++) {
      const theta = 2 * Math.PI * i / segments;
      const s = Math.sin(theta), c = Math.cos(theta);
      positions.push(s, y, c);
      normals.push(0, y, 0);
      tangents.push(1, 0, 0);
      texCoords.push(0.5 + 0.5 * s, 0.5 - 0.5 * y * c);  // keeps cross(N, T) along +v
    }
    for (let i = 0; i < segments; i++) {
      const a = center + 1 + i, b = a + 1;
      if (y > 0) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function createSphere(segment, radius) {
  const position = [];
  const normals = [];
  const tangents = [];
  const texCoords = [];
  const indices = [];

  const latitudeBands = segment;
  const longitudeBands = segment;

  for (let lat = 0; lat <= latitudeBands; lat++) {
    const theta = lat * Math.PI / latitudeBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= longitudeBands; lon++) {
      const phi = lon * 2 * Math.PI / longitudeBands;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const x = cosPhi * sinTheta;
      const y = cosTheta;
      const z = sinPhi * sinTheta;

      position.push(radius * x, radius * y, radius * z);
      normals.push(x, y, z);

      // Tangent: direction of increasing U
      tangents.push(-sinPhi, 0, cosPhi);

      const u = lon / longitudeBands;
      const v = lat / latitudeBands;
      texCoords.push(u, v);
    }
  }

  for (let lat = 0; lat < latitudeBands; lat++) {
    for (let lon = 0; lon < longitudeBands; lon++) {
      const first = lat * (longitudeBands + 1) + lon;
      const second = first + longitudeBands + 1;

      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    positions: new Float32Array(position),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function createOctagon() {
  const positions = [];
  const normals = [];
  const indices = [];
  const tangents = [];
  const texCoords = [];

  const ring = [
    [0, 1], [0.70710678, 0.70710678],
    [1, 0], [0.70710678, -0.70710678],
    [0, -1], [-0.70710678, -0.70710678],
    [-1, 0], [-0.70710678, 0.70710678]
  ];

  function addFace(vertices, normal, tangent, uvs) {
    const start = positions.length / 3;

    for (let i = 0; i < vertices.length; i++) {
      positions.push(...vertices[i]);
      normals.push(...normal);
      tangents.push(...tangent);
      texCoords.push(...uvs[i]);
    }

    for (let i = 1; i < vertices.length - 1; i++) {
      indices.push(start, start + i, start + i + 1);
    }
  }

  // Front face
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;

    const vertices = [
      [0, 0, 0.5],
      [ring[next][0], ring[next][1], 0.5],
      [ring[i][0], ring[i][1], 0.5]
    ];

    addFace(
      vertices,
      [0, 0, 1],
      [1, 0, 0],
      vertices.map(v => [(v[0] + 1) / 2, (v[1] + 1) / 2])
    );
  }

  // Back face
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;

    const vertices = [
      [0, 0, -0.5],
      [ring[i][0], ring[i][1], -0.5],
      [ring[next][0], ring[next][1], -0.5]
    ];

    addFace(
      vertices,
      [0, 0, -1],
      [-1, 0, 0],
      vertices.map(v => [(1 - v[0]) / 2, (v[1] + 1) / 2])
    );
  }

  // Eight side faces
  for (let i = 0; i < 8; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % 8];

    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const length = Math.hypot(ex, ey);

    // Outward-facing normal
    const nx = -ey / length;
    const ny = ex / length;

    const tx = ex / length;
    const ty = ey / length;

    const vertices = [
      [a[0], a[1], 0.5],
      [b[0], b[1], 0.5],
      [b[0], b[1], -0.5],
      [a[0], a[1], -0.5]
    ];

    addFace(
      vertices,
      [nx, ny, 0],
      [tx, ty, 0],
      [
        [0, 0],
        [length, 0],
        [length, 1],
        [0, 1]
      ]
    );
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function createTorus(R, r, segMajor, segMinor) {
  //  vertex per (i, j) grid point → segMajor × segMinor vertices
  const positions = [];
  // Unit vector from tube center to surface point — needed for lighting
  const colors = [];
  // Each grid cell is a quad split into 2 triangles. The modulo wraps around so the ring closes seamlessly.
  const indices = [];
  const normals = [];
  const tangents = [];
  const texCoords = [];

  // i moves around the large/main circle of the torus.
  // j moves around the smaller tube of the torus.
  // Together, i and j create a 2D grid of points
  // that is wrapped into the shape of a torus.
  for (let i = 0; i < segMajor; i++) {
    for (let j = 0; j < segMinor; j++) {
       // u = angle around the large/main ring.
       // v = angle around the smaller tube.
       // Math.PI * 2 = 360-degree.
      const u = (i / segMajor) * Math.PI * 2;  
      const v = (j / segMinor) * Math.PI * 2; 
      
      // cu and su describe the position around the circle torus.
       // cv and sv describe the position around the radiouse.
      const cu = Math.cos(u), su = Math.sin(u);
      const cv = Math.cos(v), sv = Math.sin(v);

      // The torus equation:
      // x = (R + r*cos(v)) * cos(u)
      // y = r*sin(v)
      // z = (R + r*cos(v)) * sin(u)
      // Position
      positions.push(
        (R + r * cv) * cu,
        r * sv,
        (R + r * cv) * su
      );

      // Normal
      normals.push(
        cv * cu,
        sv,
        cv * su
      );

      // Tangent: direction of increasing U
      tangents.push(
        -su,
        0,
        cu
      );

      // Texture coordinates
      const texU = i / segMajor;
      const texV = j / segMinor;

      texCoords.push(texU, texV);

      // Normal points outward from tube center to surface
      // Tube center at ring distance R from origin:
      const wave1 = Math.sin(u * 5.0 + v * 3.0);
      const wave2 = Math.cos(u * 11.0 - v * 7.0) * 0.5;
      
      // Normalized heat intensity from 0.0 (charcoal) to 1.0 (white hot)
      let heat = 0.5 + 0.5 * ((wave1 + wave2) / 1.5);
      
      // Boost heat on the inner ring of the torus for a dense core
      heat = Math.min(1.0, heat * 1.15);

      // Color mapping curve:
      // Red rises fast (dominant warm base)
      const red = Math.min(1.0, heat * 1.8); 
      // Green rises exponentially (creates deep orange -> bright yellow)
      const green = Math.pow(heat, 2.8); 
      // Blue spikes only at peak temperatures (white-hot core)
      const blue = Math.pow(heat, 7.0); 

      colors.push(red, green, blue);
    }
  }

  // Indices: each quad becomes two very small triangles
  for (let i = 0; i < segMajor; i++) {
    for (let j = 0; j < segMinor; j++) {
      // a,b,c are the vertex that make the triangles
      const a = i * segMinor + j;
      const b = i * segMinor + (j + 1) % segMinor;
      const c = ((i + 1) % segMajor) * segMinor + j;
      // d is the diagonal vertex of the quad
      const d = ((i + 1) % segMajor) * segMinor + (j + 1) % segMinor;

      // 1st triangle
      indices.push(a, b, c);
      // 2nd triangle
      indices.push(b, d, c);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    colors: new Float32Array(colors),
    indices: new Uint16Array(indices)
  };
}
function createDisk(segments = 64) {
    const positions = [0, 0, 0];
    const normals = [0, 1, 0];
    const tangents = [1, 0, 0];
    const texCoords = [0.5, 0.5];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;

        const x = Math.cos(angle);
        const z = Math.sin(angle);

        positions.push(x, 0, z);
        normals.push(0, 1, 0);
        tangents.push(1, 0, 0);

        texCoords.push(
            (x + 1) / 2,
            (1 - z) / 2
        );
    }

    for (let i = 1; i <= segments; i++) {
        indices.push(0, i + 1, i);
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        tangents: new Float32Array(tangents),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices)
    };
}


function createPond(segments = 128, width = 6, depth = 4) {

    const positions = [];
    const normals = [];
    const tangents = [];
    const texCoords = [];
    const indices = [];

    const rings = 12;

    // Generate concentric rings from the center to shoreline
    for (let ring = 0; ring <= rings; ring++) {

        const r = ring / rings;

        for (let i = 0; i <= segments; i++) {

            const angle = (i / segments) * Math.PI * 2;

            // Smooth, irregular shoreline
            const irregularity =
                1.0 +
                0.10 * Math.sin(3.0 * angle) +
                0.06 * Math.cos(2.0 * angle) +
                0.035 * Math.sin(5.0 * angle) +
                0.025 * Math.cos(7.0 * angle);

            const radius = r * irregularity;

            const x = width * radius * Math.cos(angle);
            const z = depth * radius * Math.sin(angle);

            // Very subtle water surface movement
            const y =
                0.025 * Math.sin(x * 1.2) *
                Math.cos(z * 1.4);

            positions.push(x, y, z);

            // Approximate upward-facing surface normal
            normals.push(0, 1, 0);

            tangents.push(1, 0, 0);

            // Texture coordinates
            texCoords.push(
                0.5 + x / (width * 2),
                0.5 - z / (depth * 2)
            );

            if (ring > 0 && i > 0) {

                const current = ring * (segments + 1) + i;
                const previous = current - (segments + 1);

                indices.push(
                    previous - 1,
                    current - 1,
                    previous,

                    previous,
                    current - 1,
                    current
                );
            }
        }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        tangents: new Float32Array(tangents),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices)
    };
}


function createMountain(width = 50, depth = 12, segments = 100) {

    const positions = [];
    const normals = [];
    const tangents = [];
    const texCoords = [];
    const indices = [];

    // Deterministic terrain noise
    function noise(x, z) {
        return (
            Math.sin(x * 0.35 + z * 0.2) *
            Math.cos(z * 0.45 - x * 0.15) * 0.5 +
            Math.sin(x * 0.8 + z * 0.6) * 0.25 +
            Math.cos(x * 1.4 - z * 0.8) * 0.15
        );
    }

    function getHeight(x, z) {

        // Several mountain peaks along the ridge
        const peak1 = 8.0 * Math.exp(-Math.pow((x + 35) / 12, 2));
        const peak2 = 11.0 * Math.exp(-Math.pow((x + 12) / 10, 2));
        const peak3 = 9.0 * Math.exp(-Math.pow((x - 12) / 11, 2));
        const peak4 = 12.0 * Math.exp(-Math.pow((x - 35) / 13, 2));

        const ridge = peak1 + peak2 + peak3 + peak4;

        // Fade mountain height towards the front and back
        const depthFactor = Math.sin(Math.PI * z / depth);

        // Add subtle rocky variation
        const rockyDetail = noise(x, z) * 1.2;

        return Math.max(
            0,
            ridge * depthFactor + rockyDetail * depthFactor
        );
    }

    // Generate vertices
    for (let i = 0; i <= segments; i++) {

        for (let j = 0; j <= segments; j++) {

            const x = (j / segments - 0.5) * width;
            const z = (i / segments) * depth;

            const y = getHeight(x, z);

            positions.push(x, y, z);

            // Calculate consistent surface normals
            const e = 0.05;

            const dx = (
                getHeight(x + e, z) -
                getHeight(x - e, z)
            ) / (2 * e);

            const dz = (
                getHeight(x, z + e) -
                getHeight(x, z - e)
            ) / (2 * e);

            const length = Math.hypot(dx, 1, dz);

            normals.push(
                -dx / length,
                 1 / length,
                -dz / length
            );

            // Tangent
            const tangentLength = Math.hypot(1, dx);

            tangents.push(
                1 / tangentLength,
                dx / tangentLength,
                0
            );

            // Texture coordinates
            texCoords.push(
                j / segments * 6,
                i / segments * 3
            );
        }
    }

    // Generate triangles
    for (let i = 0; i < segments; i++) {

        for (let j = 0; j < segments; j++) {

            const a = i * (segments + 1) + j;
            const b = a + 1;
            const c = a + segments + 1;
            const d = c + 1;

            indices.push(a, c, b);
            indices.push(b, c, d);
        }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        tangents: new Float32Array(tangents),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices)
    };
}

// Cone (for fir trees): base radius 1 at y = 0, tip at y = 1
function createCone(segments = 32, uRepeat = 2) {
  const positions = [], normals = [], tangents = [], texCoords = [], indices = [];

  // Side: one vertex at the base and one at the tip for every step around the circle
  for (let i = 0; i <= segments; i++) {
    const u = i / segments, theta = 2 * Math.PI * u;
    const s = Math.sin(theta), c = Math.cos(theta);
    // slope normal: radius 1, height 1, so it points 45 degrees up
    const n = [s / Math.SQRT2, 1 / Math.SQRT2, c / Math.SQRT2];

    positions.push(s, 0, c);          // base
    normals.push(n[0], n[1], n[2]);
    tangents.push(c, 0, -s);
    texCoords.push(u * uRepeat, 0);

    positions.push(0, 1, 0);          // tip
    normals.push(n[0], n[1], n[2]);
    tangents.push(c, 0, -s);
    texCoords.push(u * uRepeat, 1);
  }
  for (let i = 0; i < segments; i++) {
    const k = 2 * i;
    indices.push(k, k + 2, k + 3, k, k + 3, k + 1);
  }

  // Bottom cap (facing down)
  const center = positions.length / 3;
  positions.push(0, 0, 0);
  normals.push(0, -1, 0);
  tangents.push(1, 0, 0);
  texCoords.push(0.5, 0.5);
  for (let i = 0; i <= segments; i++) {
    const theta = 2 * Math.PI * i / segments;
    const s = Math.sin(theta), c = Math.cos(theta);
    positions.push(s, 0, c);
    normals.push(0, -1, 0);
    tangents.push(1, 0, 0);
    texCoords.push(0.5 + 0.5 * s, 0.5 + 0.5 * c);
  }
  for (let i = 0; i < segments; i++) {
    indices.push(center, center + 2 + i, center + 1 + i);
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

// Aspen crown: many small flat oval leaves scattered in an egg shape, all in ONE mesh
// (one draw call for the whole crown instead of one per leaf).
// Every vertex of a leaf gets the same random number in texCoord.x; the shader uses it to
// give each leaf its own shade of green (and, in the fall, its own time to turn yellow).
function createLeafCluster(leafCount, rx, ry, rz) {
  const positions = [], normals = [], tangents = [], texCoords = [], indices = [];
  const sides = 12;         // each leaf is a 12-sided oval

  for (let n = 0; n < leafCount; n++) {
    // a random point inside the egg, not too close to the middle (leaves grow on the outside)
    let x, y, z, d;
    do {
      x = Math.random() * 2 - 1;
      y = Math.random() * 2 - 1;
      z = Math.random() * 2 - 1;
      d = x * x + y * y + z * z;
    } while (d > 1 || d < 0.3);
    const cx = x * rx, cy = y * ry, cz = z * rz;

    // a random direction for the leaf to face
    let nx = Math.random() * 2 - 1, ny = Math.random() * 2 - 1, nz = Math.random() * 2 - 1;
    let len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= len; ny /= len; nz /= len;

    // two directions flat on the leaf: u (along the leaf) = normal x up, v = normal x u
    let ux = nz, uy = 0, uz = -nx;                // cross(normal, up)
    len = Math.sqrt(ux * ux + uz * uz);
    if (len < 0.01) { ux = 1; uz = 0; len = 1; }  // leaf facing straight up or down
    ux /= len; uz /= len;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;

    const size = 0.8 + Math.random() * 0.4;
    const leafLength = 0.15 * size, leafWidth = 0.1 * size;
    const shade = Math.random();

    // fan of triangles: center, then the points around the oval
    const start = positions.length / 3;
    positions.push(cx, cy, cz);
    normals.push(nx, ny, nz);
    tangents.push(ux, uy, uz);
    texCoords.push(shade, 0.5);
    for (let i = 0; i <= sides; i++) {
      const t = 2 * Math.PI * i / sides;
      const a = Math.cos(t) * leafLength, b = Math.sin(t) * leafWidth;
      positions.push(cx + a * ux + b * vx, cy + a * uy + b * vy, cz + a * uz + b * vz);
      normals.push(nx, ny, nz);
      tangents.push(ux, uy, uz);
      texCoords.push(shade, 0.5);
      if (i > 0) indices.push(start, start + i, start + i + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    tangents: new Float32Array(tangents),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

function terrainHeight(x, z) {
    // Flat area underneath the pond
    const pondRadius = 8;
    if (Math.sqrt(x * x + z * z) < pondRadius) {
        return 0;
    }
    // Natural rolling terrain
    let h =
        0.7 * Math.sin(x * 0.08) * Math.cos(z * 0.07) +
        0.5 * Math.sin(x * 0.16 + z * 0.1) +
        0.7 * Math.cos(z * 0.2);
    // Raise terrain gradually towards the mountains
    const mountainDistance = Math.abs(z + 60);
    const mountainBase = 1.0 * Math.exp(-(mountainDistance * mountainDistance) / 500);
    h += mountainBase;

    return h;
}
function createTerrain(size, resolution) {

    const positions = [];
    const normals = [];
    const tangents = [];
    const texCoords = [];
    const indices = [];
    const height = terrainHeight;

    const step = size / resolution;

    for (let z = 0; z <= resolution; z++) {
        for (let x = 0; x <= resolution; x++) {

            const px = -size / 2 + x * step;
            const pz = -size / 2 + z * step;

            const py = height(px, pz);

            positions.push(px, py, pz);

            // Calculate terrain normals
            const hL = height(px - 0.1, pz);
            const hR = height(px + 0.1, pz);
            const hD = height(px, pz - 0.1);
            const hU = height(px, pz + 0.1);

            const nx = hL - hR;
            const ny = 0.2;
            const nz = hD - hU;

            const length = Math.sqrt(
                nx * nx + ny * ny + nz * nz
            );

            normals.push(
                nx / length,
                ny / length,
                nz / length
            );

            tangents.push(1, 0, 0);

            texCoords.push(
                x / resolution * 10,
                z / resolution * 10
            );
        }
    }

    for (let z = 0; z < resolution; z++) {
        for (let x = 0; x < resolution; x++) {

            const i = z * (resolution + 1) + x;

            indices.push(
                i,
                i + resolution + 1,
                i + 1,

                i + 1,
                i + resolution + 1,
                i + resolution + 2
            );
        }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        tangents: new Float32Array(tangents),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices)
    };
}

function createGround(size, pondRadius, segments, tiles)
{
    const y = 0;
    const n = Math.ceil(segments/4)*4;

    const positions = [];
    const normals = [];
    const tangents = [];
    const texCoords = [];
    const indices = [];

    function addVertex(x, z)
    {
        positions.push(x, y, z);
        normals.push(0, 1, 0);
        tangents.push(1, 0, 0);
        texCoords.push(((x+size)/(2*size))*tiles, ((z+size)/(2*size))*tiles);
    }

    for(let i=0; i<n; i++)
    {
        const a = Math.PI/4 + (i*2*Math.PI)/n;
        addVertex(pondRadius*Math.cos(a), pondRadius*Math.sin(a));
    }

    for(let i=0; i<n; i++)
    {
        const a = Math.PI/4 + (i*2*Math.PI)/n;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const m = Math.max(Math.abs(c), Math.abs(s));
        addVertex((size*c)/m, (size*s)/m);
    }

    for(let i=0; i<n; i++)
    {
        const j = (i+1)%n;
        const innerI = i;
        const innerJ = j;
        const outerI = n + i;
        const outerJ = n + j;
        indices.push(innerI, outerJ, outerI);
        indices.push(innerI, innerJ, outerJ);
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        tangents: new Float32Array(tangents),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices)
    };
}

function createCircularPavement(innerRadius, outerRadius, segments, uvScale)
{
    const y = 0;
    const n = Math.ceil(segments/4)*4;

    const positions = [];
    const normals = [];
    const tangents = [];
    const texCoords = [];
    const indices = [];

    function addVertex(x, z)
    {
        positions.push(x, y, z);
        normals.push(0, 1, 0);
        tangents.push(1, 0, 0);
        texCoords.push(x*uvScale, z*uvScale);
    }

    for(let i=0; i<n; i++)
    {
        const a = Math.PI/4 + (i*2*Math.PI)/n;
        addVertex(innerRadius*Math.cos(a), innerRadius*Math.sin(a));
    }

    for(let i=0; i<n; i++)
    {
        const a = Math.PI/4 + (i*2*Math.PI)/n;
        addVertex(outerRadius*Math.cos(a), outerRadius*Math.sin(a));
    }

    for(let i=0; i<n; i++)
    {
        const j = (i+1)%n;
        const innerI = i;
        const innerJ = j;
        const outerI = n + i;
        const outerJ = n + j;
        indices.push(innerI, outerJ, outerI);
        indices.push(innerI, innerJ, outerJ);
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        tangents: new Float32Array(tangents),
        texCoords: new Float32Array(texCoords),
        indices: new Uint16Array(indices)
    };
}

function createStars(count = 1500, radius = 130) {
    const positions = [];
    const sizes = [];
    const phases = [];

    for (let i = 0; i < count; i++) {

        const angle = Math.random() * Math.PI * 2;

        const y = Math.random();

        const horizontal = Math.sqrt(1 - y * y);

        const x = horizontal * Math.cos(angle);
        const z = horizontal * Math.sin(angle);

        positions.push(
            radius * x,
            radius * y,
            radius * z
        );

        sizes.push(2.0 + Math.random() * 3.0);

        phases.push(Math.random() * Math.PI * 2);
    }

    return {
        positions: new Float32Array(positions),
        sizes: new Float32Array(sizes),
        phases: new Float32Array(phases),
        count: count
    };
}