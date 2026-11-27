const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec3 aTangent;
in vec2 aTexCoord;

uniform mat4 uModelView;
uniform mat4 uProjection;

uniform mat4 uModel;
uniform mat4 uLightSpaceMatrix;
uniform float uTime;

out vec3 vPosition;
out vec3 vNormal;
out vec3 vTangent;
out vec2 vTexCoord;
out vec4 vLightSpacePosition;

void main() {

  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;

  // Inverse transpose for potential non-uniform scalings
  mat3 mv = mat3(uModelView);
  vNormal = transpose(inverse(mv)) * aNormal;

  vLightSpacePosition = uLightSpaceMatrix * uModel * vec4(aPosition, 1.0);

  vTangent = mv * aTangent;
  vTexCoord = aTexCoord;
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 vLightSpacePosition;
in vec3 vPosition;
in vec3 vNormal;
in vec3 vTangent;
in vec2 vTexCoord;

uniform highp sampler2D uShadowMap;
uniform vec3 uLightDir;
uniform sampler2D uTexture;
uniform int uMapping;  // 0 = bump mapping, 1 = normal mapping, 2 = solid color, 3 = animated texture, 4 = glowing color (lamps), 5 = aspen leaves, 6 = aspen bark
uniform vec3 uColor;   // used by modes 2 and 4
uniform float uLightIntensity;
uniform float uTime;
uniform vec3 uWaterColor;

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


float calculateShadow(vec4 lightSpacePosition, vec3 N, vec3 L) {

    // Convert from clip space to normalized device coordinates
    vec3 projected = lightSpacePosition.xyz /
                     lightSpacePosition.w;

    // Convert from [-1, 1] to [0, 1]
    projected = projected * 0.5 + 0.5;

    // Outside the shadow map's boundaries
    if (projected.x < 0.0 || projected.x > 1.0 ||
        projected.y < 0.0 || projected.y > 1.0 ||
        projected.z < 0.0 || projected.z > 1.0) {

        return 0.0;
    }

    // Closest surface to the light
    float closestDepth =
        texture(uShadowMap, projected.xy).r;

    // Depth of the current fragment
    float currentDepth = projected.z;

    // Prevent self-shadowing artifacts
    float bias = max(
        0.0005 * (1.0 - dot(N, L)),
        0.0001
    );
    float shadow =currentDepth - bias > closestDepth ? 1.0 : 0.0;
    return shadow;
}
// PROCEDURAL WATER FUNCTIONS
// float waterHeight(vec2 p, float t) {
//     float h = 0.0;
//     h += 0.045 * sin(
//         dot(p, vec2(1.0, 0.5)) * 3.0 + t * 1.2
//     );
//     h += 0.025 * sin(
//         dot(p, vec2(-0.7, 1.0)) * 4.5 + t * 1.7
//     );
//     h += 0.015 * sin(
//         dot(p, vec2(0.8, -1.0)) * 7.0 + t * 2.0
//     );
//     h += 0.008 * sin(
//         p.x * 12.0 + t * 2.5
//     ) * cos(
//         p.y * 10.0 - t * 1.8
//     );
//     return h;
// }

float waterHeight(vec2 p, float t) {

    float h = 0.0;

    // Gentle background waves
    h += 0.015 * sin(
        dot(p, vec2(1.0, 0.5)) * 3.0 + t * 1.2
    );

    h += 0.010 * sin(
        dot(p, vec2(-0.7, 1.0)) * 4.5 + t * 1.7
    );

    // Central fountain ripples
    float centerDistance = length(p);

    float centerRipple = sin(
        centerDistance * 12.0 - t * 5.0
    );

    float centerFade = exp(-centerDistance * 1.5);

    h += centerRipple * 0.018 * centerFade;

    // Water impact zone around the fountain
    float impactRadius = 0.35;

    float impactDistance = abs(
        centerDistance - impactRadius
    );

    float impactRipple = sin(
        impactDistance * 45.0 - t * 8.0
    );
    float impactFade = exp(-impactDistance * 5.0);
    h += impactRipple * 0.012 * impactFade;
    return h;
}
// Calculate animated water normals
vec3 calculateWaterNormal(vec2 uv, float time) {

    float e = 0.003;

    float hL = waterHeight(uv - vec2(e, 0.0), time);
    float hR = waterHeight(uv + vec2(e, 0.0), time);

    float hD = waterHeight(uv - vec2(0.0, e), time);
    float hU = waterHeight(uv + vec2(0.0, e), time);

    float dx = (hR - hL) / (2.0 * e);
    float dy = (hU - hD) / (2.0 * e);

    return normalize(vec3(-dx, -dy, 1.0));
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
  if (uMapping == 7) {
        // Animated water surface normals
        vec2 waterUV = (vTexCoord - vec2(0.5)) * 5.0;
        vec3 waterN = calculateWaterNormal(waterUV, uTime);
        N = normalize(TBN * waterN);
        vec3 L = normalize(uLightDir);
        vec3 V = normalize(-vPosition);

        // Fresnel reflection
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // Water diffuse lighting
        float diffuse = max(dot(N, L), 0.0);
        // Sunlight / moonlight reflection
        vec3 H = normalize(L + V);
        float specular = pow(max(dot(N, H), 0.0), 100.0);
        // Deep water color
        vec3 deepWater = uWaterColor;
        // Approximation of reflected sky color
        vec3 reflectedSky = mix(vec3(0.015, 0.025, 0.065),vec3(0.35, 0.60, 0.72),uLightIntensity);
        // Fresnel blending
        vec3 waterColor = mix(deepWater, reflectedSky, fresnel * 0.75);
        // Ambient lighting
        vec3 ambient = waterColor * 0.45;
        // Diffuse lighting
        vec3 diffuseLight = waterColor * uLightColor * diffuse * uLightIntensity;
        // Sharp reflective highlights
        vec3 specularLight = uLightColor * specular * uLightIntensity * 1.8;
        // Moonlight should produce softer highlights
        if (uLightIntensity < 0.3) {specularLight *= 0.35;}
        // Shadows
        float shadow = calculateShadow(vLightSpacePosition, N, L);
        vec3 finalWater = ambient + (1.0 - shadow) * (diffuseLight + specularLight);
        fragColor = vec4(finalWater, 1.0);
        return;
    }
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

    float shadow = calculateShadow(vLightSpacePosition, N, L);

    fragColor = vec4(ambient + (1.0 - shadow) * (diffuse + specular) + lampLight * uLampStrength, 1.0);
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

const SHADOW_VERTEX_SHADER = `#version 300 es

in vec3 aPosition;

uniform mat4 uLightSpaceMatrix;
uniform mat4 uModel;

void main() {
    gl_Position = uLightSpaceMatrix *
                  uModel *
                  vec4(aPosition, 1.0);
}
`;

const SHADOW_FRAGMENT_SHADER = `#version 300 es

precision highp float;

void main() {
    // Depth is automatically written by WebGL
}
`;

const SKY_VERTEX_SHADER = `#version 300 es

in vec3 aPosition;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vDirection;

void main() {

    vDirection = aPosition;

    gl_Position = uProjection *
                  uModelView *
                  vec4(aPosition, 1.0);

    // Keep the sky at the farthest depth
    gl_Position.z = gl_Position.w;
}
`;

const SKY_FRAGMENT_SHADER = `#version 300 es

precision highp float;

in vec3 vDirection;

uniform float uDaylight;
uniform vec3 uSunDirection;
// cloud uniforms
uniform float uTime;
uniform float uCloudCoverage;
uniform float uCloudSpeed;

out vec4 fragColor;

// random hash function for generating noise
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {

    vec2 i = floor(p);
    vec2 f = fract(p);

    // Random values at the four corners
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    // Smooth interpolation
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(a, b, u.x),
        mix(c, d, u.x),
        u.y
    );
}

// Fractal Brownian Motion (fBm) for cloud generation
float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += amplitude * noise(p);
        // Increase frequency
        p *= 2.0;
        // Reduce amplitude
        amplitude *= 0.5;
    }
    return value;
}
void main() {
    vec3 direction = normalize(vDirection);

    // 0 at the horizon, 1 directly overhead
    float height = clamp(direction.y, 0.0, 1.0);

    // Daytime colors
    vec3 dayHorizon = vec3(0.75, 0.88, 0.98);
    vec3 dayZenith = vec3(0.10, 0.35, 0.75);

    // Nighttime colors
    vec3 nightHorizon = vec3(0.04, 0.06, 0.14);
    vec3 nightZenith = vec3(0.005, 0.01, 0.04);
    // Sunrise and sunset color
    vec3 sunsetHorizon = vec3(1.0, 0.35, 0.08);
    vec3 horizon = mix(nightHorizon, dayHorizon, uDaylight);
    vec3 zenith = mix(nightZenith, dayZenith, uDaylight);
    // Sunrise and sunset intensity
    float twilight = 1.0 - smoothstep(0.0, 0.35, abs(uSunDirection.y));
    // Concentrate sunset colors toward the sun
    float sunFacing = max(dot(direction, uSunDirection), 0.0);
    horizon = mix(horizon, sunsetHorizon, twilight * pow(sunFacing, 2.0));
    // Atmospheric gradient
    vec3 skyColor = mix(horizon, zenith, pow(height, 0.6));
    // Only generate clouds above the horizon
    if (direction.y > 0.0) {
        // Project the viewing direction onto a cloud layer
        vec2 cloudUV = direction.xz / max(direction.y, 0.08);
        // Cloud formation scale
        cloudUV *= 1.5;
        // Animate clouds using wind
        cloudUV += vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.3);
        // Generate procedural cloud density
        float cloudNoise = fbm(cloudUV);
        // Convert noise into cloud formations
        float cloud = smoothstep(1.0 - uCloudCoverage,1.0 - uCloudCoverage + 0.15,cloudNoise);
        // Fade clouds near the horizon
        cloud *= smoothstep(0.03, 0.15, direction.y);
        // Cloud colors
        vec3 dayCloudColor = vec3(0.98, 0.98, 1.0);
        vec3 nightCloudColor = vec3(0.06, 0.07, 0.12);
        vec3 sunsetCloudColor = vec3(1.0, 0.55, 0.3);
        vec3 cloudColor = mix(nightCloudColor, dayCloudColor, uDaylight);
        // Warm cloud colors near sunrise and sunset
        cloudColor = mix(cloudColor, sunsetCloudColor, twilight * sunFacing * 0.8);
        // Simulate variations in cloud density
        cloudColor *= 0.75 + 0.25 * cloudNoise;
        // Blend clouds with atmospheric sky
        skyColor = mix(skyColor, cloudColor, cloud * 0.9);
    }
    fragColor = vec4(skyColor, 1.0);
}`;
const GLASS_VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vPosition;
out vec3 vNormal;

void main() {

  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;
  vNormal = mat3(uModelView) * aNormal;
  gl_Position = uProjection * p;
}
`;
const GLASS_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vPosition;
in vec3 vNormal;
uniform mat4 uCameraTurn;
uniform samplerCube uEnvMap;
uniform float uDaylight;
out vec4 fragColor;
void main() {
  vec3 N = normalize(vNormal);
  vec3 I = normalize(vPosition);
  if(dot(N, I) > 0.0) N=-N;
  vec3 R = reflect(I, N);
  vec3 worldR = transpose(mat3(uCameraTurn))*R;
  vec3 reflection = texture(uEnvMap, worldR).rgb;
  float frensel = pow(1.0 - max(dot(N, -I), 0.0), 4.0);
  vec3 tint = vec3(0.10, 0.18, 0.22) * (0.3+0.7*uDaylight);
  vec3 color = mix(tint, reflection, mix(0.1, 1.0, frensel));
  float alpha = mix(0.2, 0.95, frensel);
  fragColor = vec4(color, alpha);
}`;
const FOUNTAIN_VERTEX_SHADER = `#version 300 es
precision highp float;
in float aParticleID;
uniform mat4 uModelView;
uniform mat4 uProjection;
uniform float uTime;
out float vAlpha;

void main() {
    float id = aParticleID;
    // Distribute particles around the fountain
    float angle = id * 2.399963;
    // Alternate between central jet and outer sprays
    float sprayType = step(0.65, fract(id * 0.37));
    float lifetime = mix(1.2, 1.8, fract(id * 0.83));
    float t = mod(uTime * 0.9 + id * 0.13, lifetime);
    // Central stream
    float centralSpeed = 7.0;
    // Outer spray
    float spraySpeed = 5.0;
    float horizontalSpeed = mix(0.0, 2.0, sprayType);
    float speed = 1.5 + fract(id * 0.37) * 2.0;
    // Gravity
    float y = 7.0 * t - 4.9 * t * t;
    // Outward movement
    float distance = horizontalSpeed * t;
    // Slightly curved spray trajectories
    float x = cos(angle) * distance;
    float z = sin(angle) * distance;
    // Slight horizontal turbulence
    x += 0.08 * sin(t * 5.0 + id * 2.0);
    z += 0.08 * cos(t * 4.0 + id * 1.5);
    // Hide droplets below the water
    if (y < 0.0) {
        y = -100.0;
    }
    vec3 position = vec3(x, y, z);
    vec4 viewPosition = uModelView * vec4(position, 1.0);
    gl_Position = uProjection * viewPosition;
    // Larger particles near the camera
    gl_PointSize = clamp(9.0 / max(-viewPosition.z, 1.0),3.0,8.0);
    vAlpha = 1.0 - smoothstep(0.0, lifetime, t);
}`;
const FOUNTAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vAlpha;
out vec4 fragColor;
void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    // Elongated droplet shape
    uv.y *= 1.7;
    float dist = length(uv);
    if (dist > 0.5) discard;
    // Bright center
    float center = 1.0 - smoothstep(0.0, 0.25, dist);
    // Soft outer edge
    float edge = 1.0 - smoothstep(0.2, 0.5, dist);
    // Water color
    vec3 waterColor = mix(vec3(0.35, 0.65, 0.85),vec3(0.85, 0.95, 1.0),center);
    float alpha = edge * vAlpha * 0.85;
    fragColor = vec4(waterColor, alpha);
}`;
const FOUNTAIN_STREAM_VERTEX_SHADER = `#version 300 es
precision highp float;
uniform mat4 uModelView;
uniform mat4 uProjection;
uniform float uTime;
out float vAcross;
out float vHeight;
void main() {
    // Six vertices form a camera-facing vertical strip
    vec2 corners[6] = vec2[6](
        vec2(-1.0, 0.0),
        vec2( 1.0, 0.0),
        vec2(-1.0, 1.0),
        vec2(-1.0, 1.0),
        vec2( 1.0, 0.0),
        vec2( 1.0, 1.0)
    );
    vec2 corner = corners[gl_VertexID];
    float height = corner.y * 4.5;
    // Narrower toward the top
    float width = mix(0.12, 0.025, corner.y);
    // Subtle stream movement
    float wobble = sin(corner.y * 8.0 - uTime * 5.0) * 0.018 * corner.y;
    vec4 position = uModelView * vec4(0.0, height, 0.0, 1.0);
    // Offset horizontally in camera space
    position.x += corner.x * width + wobble;
    gl_Position = uProjection * position;
    vAcross = corner.x;
    vHeight = corner.y;
}`;
const FOUNTAIN_STREAM_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in float vAcross;
in float vHeight;
out vec4 fragColor;
void main() {
    // Softer edges
    float edge = 1.0 - smoothstep(  0.65, 1.0, abs(vAcross));
    // Bright central highlight
    float highlight = exp(-vAcross * vAcross * 18.0);
    // Slight transparency variation along the stream
    float alpha = edge * (0.45 + highlight * 0.35);
    // Fade the very top slightly
    alpha *= 1.0 - 0.2 * vHeight;
    vec3 waterColor = mix(vec3(0.30, 0.65, 0.85),vec3(0.85, 0.96, 1.0),highlight);
    fragColor = vec4(waterColor, alpha);
}`;
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
const program = createProgram(VERTEX_SHADER,FRAGMENT_SHADER);
const starProgram = createProgram(STAR_VERTEX_SHADER,STAR_FRAGMENT_SHADER);
const shadowProgram = createProgram(SHADOW_VERTEX_SHADER,SHADOW_FRAGMENT_SHADER);
const skyProgram = createProgram(SKY_VERTEX_SHADER,SKY_FRAGMENT_SHADER);
const glassProgram = createProgram(GLASS_VERTEX_SHADER,GLASS_FRAGMENT_SHADER);
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
const uModel = gl.getUniformLocation(program, "uModel");
const uLightSpaceMatrix = gl.getUniformLocation(program, "uLightSpaceMatrix");
const uShadowMap = gl.getUniformLocation(program, "uShadowMap");
const uTime = gl.getUniformLocation(program,"uTime");
const uWaterColor = gl.getUniformLocation(program,"uWaterColor");
const starUniforms = {uModelView: gl.getUniformLocation(starProgram, "uModelView"),uProjection: gl.getUniformLocation(starProgram, "uProjection"),uTime: gl.getUniformLocation(starProgram, "uTime"),uVisibility: gl.getUniformLocation(starProgram, "uVisibility")};
const shadowUniforms = {uLightSpaceMatrix: gl.getUniformLocation(shadowProgram, "uLightSpaceMatrix"),uModel: gl.getUniformLocation(shadowProgram, "uModel")};
const skyUniforms = {
  uModelView: gl.getUniformLocation(skyProgram, "uModelView"),
  uProjection: gl.getUniformLocation(skyProgram, "uProjection"),
  uDaylight: gl.getUniformLocation(skyProgram, "uDaylight"),
  uSunDirection: gl.getUniformLocation(skyProgram, "uSunDirection"),
  // cloud uniforms
  uCloudCoverage: gl.getUniformLocation(skyProgram, "uCloudCoverage"),
  uCloudSpeed: gl.getUniformLocation(skyProgram, "uCloudSpeed"),
};
const glassUniforms = {
    uModelView: gl.getUniformLocation(glassProgram, "uModelView"),
    uProjection: gl.getUniformLocation(glassProgram, "uProjection"),
    uCameraTurn: gl.getUniformLocation(glassProgram, "uCameraTurn"),
    uEnvMap: gl.getUniformLocation(glassProgram, "uEnvMap"),
    uDaylight: gl.getUniformLocation(glassProgram, "uDaylight"),
};
gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
gl.uniform1f(uLightIntensity, 1.0);
const fountainProgram = createProgram(FOUNTAIN_VERTEX_SHADER,FOUNTAIN_FRAGMENT_SHADER);
const fountainStreamProgram = createProgram(
    FOUNTAIN_STREAM_VERTEX_SHADER,
    FOUNTAIN_STREAM_FRAGMENT_SHADER
);
const fountainStreamUniforms = {
    uModelView: gl.getUniformLocation(fountainStreamProgram, "uModelView"),
    uProjection: gl.getUniformLocation(fountainStreamProgram, "uProjection"),
    uTime: gl.getUniformLocation(fountainStreamProgram, "uTime" )
};
const fountainUniforms = {uModelView: gl.getUniformLocation(fountainProgram, "uModelView"),
    uProjection: gl.getUniformLocation(fountainProgram, "uProjection"),
    uTime: gl.getUniformLocation(fountainProgram, "uTime")
};
function createFountainParticles(count = 300) {
    const particles = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        particles[i] = i;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER,particles,gl.STATIC_DRAW);
    const location = gl.getAttribLocation(fountainProgram, "aParticleID");
    gl.vertexAttribPointer(location, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(location);
    gl.bindVertexArray(null);
    return {vao,count};
}
const fountainParticles = createFountainParticles(300);
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
        const location = gl.getAttribLocation(starProgram, name);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
        gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
        gl.enableVertexAttribArray(location);
    }
    bind("aPosition", starData.positions, 3);
    bind("aSize", starData.sizes, 1);
    bind("aPhase", starData.phases, 1);
    gl.bindVertexArray(null);
    return {vao: vao,count: starData.count};
}
function createShadowMap(size) {
    const framebuffer = gl.createFramebuffer();
    const depthTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24,size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D, depthTexture, 0);
    gl.drawBuffers([gl.NONE]);
    gl.readBuffer(gl.NONE);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Shadow framebuffer is incomplete");
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return { framebuffer, depthTexture, size };
}
function loadAnimatedTexture(url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Temporary pixel until the video is ready
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0, 100, 200, 255]));
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
    return {texture: texture,video: video,lastTime: -1};
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
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,video);
    animatedTexture.lastTime = video.currentTime;
}
const SHADOW_MAP_SIZE = 2048;
const shadowMap = createShadowMap(SHADOW_MAP_SIZE);
console.log("Shadow map:", shadowMap);
const PondRadius = 15;
const groundMesh = createMesh(createGround(90, PondRadius, 128, 40));
const circularPavementMesh = createMesh(createCircularPavement(PondRadius+1, PondRadius+1+8, 128, 0.2));
const grasslandMesh = createMesh(createGround(70, PondRadius+9, 128, 40));
const house = createBuilding({width:20, depth:50, wallHeight:16, wallT:0.5, floorT:0.3,
    roofT:0.4, overhang:1, windowsFront:1, windowsSide:2, windowW:10, windowH:12, sillH:1, uvScale:0.2});
