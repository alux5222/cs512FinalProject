const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aTangent;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec2 vTexCoord;

void main() {

  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;

  // Inverse transpose for potential non-uniform scalings
  mat3 mv = mat3(uModelView);
  vNormal = transpose(inverse(mv)) * aNormal;


  vTangent = mv * aTangent;
  vTexCoord = aTexCoord;
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec2 vTexCoord;

//uniform vec3 uLightPos;
uniform vec3 uLightDir;
uniform sampler2D uTexture;
uniform int uMapping;  // 0 = bump mapping, 1 = normal mapping, 2 = solid color, 3 = animated texture, 4 = glowing color (lamps), 5 = aspen leaves, 6 = aspen bark
uniform vec3 uColor;   // used by modes 2 and 4
uniform float uLightIntensity;

// added for moon and sun
uniform vec3 uLightColor;

// street lamps: point lights that turn on at night
const int NUM_LAMPS = 6;            // must match LAMP_ANGLES in trees.js
uniform vec3 uLampPos[NUM_LAMPS];   // bulb positions (camera space)
uniform vec3 uLampColor;            // warm yellow light
uniform float uLampStrength;        // 0 = off (day), 1 = fully on (night)

out vec4 fragColor;

const float bumpScale = 3.0;

// convert RGB to luminance (Rec._601 standard, https://en.wikipedia.org/wiki/Rec._601)
// or you can use a height map texture
float height(vec2 uv) {
  vec3 c = texture(uTexture, uv).rgb;
  return 1.0 - dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {

// Glowing solid color for the lamp bulbs (no lighting yet)
  if (uMapping == 4) {
      fragColor = vec4(uColor, 1.0);
      return;
  }

// Emissive texture for the sun
  if (uMapping == 3) {
      vec3 sun = texture(uTexture, vTexCoord).rgb;
      fragColor = vec4(sun * 1.4, 1.0);
      return;
  }

  // Tangent frame (T, B, N)
  vec3 N = normalize(vNormal);
  vec3 T = normalize(vTangent - dot(vTangent, N) * N);
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);

  vec3 baseColor;
  vec3 n;

  if (uMapping == 0) {
    // Bump mapping: tilt the normal against the gradient of the height field
    vec2 du = vec2(1.0 / float(textureSize(uTexture, 0).x), 0.0);
    vec2 dv = vec2(0.0, 1.0 / float(textureSize(uTexture, 0).y));
    float dhdu = (height(vTexCoord + du) - height(vTexCoord - du)) * 0.5;
    float dhdv = (height(vTexCoord + dv) - height(vTexCoord - dv)) * 0.5;
    n = normalize(vec3(-bumpScale * dhdu, -bumpScale * dhdv, 1.0));
    baseColor = texture(uTexture, vTexCoord).rgb;
    } else if (uMapping == 2) {
    // Solid color (fir needles, lamp poles)
    n = vec3(0.0, 0.0, 1.0);
    baseColor = uColor;
  } else if (uMapping == 5) {
    // Aspen leaves: texCoord.x is a random number for each leaf (see createLeafCluster),
    // so every leaf gets its own shade of green
    baseColor = mix(vec3(0.20, 0.40, 0.12), vec3(0.45, 0.62, 0.20), vTexCoord.x);
    n = vec3(0.0, 0.0, 1.0);
  } else if (uMapping == 6) {
    // Aspen bark: plain texture 
    baseColor = texture(uTexture, vTexCoord).rgb;
    n = vec3(0.0, 0.0, 1.0);
  } else {
    // Normal mapping: the texture stores the tangent-space normal in [0, 1]
    n = normalize(texture(uTexture, vTexCoord).rgb * 2.0 - 1.0);
    baseColor = vec3(0.85, 0.65, 0.3);
  }

  vec3 Ka = 0.2 * baseColor;
  vec3 Kd = 0.8 * baseColor;
  vec3 Ks = vec3(0.5);
  float shininess = 32.0;

  N = normalize(TBN * n);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(-vPosition);
  vec3 R = reflect(-L, N);

  float diff = max(dot(N, L), 0.0);
// Trees: soft lighting so parts facing away from the light don't go black.
  //   Leaves are thin, so light shows through from either side (abs).
  //   Aspen bark uses "half-Lambert": 0.5 + 0.5 * dot(N, L) instead of max(dot(N, L), 0).
  if (uMapping == 5) diff = 0.45 + 0.55 * abs(dot(N, L));
  if (uMapping == 6) diff = 0.5 + 0.5 * dot(N, L);
  float spec = pow(max(dot(V, R), 0.0), shininess);

  vec3 ambient = Ka * (0.5 + 0.5 * uLightIntensity);
  vec3 diffuse = uLightColor * Kd * diff * uLightIntensity;
  vec3 specular = uLightColor * Ks * spec * uLightIntensity;

   // STREET LAMPS: each bulb is a point light. Light gets weaker with distance (attenuation),
  // so every lamp lights a pool around itself.
  vec3 lampLight = vec3(0.0);
  for (int i = 0; i < NUM_LAMPS; i++) {
    vec3 toLamp = uLampPos[i] - vPosition;
    float d = length(toLamp);
    vec3 Ld = toLamp / d;
    float lampDiff = max(dot(N, Ld), 0.0);
    if (uMapping == 5) lampDiff = abs(dot(N, Ld));               // leaves: light from either side
    float attenuation = 1.0 / (1.0 + 0.1 * d + 0.03 * d * d);
    lampLight += uLampColor * Kd * lampDiff * attenuation;
  }

  fragColor = vec4(ambient + diffuse + specular + lampLight * uLampStrength, 1.0);
}
`;


// STAR Vertex Shader
const STAR_VERTEX_SHADER = `#version 300 es

in vec3 aPosition;
in float aSize;
in float aPhase;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform float uTime;

out float vBrightness;

void main() {
  gl_Position = uProjection * uModelView * vec4(aPosition, 1.0);

  gl_PointSize = aSize;

  // Twinkling animation
  vBrightness = 0.75 + 0.25 * sin(uTime * 2.0 + aPhase);
}
`;
// STAR Fragment Shader
const STAR_FRAGMENT_SHADER = `#version 300 es

precision mediump float;

in float vBrightness;

uniform float uVisibility;

out vec4 fragColor;

void main() {
  float dist = length(gl_PointCoord - vec2(0.5));

  if (dist > 0.5) {
    discard;
  }

  float glow = 1.0 - smoothstep(0.0, 0.5, dist);

  fragColor = vec4(vec3(0.9, 0.95, 1.0), glow * vBrightness * uVisibility);
}
`;



// WebGL setup
const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

const ATTRIBUTES = { aPosition: 0, aNormal: 1, aTexCoord: 2, aTangent: 3 };

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

const program = createProgram(
    VERTEX_SHADER,
    FRAGMENT_SHADER
);

const starProgram = createProgram(
    STAR_VERTEX_SHADER,
    STAR_FRAGMENT_SHADER
);

gl.useProgram(program);

const uModelView = gl.getUniformLocation(program, "uModelView");
const uProjection = gl.getUniformLocation(program, "uProjection");
const uLightDir = gl.getUniformLocation(program, "uLightDir");
const uMapping = gl.getUniformLocation(program, "uMapping");
const uLightIntensity = gl.getUniformLocation(program, "uLightIntensity");
const uLightColor = gl.getUniformLocation(program, "uLightColor");
const uColor = gl.getUniformLocation(program, "uColor");
const uLampPos = gl.getUniformLocation(program, "uLampPos");
const uLampColor = gl.getUniformLocation(program, "uLampColor");
const uLampStrength = gl.getUniformLocation(program, "uLampStrength");

const starUniforms = {
    uModelView: gl.getUniformLocation(starProgram, "uModelView"),
    uProjection: gl.getUniformLocation(starProgram, "uProjection"),
    uTime: gl.getUniformLocation(starProgram, "uTime"),
    uVisibility: gl.getUniformLocation(starProgram, "uVisibility")
};

const starUniforms = {
    uModelView: gl.getUniformLocation(starProgram, "uModelView"),
    uProjection: gl.getUniformLocation(starProgram, "uProjection"),
    uTime: gl.getUniformLocation(starProgram, "uTime"),
    uVisibility: gl.getUniformLocation(starProgram, "uVisibility")
};

gl.uniform1i(
    gl.getUniformLocation(program, "uTexture"), 0
);
gl.uniform1f(uLightIntensity, 1.0);

function bindAttribute(name, data, size) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], size, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, tangents, texCoords, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute("aPosition", positions, 3);
  bindAttribute("aNormal", normals, 3);
  bindAttribute("aTangent", tangents, 3);
  bindAttribute("aTexCoord", texCoords, 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

function createStarMesh(starData) {

    const vao = gl.createVertexArray();

    gl.bindVertexArray(vao);

    function bind(name, data, size) {

        const location = gl.getAttribLocation(
            starProgram, name
        );

        const buffer = gl.createBuffer();

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

        gl.bufferData(
            gl.ARRAY_BUFFER,
            data,
            gl.STATIC_DRAW
        );

        gl.vertexAttribPointer(
            location,
            size,
            gl.FLOAT,
            false,
            0,
            0
        );

        gl.enableVertexAttribArray(location);
    }

    bind("aPosition", starData.positions, 3);
    bind("aSize", starData.sizes, 1);
    bind("aPhase", starData.phases, 1);

    gl.bindVertexArray(null);

    return {
        vao: vao,
        count: starData.count
    };
}

function loadAnimatedTexture(url) {
    const texture = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Temporary pixel until the video is ready
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 100, 200, 255])
    );

    // Texture parameters
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Create the video
    const video = document.createElement("video");

    video.crossOrigin = "anonymous";
    video.src = url;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.playbackRate = 0.45;

    video.play().catch(console.warn);

    return {
        texture: texture,
        video: video,
        lastTime: -1
    };
}

function updateAnimatedTexture(animatedTexture) {
    const { texture, video } = animatedTexture;

    if (video.readyState < video.HAVE_CURRENT_DATA) {
        return;
    }

    // Avoid uploading the same playback time repeatedly
    if (video.currentTime === animatedTexture.lastTime) {
        return;
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        video
    );

    animatedTexture.lastTime = video.currentTime;
}

const PondRadius = 15;
const groundMesh = createMesh(createGround(50, PondRadius, 128, 40));
const circularPavementMesh = createMesh(createCircularPavement(PondRadius+1, PondRadius+1+8, 128, 0.2));
const pondMesh = createMesh(createPond(128, 6, 6.5));
const mountainMesh = createMesh(createMountain(100, 22, 180));
const sunMesh = createMesh(createSphere(100,4));
const moonMesh = createMesh(createSphere(100,4));
const starMesh = createStarMesh(createStars(2500, 130));

function loadTexture(url) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 255, 255]));

  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);  // images start at the top row, texture coordinates at the bottom
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  };
  image.src = url;
  return texture;
}
const groundTexture = loadTexture("images/mudground.webp");
const pavementTexture = loadTexture("images/pavement.webp");
const waterTexture = loadAnimatedTexture("images/water.mp4");
const mountainTexture = loadTexture("images/mountain(1).jpg");
const sunTexture = loadAnimatedTexture("images/sun.mp4");
const moonTexture = loadTexture("images/moon.jpg");

const BUMP_MAPPING = 0, NORMAL_MAPPING = 1, EMISSIVE_MAPPING = 3;

const sunPosition = [0, 12, -40];
const moonPosition = [0, 0, 85];
const DAY_DURATION = 30;
const NIGHT_DURATION = 30;

const HORIZONTAL_RADIUS = 85;
const VERTICAL_RADIUS = 85;

let isDaytime = true;

const objects = [
  { mesh: groundMesh, texture: groundTexture, mapping: BUMP_MAPPING, offset: [0, 0, 0] },
  { mesh: circularPavementMesh, texture: pavementTexture, mapping: BUMP_MAPPING, offset: [0, 0.05, 0] },
//   { mesh: pondMesh, texture: waterTexture.texture, animatedTexture: waterTexture, mapping: BUMP_MAPPING, offset: [0, 0.2, 0] },
  { mesh: mountainMesh, texture: mountainTexture, mapping: BUMP_MAPPING, offset: [0, terrainHeight(0, -60)-2, -60] },
  { mesh: sunMesh, texture: sunTexture.texture, animatedTexture: sunTexture, mapping: EMISSIVE_MAPPING, offset: sunPosition },
  { mesh: moonMesh, texture: moonTexture, mapping: EMISSIVE_MAPPING, offset: moonPosition }

];

// ---------- Tree parts (trees.js builds the trees and street lights out of these) ----------
const TREE_COLOR = 2, GLOW_COLOR = 4, ASPEN_LEAVES = 5, ASPEN_BARK = 6;
const coneMesh = createMesh(createCone(24, 2));
const branchMesh = createMesh(createCylinder(16, 1));
const ballMesh = createMesh(createSphere(10, 1));
const aspenBarkTexture = loadTexture("images/aspen_bark.jpg");
const firBarkTexture = loadTexture("images/fir_bark.jpg");

const treeParts = {
  aspenTrunk:  { mesh: branchMesh, texture: aspenBarkTexture, mapping: ASPEN_BARK,   color: [1, 1, 1] },
  aspenBranch: { mesh: branchMesh, texture: aspenBarkTexture, mapping: ASPEN_BARK,   color: [1, 1, 1] },
  // three different leaf crowns (random leaves), so the aspens don't all look the same
  aspenCrowns: [
    { mesh: createMesh(createLeafCluster(750, 1.3, 2.3, 1.3)), texture: aspenBarkTexture, mapping: ASPEN_LEAVES, color: [1, 1, 1] },
    { mesh: createMesh(createLeafCluster(750, 1.3, 2.3, 1.3)), texture: aspenBarkTexture, mapping: ASPEN_LEAVES, color: [1, 1, 1] },
    { mesh: createMesh(createLeafCluster(750, 1.3, 2.3, 1.3)), texture: aspenBarkTexture, mapping: ASPEN_LEAVES, color: [1, 1, 1] }
  ],
  firTrunk:    { mesh: branchMesh, texture: firBarkTexture,   mapping: BUMP_MAPPING, color: [1, 1, 1] },
  firNeedles:  { mesh: coneMesh,   texture: firBarkTexture,   mapping: TREE_COLOR,   color: [0.12, 0.30, 0.16] },
  lampPole:    { mesh: branchMesh, texture: firBarkTexture,   mapping: TREE_COLOR,   color: [0.15, 0.20, 0.17] },
  lampGlow:    { mesh: ballMesh,   texture: firBarkTexture,   mapping: GLOW_COLOR,   color: [1.0, 0.97, 0.85] }
};

const forest = createForest();
const lamps = createLamps();

// Street lamp light (the bulb sits 3.45 up the lamp, see drawLamp in trees.js)
const LAMP_BULB_HEIGHT = 3.45 * TREE_SCALE;
const LAMP_LIGHT_COLOR = [1.6, 1.25, 0.8];   // warm yellow, a bit strong so the pools show up

// Lamps turn on as the sun gets low, and stay on all night
function getLampStrength() {
  if (!isDaytime) return 1.0;
  return Math.min(1.0, Math.max(0.0, 1.0 - getDaylight() * 4));   // fades in at sunset, out at sunrise
}

// Send the lamp positions (in camera space) and brightness to the shader
function updateLamps() {
  const strength = getLampStrength();
  const toCamera = multiply(view, rotation);
  const positions = [];
  for (let i = 0; i < lamps.length; i++) {
    const p = transformPoint(toCamera, [lamps[i].x, lamps[i].y + LAMP_BULB_HEIGHT, lamps[i].z]);
    positions.push(p[0], p[1], p[2]);
  }
  gl.uniform3fv(uLampPos, new Float32Array(positions));
  gl.uniform3fv(uLampColor, LAMP_LIGHT_COLOR);
  gl.uniform1f(uLampStrength, strength);

  // the bulbs: plain grey glass by day, glowing warm at night
  treeParts.lampGlow.color = [0.55 + 0.45 * strength, 0.55 + 0.42 * strength, 0.55 + 0.3 * strength];
}

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.53, 0.81, 0.92, 1.0);

let projection;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);

    gl.viewport(0, 0, canvas.width, canvas.height);

    projection = perspective(
        Math.PI / 4,
        canvas.width / canvas.height,
        0.1,
        300
    );
}

window.addEventListener("resize", resizeCanvas);

resizeCanvas();

// Interactive controls
let dragRotX = 0.3, dragRotY = 0;
let camX = 0, camY = -2, camZ = -40;

// Camera limits: never look from below the ground
const MIN_TILT = 0.12;     // a little above level with the ground (radians)
const MAX_TILT = 1.4;      // looking almost straight down
const MIN_HEIGHT = 2;      // the camera stays at least this high above the ground
const MIN_ZOOM = -42, MAX_ZOOM = -5;   // -42: when you spin around, the camera stays in front of the mountains (they start 38 behind the middle)
const MAX_LOOK_UP = 1.2;   // how far past level the camera can look up (about 70 degrees)

function keepCameraAboveGround() {
  // up/down drag: only between level and looking down
  if (dragRotX < MIN_TILT - MAX_LOOK_UP) dragRotX = MIN_TILT - MAX_LOOK_UP;
  if (dragRotX > MAX_TILT) dragRotX = MAX_TILT;
  const tilt = Math.max(dragRotX, MIN_TILT);   // looking up turns the head, it doesn't lower the camera

  // zoom: not too far, and not past the middle of the scene
  if (camZ < MIN_ZOOM) camZ = MIN_ZOOM;
  if (camZ > MAX_ZOOM) camZ = MAX_ZOOM;

  // height of the camera above the ground (y = 0): undo the tilt and the move
  const height = -camY * Math.cos(tilt) - camZ * Math.sin(tilt);
  if (height < MIN_HEIGHT) {
    camY = -(MIN_HEIGHT + camZ * Math.sin(tilt)) / Math.cos(tilt);   // lift it back up
  }
}

let mouseDown = false, lastX, lastY;
canvas.addEventListener("mousedown", e => { mouseDown = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => mouseDown = false);
window.addEventListener("mousemove", e => {
  if (!mouseDown) return;
  dragRotY += (e.clientX - lastX) * 0.01;
  dragRotX += (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
  keepCameraAboveGround();
});

document.addEventListener("keydown", e => {
  const step = 0.2;
  switch (e.key) {
    case "ArrowUp": camY -= step; break;
    case "ArrowDown": camY += step; break;
    case "ArrowLeft": camX += step; break;
    case "ArrowRight": camX -= step; break;
    case "w": camZ += step; break;
    case "s": camZ -= step; break;
    default: return;
  }
  keepCameraAboveGround();
  e.preventDefault();
});

// The camera matrices, updated at the start of every frame in render()
let view = translate(camX, camY, camZ);
let rotation = multiply(rotateX(dragRotX), rotateY(dragRotY));   // spin around the vertical axis, then tilt down
let cameraTurn = rotation;   // every rotation of the camera (used to turn the sun direction)

// Draw one tree / street light part: model matrix -> camera -> shader
function drawPart(part, model) {
  gl.uniformMatrix4fv(uModelView, false, multiply(view, multiply(rotation, model)));
  gl.uniform1i(uMapping, part.mapping);
  gl.uniform3fv(uColor, part.color);
  gl.bindTexture(gl.TEXTURE_2D, part.texture);
  gl.bindVertexArray(part.mesh.vao);
  gl.drawElements(gl.TRIANGLES, part.mesh.count, gl.UNSIGNED_SHORT, 0);
}

function getDaylight() {
    if (!isDaytime) {
        return 0.0;
    }

    return Math.max(
        0.0,
        Math.min(1.0, sunPosition[1] / 20)
    );
}


// update the sun and moon positions based on the time of day
function updateSunAndMoon(t) {
    const cycleDuration = DAY_DURATION + NIGHT_DURATION;

    const cycleTime = t % cycleDuration;

    if (cycleTime < DAY_DURATION) {

        // Daytime
        isDaytime = true;

        const angle = (cycleTime / DAY_DURATION) * Math.PI;

        sunPosition[0] = 0;
        sunPosition[1] = VERTICAL_RADIUS * Math.sin(angle);
        sunPosition[2] = -HORIZONTAL_RADIUS * Math.cos(angle);

    } else {

        // Nighttime
        isDaytime = false;

        const nightTime = cycleTime - DAY_DURATION;

        const angle = (nightTime / NIGHT_DURATION) * Math.PI;

        moonPosition[0] = 0;
        moonPosition[1] = VERTICAL_RADIUS * Math.sin(angle);
        moonPosition[2] = -HORIZONTAL_RADIUS * Math.cos(angle);
    }
}

//This function will determine which object (sun or moon) should illuminate the environment.
function updateLighting() {
    const daylight = getDaylight();

    const sunColor = [1.0, 1.0, 0.9];
    const moonColor = [0.45, 0.55, 0.85];

    let lightPosition;
    let lightColor;
    let intensity;

    if (isDaytime) {
        // Daytime sunlight
        lightPosition = sunPosition;
        lightColor = sunColor;
        intensity = daylight;
    } else {
        // Nighttime moonlight
        lightPosition = moonPosition;
        lightColor = moonColor;
        intensity = 0.18 * Math.min(1.0, moonPosition[1] / 20);
    }

    gl.uniform3fv(
        uLightDir,
        transformPoint(cameraTurn, lightPosition)
    );

    gl.uniform3fv(uLightColor, lightColor);
    gl.uniform1f(uLightIntensity, intensity);
}

function drawStars(t) {

    // Stars gradually appear during sunset
    const visibility = 1.0 - getDaylight();
    if (visibility <= 0.01) {
        return;
    }

    // Switch to the star shader
    gl.useProgram(starProgram);
    gl.uniformMatrix4fv(starUniforms.uModelView, false, cameraTurn);
    gl.uniformMatrix4fv(starUniforms.uProjection, false, projection);
    gl.uniform1f(starUniforms.uTime, t);
    gl.uniform1f(starUniforms.uVisibility, visibility);
    // Enable transparency
    gl.enable(gl.BLEND);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Prevent transparent stars from writing depth
    gl.depthMask(false);

    gl.bindVertexArray(starMesh.vao);

    // Draw all stars in one draw call
    gl.drawArrays(
        gl.POINTS,
        0,
        starMesh.count
    );

    // Restore WebGL settings
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // Return to the original shader
    gl.useProgram(program);
}

function updateSky() {
    const daylight = getDaylight();

    const dayColor = [0.53, 0.81, 0.92];
    const sunsetColor = [0.95, 0.35, 0.12];
    const nightColor = [0.01, 0.02, 0.06];

    let from, to, factor;

    if (daylight > 0.5) {
        from = sunsetColor;
        to = dayColor;
        factor = (daylight - 0.5) * 2;
    } else {
        from = nightColor;
        to = sunsetColor;
        factor = daylight * 2;
    }

    const r = from[0] + (to[0] - from[0]) * factor;
    const g = from[1] + (to[1] - from[1]) * factor;
    const b = from[2] + (to[2] - from[2]) * factor;

    gl.clearColor(r, g, b, 1.0);
}

// Render loop
function render(time) {
  const t = time / 1000;


  updateSunAndMoon(t);
  updateSky();

  keepCameraAboveGround(); 

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // camera: spin and tilt around the scene, then (if dragged past level) look up
  const tilt = Math.max(dragRotX, MIN_TILT);
  const lookUp = Math.min(dragRotX - MIN_TILT, 0);       // 0, or negative when looking up

  rotation = multiply(rotateX(tilt), rotateY(dragRotY));   // spin around the vertical axis, then tilt down

  view = multiply(rotateX(lookUp), translate(camX, camY, camZ));
  cameraTurn = multiply(rotateX(lookUp), rotation);
  gl.uniformMatrix4fv(uProjection, false, projection);

  // update the lighting based on the sun and moon positions
  updateLighting();

  updateLamps();

  gl.activeTexture(gl.TEXTURE0);
  for (const { mesh, texture, animatedTexture, mapping, offset } of objects) {

    // Only show the sun during daytime
    if (mesh === sunMesh && !isDaytime) continue;
    // Only show the moon during nighttime
    if (mesh === moonMesh && isDaytime) continue;
    if (animatedTexture) updateAnimatedTexture(animatedTexture);

    // sun and moon is independent of the camera, so they don't rotate with it. The rest of the scene does rotate with the camera.
    if (mesh === sunMesh || mesh === moonMesh) {
      const model = multiply(cameraTurn, translate(...offset));
      gl.uniformMatrix4fv(uModelView, false, model);
    } else {
      const model = multiply(rotation, translate(...offset));
      gl.uniformMatrix4fv(uModelView, false, multiply(view, model));

    }

    gl.uniform1i(uMapping, mapping);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  // trees and street lights (trees.js)
  drawForest(forest, treeParts, drawPart);
  drawLamps(lamps, treeParts, drawPart);
  drawStars(t);
  
  requestAnimationFrame(render);
}
requestAnimationFrame(render);