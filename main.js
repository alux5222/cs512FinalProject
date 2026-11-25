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
uniform int uMapping;  // 0 = bump mapping, 1 = normal mapping, 3 = animated texture
uniform float uLightIntensity;

out vec4 fragColor;

const float bumpScale = 3.0;

// convert RGB to luminance (Rec._601 standard, https://en.wikipedia.org/wiki/Rec._601)
// or you can use a height map texture
float height(vec2 uv) {
  vec3 c = texture(uTexture, uv).rgb;
  return 1.0 - dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {

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
  float spec = pow(max(dot(V, R), 0.0), shininess);

  vec3 sunColor = vec3(1.0, 1.0, 0.9);


  vec3 ambient = Ka * (0.5 + 0.5 * uLightIntensity);
  vec3 diffuse = sunColor * Kd * diff * uLightIntensity;
  vec3 specular = sunColor * Ks * spec * uLightIntensity;

  fragColor = vec4(ambient + diffuse + specular, 1.0);

  //fragColor = vec4(Ka + sunColor * Kd * diff + sunColor * Ks * spec, 1.0);
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

gl.useProgram(program);

const uModelView = gl.getUniformLocation(program, "uModelView");
const uProjection = gl.getUniformLocation(program, "uProjection");
const uLightDir = gl.getUniformLocation(program, "uLightDir");
const uMapping = gl.getUniformLocation(program, "uMapping");
const uLightIntensity = gl.getUniformLocation(program, "uLightIntensity");

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

const groundMesh = createMesh(createGround(50, 15, 128, 40));
const pondMesh = createMesh(createPond(128, 6, 6.5));
const mountainMesh = createMesh(createMountain(100, 22, 180));
const sunMesh = createMesh(createSphere(100,4));

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
const waterTexture = loadAnimatedTexture("images/water.mp4");
const mountainTexture = loadTexture("images/mountain(1).jpg");
const sunTexture = loadAnimatedTexture("images/sun.mp4");

const BUMP_MAPPING = 0, NORMAL_MAPPING = 1, EMISSIVE_MAPPING = 3;

const sunPosition = [0, 12, -40];

const objects = [
  { mesh: groundMesh, texture: groundTexture, mapping: BUMP_MAPPING, offset: [0, 0, 0] },
//   { mesh: pondMesh, texture: waterTexture.texture, animatedTexture: waterTexture, mapping: BUMP_MAPPING, offset: [0, 0.2, 0] },
  { mesh: mountainMesh, texture: mountainTexture, mapping: BUMP_MAPPING, offset: [0, terrainHeight(0, -60)-2, -60] },
  { mesh: sunMesh, texture: sunTexture.texture, animatedTexture: sunTexture, mapping: EMISSIVE_MAPPING, offset: sunPosition }
];

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
        200
    );
}

window.addEventListener("resize", resizeCanvas);

resizeCanvas();

// Interactive controls
let dragRotX = 0.3, dragRotY = 0;
let camX = 0, camY = -2, camZ = -50;

let mouseDown = false, lastX, lastY;
canvas.addEventListener("mousedown", e => { mouseDown = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => mouseDown = false);
window.addEventListener("mousemove", e => {
  if (!mouseDown) return;
  dragRotY += (e.clientX - lastX) * 0.01;
  dragRotX += (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
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
  e.preventDefault();
});

function getDaylight() {

    return Math.max(
        0.5,
        Math.min(1.0, (sunPosition[1] + 5) / 30)
    );
}

// Render loop
function render(time) {
  const t = time / 1000;
  updateSun(t);
  updateSky();

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  const view = translate(camX, camY, camZ);
  gl.uniformMatrix4fv(uProjection, false, projection);


  const rotation = multiply(rotateY(dragRotY), rotateX(dragRotX));
      // Update sunlight direction based on sun position
  // gl.uniform3fv(uLightDir, transformPoint(rotation, sunPosition));
  // Update sunlight direction
const lightLength = Math.hypot(
    sunPosition[0],
    sunPosition[1],
    sunPosition[2]
);

const lightDirection = [
    sunPosition[0] / lightLength,
    sunPosition[1] / lightLength,
    sunPosition[2] / lightLength
];
const rotatedLight = transformPoint(rotation, [
    lightDirection[0],
    lightDirection[1],
    lightDirection[2]
]);

// gl.uniform3fv(
//     uLightDir,
//     transformPoint(rotation, lightDirection)
// );
// gl.uniform3fv(uLightDir, rotatedLight);
gl.uniform3fv(uLightDir, [0.0, 1.0, 0.0]);
  gl.uniform1f(uLightIntensity, getDaylight());


  gl.activeTexture(gl.TEXTURE0);
  for (const { mesh, texture, animatedTexture, mapping, offset } of objects) {

    if (animatedTexture) updateAnimatedTexture(animatedTexture);

    const model = multiply(rotation, translate(...offset));
    gl.uniformMatrix4fv(uModelView, false, multiply(view,model));

    gl.uniform1i(uMapping, mapping);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
  requestAnimationFrame(render);
}

function updateSun(t) {
    // Length of one complete day/night cycle
    const dayDuration = 50;
    // Sun angle
    const angle = (t / dayDuration) * Math.PI * 2;
    // Sun distance from the scene
    const distance = 100;
    // Sun moves across the horizon
    sunPosition[0] = Math.cos(angle) * distance;
    sunPosition[1] = Math.sin(angle) * 45;
    sunPosition[2] = -65;
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
requestAnimationFrame(render);