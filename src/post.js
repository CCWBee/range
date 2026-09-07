// RANGE post pipeline: render to an offscreen buffer, pull a bloom from the bright parts at a
// third resolution, then grade and tone map to the canvas. Spec section 5.8: the targets are sized
// from the renderer's drawing buffer, not from innerWidth, so the stress mode at pixel ratio 2
// measures the real render, and the scene target carries four samples so alpha-tested clutter
// still resolves cleanly.
import * as THREE from '../vendor/three.module.js';

const POST_VERTEX = `
varying vec2 uvp;
void main() {
  uvp = position.xy + 0.5;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0);
}`;

const BLUR_FRAGMENT = `
varying vec2 uvp;
uniform sampler2D image;
uniform vec2 direction;
uniform float threshold;
void main() {
  vec3 col = vec3(0.0);
  for (int i = -4; i <= 4; i++) {
    vec3 c = texture2D(image, uvp + direction * float(i) * 2.0).rgb;
    c = max(vec3(0.0), c - vec3(threshold));
    col += c * (1.0 - abs(float(i)) * 0.16);
  }
  gl_FragColor = vec4(col / 5.8, 1.0);
}`;

const FINAL_FRAGMENT = `
varying vec2 uvp;
uniform sampler2D image;
uniform sampler2D bloom;
uniform float time;
uniform float flash;
void main() {
  vec3 col = texture2D(image, uvp).rgb + texture2D(bloom, uvp).rgb * 0.4;
  col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), 0.12);
  col *= vec3(0.97, 1.0, 1.025);
  float vignette = 1.0 - 0.21 * pow(length((uvp - 0.5) * 1.3), 2.0);
  col *= vignette;
  col += flash * 0.025;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  float grain = fract(sin(dot(uvp + time, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor.rgb += (grain - 0.5) * 0.012;
}`;

export class Post {
  constructor(renderer, quadGeometry) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.sceneTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType, samples: 4,
    });
    this.bloomA = new THREE.WebGLRenderTarget(Math.max(1, Math.floor(size.x / 3)), Math.max(1, Math.floor(size.y / 3)), {
      type: THREE.HalfFloatType, depthBuffer: false,
    });
    this.bloomB = this.bloomA.clone();
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    this.camera.position.z = 1;
    this.blur = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        image: { value: this.sceneTarget.texture },
        direction: { value: new THREE.Vector2(1 / this.bloomA.width, 0) },
        threshold: { value: 1 },
      },
      vertexShader: POST_VERTEX, fragmentShader: BLUR_FRAGMENT,
    });
    this.final = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        image: { value: this.sceneTarget.texture },
        bloom: { value: this.bloomB.texture },
        time: { value: 0 },
        flash: { value: 0 },
      },
      vertexShader: POST_VERTEX, fragmentShader: FINAL_FRAGMENT,
    });
    this.quad = new THREE.Mesh(quadGeometry, this.final);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  // Called on resize and whenever the pixel ratio changes, so the buffers always match the canvas.
  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.sceneTarget.setSize(size.x, size.y);
    const w = Math.max(1, Math.floor(size.x / 3));
    const h = Math.max(1, Math.floor(size.y / 3));
    this.bloomA.setSize(w, h);
    this.bloomB.setSize(w, h);
  }

  render(scene, camera, elapsed, flash) {
    const renderer = this.renderer;
    renderer.setRenderTarget(this.sceneTarget);
    renderer.render(scene, camera);

    this.quad.material = this.blur;
    this.blur.uniforms.image.value = this.sceneTarget.texture;
    this.blur.uniforms.direction.value.set(1 / this.bloomA.width, 0);
    this.blur.uniforms.threshold.value = 1.05;
    renderer.setRenderTarget(this.bloomA);
    renderer.render(this.scene, this.camera);

    this.blur.uniforms.image.value = this.bloomA.texture;
    this.blur.uniforms.direction.value.set(0, 1 / this.bloomA.height);
    this.blur.uniforms.threshold.value = 0;
    renderer.setRenderTarget(this.bloomB);
    renderer.render(this.scene, this.camera);

    this.quad.material = this.final;
    this.final.uniforms.time.value = elapsed;
    this.final.uniforms.flash.value = flash;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }
}