const wallMesh = createMesh(house.walls);
const floorMesh = createMesh(house.floor);
const roofMesh = createMesh(house.roof);
const houseMeshes = new Set([wallMesh, floorMesh, roofMesh]);
const glassMesh = createMesh(createWindowGlass(house.windows, 0.1, 0.02));
const pondMesh = createMesh(createPond(128, PondRadius, PondRadius));
const mountainMesh = createMesh(createMountain(150, 22, 180));
const sunMesh = createMesh(createSphere(100,4));
const moonMesh = createMesh(createSphere(100,4));
const starMesh = createStarMesh(createStars(2500, 130));
const skyMesh = createMesh(createSphere(64, 200));
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
const grassTexture = loadTexture("images/grass.avif");
const waterTexture = loadAnimatedTexture("images/water.mp4");
const mountainTexture = loadTexture("images/mountain(1).jpg");
const sunTexture = loadAnimatedTexture("images/sun.mp4");
const moonTexture = loadTexture("images/moon.jpg");
const wallTexture = loadTexture("images/wall.webp");
const roofTexture = loadTexture("images/roof.avif");
const floorTexture = loadTexture("images/roof.avif");
// const BUMP_MAPPING = 0, NORMAL_MAPPING = 1, EMISSIVE_MAPPING = 3;
const BUMP_MAPPING = 0;
const NORMAL_MAPPING = 1;
const EMISSIVE_MAPPING = 3;
const WATER_MAPPING = 7;
const sunPosition = [0, 12, -40];
const moonPosition = [0, 0, 85];
const DAY_DURATION = 50;
const NIGHT_DURATION = 50;
const HORIZONTAL_RADIUS = 85;
const VERTICAL_RADIUS = 85;
let isDaytime = true;
const objects = [
  { mesh: groundMesh, texture: groundTexture, mapping: BUMP_MAPPING, offset: [0, 0, 0] },
  { mesh: circularPavementMesh, texture: pavementTexture, mapping: BUMP_MAPPING, offset: [0, 0.05, 0] },
  { mesh: grasslandMesh, texture: grassTexture, mapping: BUMP_MAPPING, offset: [0, 0.05, 0] },
  { mesh: wallMesh, texture: wallTexture, mapping: BUMP_MAPPING, offset: [-80, 0, -45] },
  { mesh: floorMesh, texture: floorTexture, mapping: BUMP_MAPPING, offset: [-80, 0, -45] },
  { mesh: roofMesh, texture: roofTexture, mapping: BUMP_MAPPING, offset: [-80, 0, -45] },
  { mesh: pondMesh,texture: groundTexture,mapping: WATER_MAPPING,offset: [0, -0.1, 0]},
  { mesh: mountainMesh, texture: mountainTexture, mapping: BUMP_MAPPING, offset: [0, terrainHeight(0, -60)-2, -90] },
  { mesh: sunMesh, texture: sunTexture.texture, animatedTexture: sunTexture, mapping: EMISSIVE_MAPPING, offset: sunPosition },
  { mesh: moonMesh, texture: moonTexture, mapping: EMISSIVE_MAPPING, offset: moonPosition }

];
const glassObjects = [{mesh: glassMesh, offset: [-80, 0, -45]}];
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
    projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 300);
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
  //world-space transofrmation for shadows
  gl.uniformMatrix4fv(uModel, false, model);
  // Camera-space transformation for normal rendering
  gl.uniformMatrix4fv(uModelView, false, multiply(view, multiply(rotation, model)));
  gl.uniform1i(uMapping, part.mapping);
  gl.uniform3fv(uColor, part.color);
  gl.bindTexture(gl.TEXTURE_2D, part.texture);
  gl.bindVertexArray(part.mesh.vao);
  gl.drawElements(gl.TRIANGLES, part.mesh.count, gl.UNSIGNED_SHORT, 0);
}
function drawShadowPart(part, model) {
    gl.uniformMatrix4fv(shadowUniforms.uModel, false, model);
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

    gl.uniform3fv(uLightDir,transformPoint(cameraTurn, lightPosition));
    gl.uniform3fv(uLightColor, lightColor);
    gl.uniform1f(uLightIntensity, intensity);
}
//creates a virtual camera that follows the direction of sun or moon and looks toward the center of environment
function getLightSpaceMatrix() {
    // Select the active light source
    const lightPosition = isDaytime
        ? sunPosition
        : moonPosition;
    // Normalize the light direction
    const length = Math.hypot(...lightPosition);
    const lightDirection = [
        lightPosition[0] / length,
        lightPosition[1] / length,
        lightPosition[2] / length
    ];
    // Position the virtual light camera
    const lightEye = lightDirection.map(v => v * 150);
    const target = [0, 0, 0];
    const up = [1, 0, 0];
    const lightView = lookAt(lightEye, target, up);
    const lightProjection = orthographic(-80, 80,-80, 80,0.1, 300);
    return multiply(lightProjection, lightView);
}
function renderShadowMap(lightSpaceMatrix) {
    gl.useProgram(shadowProgram);
    // Unbind the shadow texture from texture unit 1 to avoid sampling it while rendering into it
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowMap.framebuffer);
    gl.viewport(0, 0, shadowMap.size, shadowMap.size);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(shadowUniforms.uLightSpaceMatrix, false, lightSpaceMatrix);
    for (const { mesh, offset } of objects) {
        if (mesh === sunMesh || mesh === moonMesh) continue;
        drawShadowPart({ mesh }, translate(...offset));
    }
    drawForest(forest, treeParts, drawShadowPart);
    drawLamps(lamps, treeParts, drawShadowPart);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.bindVertexArray(null);
    gl.useProgram(program);
}
function drawSky(t) {
    gl.useProgram(skyProgram);
    gl.uniformMatrix4fv(skyUniforms.uModelView, false, cameraTurn);
    gl.uniformMatrix4fv(skyUniforms.uProjection, false, projection);
    gl.uniform1f(skyUniforms.uDaylight, getDaylight());
    gl.uniform1f(skyUniforms.uTime, t);
    gl.uniform1f(skyUniforms.uCloudCoverage, 0.55);
    gl.uniform1f(skyUniforms.uCloudSpeed, 0.04);

    const length = Math.hypot(...sunPosition);
    const sunDirection = sunPosition.map(v => v / length);
    gl.uniform3fv(skyUniforms.uSunDirection, isDaytime ? sunDirection : [0, -1, 0]);

    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(skyMesh.vao);
    gl.drawElements(gl.TRIANGLES, skyMesh.count, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.useProgram(program);
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
    gl.drawArrays(gl.POINTS,0,starMesh.count);
    // Restore WebGL settings
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    // Return to the original shader
    gl.useProgram(program);
}
function drawGlass(){
    gl.useProgram(glassProgram);
    gl.uniformMatrix4fv(glassUniforms.uProjection, false, projection);
    gl.uniformMatrix4fv(glassUniforms.uCameraTurn, false, cameraTurn);
    gl.uniform1f(glassUniforms.uDaylight, getDaylight());
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, reflection.texture);
    gl.uniform1i(glassUniforms.uEnvMap, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    for (const { mesh, offset } of glassObjects) {
        const model = multiply(rotation, translate(...offset));
        gl.uniformMatrix4fv(glassUniforms.uModelView, false, multiply(view, model));
        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(program);
}
function drawFountain(t) {
    gl.useProgram(fountainProgram);
    gl.uniformMatrix4fv(fountainUniforms.uProjection,false, projection);
    // Fountain is positioned at the pond center
    const fountainModel = translate(0, 0, 0);
    gl.uniformMatrix4fv(fountainUniforms.uModelView,false,multiply(view,multiply(rotation, fountainModel)));
    gl.uniform1f(fountainUniforms.uTime, t);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.bindVertexArray(fountainParticles.vao);
    gl.drawArrays(gl.POINTS,0, fountainParticles.count);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.useProgram(program);
}
function drawFountainStream(t) {
    gl.useProgram(fountainStreamProgram);
    gl.uniformMatrix4fv(fountainStreamUniforms.uProjection,false,projection);
    const model = translate(0, -0.1, 0);
    gl.uniformMatrix4fv(fountainStreamUniforms.uModelView,false,multiply(view,multiply(rotation, model)));
    gl.uniform1f(fountainStreamUniforms.uTime, t);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
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
const REFLECTION_SIZE = 256;
const REFLECTION_UPDATE_EVERY = 4;
let reflectionFrame = 0;
const reflection = {texture: gl.createTexture(),framebuffer: gl.createFramebuffer(),depth: gl.createRenderbuffer(),};
function initiateReflection(){
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, reflection.texture);
    for(let i=0; i<6; i++)
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+i, 0, gl.RGBA8, REFLECTION_SIZE, REFLECTION_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, reflection.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, REFLECTION_SIZE, REFLECTION_SIZE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, reflection.framebuffer);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, reflection.depth);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X, reflection.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
initiateReflection();
function updateReflectionCube(t){
  const saved = {view, rotation, cameraTurn, projection};
  gl.bindFramebuffer(gl.FRAMEBUFFER, reflection.framebuffer);
  gl.viewport(0, 0, REFLECTION_SIZE, REFLECTION_SIZE);
  gl.enable(gl.DEPTH_TEST);
  gl.depthMask(true);
  for(let face=0; face<6; face++){
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X+face, reflection.texture, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const faceRotation = FACE_ROTATIONS[face];
    rotation = IDENTITY;
    cameraTurn = faceRotation;
    view = multiply(faceRotation, translate(-reflectionCenter[0], -reflectionCenter[1], -reflectionCenter[2]));
    projection = REFLECTION_PROJECTION;
    drawSky(t);
    gl.useProgram(program);
    gl.uniformMatrix4fv(uProjection, false, projection);
    updateLighting();
    updateLamps();
    gl.activeTexture(gl.TEXTURE0);
    for(const {mesh, texture, mapping, offset} of objects){
      if(houseMeshes.has(mesh)) continue;
      if(mesh === sunMesh && !isDaytime) continue;
      if(mesh === moonMesh && isDaytime) continue;
      gl.uniformMatrix4fv(uModel, false, translate(...offset));
      if(mesh === sunMesh || mesh === moonMesh){
        gl.uniformMatrix4fv(uModelView, false, multiply(cameraTurn, translate(...offset)));
      }else{
        const model = multiply(rotation, translate(...offset));
        gl.uniformMatrix4fv(uModelView, false, multiply(view, model));
      }
      gl.uniform1i(uMapping, mapping);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    }
    drawForest(forest, treeParts, drawPart);
    drawLamps(lamps, treeParts, drawPart);
    drawStars(t);
  }
  ({view, rotation, cameraTurn, projection} = saved);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.bindVertexArray(null);
}
// Render loop
function render(time) {
  const t = time / 1000;
  updateSunAndMoon(t);
  updateSky();
  keepCameraAboveGround(); 
  // generate the shadow map from the light's perspective
  const lightSpaceMatrix = getLightSpaceMatrix();
  renderShadowMap(lightSpaceMatrix);
  console.log("Shadow pass error:", gl.getError());
  // render the scene from the camera's perspective
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Send the light-space matrix to the main shader
  gl.uniformMatrix4fv(uLightSpaceMatrix,false,lightSpaceMatrix);
  // Bind the shadow map to texture unit 1
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D,shadowMap.depthTexture);
  gl.uniform1i(uShadowMap, 1);
  // Restore texture unit 0 for regular textures
  gl.activeTexture(gl.TEXTURE0);
  // camera: spin and tilt around the scene, then (if dragged past level) look up
  const tilt = Math.max(dragRotX, MIN_TILT);
  const lookUp = Math.min(dragRotX - MIN_TILT, 0);       // 0, or negative when looking up
  rotation = multiply(rotateX(tilt), rotateY(dragRotY));   // spin around the vertical axis, then tilt down
  view = multiply(rotateX(lookUp), translate(camX, camY, camZ));
  cameraTurn = multiply(rotateX(lookUp), rotation);
  drawSky(t);
  gl.uniformMatrix4fv(uProjection, false, projection);
  // update the lighting based on the sun and moon positions
  updateLighting();
  updateLamps();
    // Update procedural water
    gl.uniform1f(uTime, t);
    gl.uniform3f(uWaterColor,0.025,0.16,0.19);
  gl.activeTexture(gl.TEXTURE0);
  for (const { mesh, texture, animatedTexture, mapping, offset } of objects) {
    // Only show the sun during daytime
    if (mesh === sunMesh && !isDaytime) continue;
    // Only show the moon during nighttime
    if (mesh === moonMesh && isDaytime) continue;
    if (animatedTexture) updateAnimatedTexture(animatedTexture);
    // world-space model matrix for shadow calculation
    gl.uniformMatrix4fv(uModel, false, translate(...offset));
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
  drawFountainStream(t);
  drawFountain(t);
  if(reflectionFrame++ % REFLECTION_UPDATE_EVERY === 0) updateReflectionCube(t);
  drawGlass();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);