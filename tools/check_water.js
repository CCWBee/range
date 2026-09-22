// Fixed sea poses for judging the water in Brave (docs/specs/2026-09-23-water-tiling.md). Paste into
// the console of a loaded bundle, or evaluate through the browser extension, then call
// seaPose('open80') and so on and screenshot. The extension's tab reports itself hidden, so frames
// are drawn with range.renderOnce. Works on both bundles; on the phone the touch layer stages it.
(() => {
  const POSES = {
    open80: [5200, 80, -3200, 95, -4],       // low over open water east of the island, sun side
    open350: [4000, 350, -3000, 90, -10],    // where the lattice showed plainest
    open1000: [5000, 1000, -2500, 100, -18], // high, a wide field of sea to the horizon
    coast: [2600, 60, -5200, 170, -3],       // a low pass beside the east coast, the shelf in view
  };
  window.seaPose = (name, time = 40) => {
    const [x, y, z, heading, pitch] = POSES[name];
    const r = window.range, touch = document.body.classList.contains('touch');
    if (touch) r.touchDemo('cloud'); else r.stage('cloud');
    const f = r.flight;
    f.position.set(x, y, z);
    const euler = new (r.camera.rotation.constructor)(pitch * Math.PI / 180, -heading * Math.PI / 180, 0, 'YXZ');
    f.attitude.copy(new f.attitude.constructor().setFromEuler(euler));
    f.velocity.set(0, 0, -200).applyQuaternion(f.attitude);
    for (let i = 0; i < 90; i++) r.renderOnce(1 / 60);    // let the chase camera settle behind
    // The same wave phase in every shot: world.update writes the main loop's clock into the
    // uniform, so set it afterwards and draw through the post chain directly.
    r.world.oceanMaterial.uniforms.time.value = time;
    r.post.render(r.scene, r.camera, time, 0);
    return { pose: name, position: f.position.toArray().map(Math.round), time };
  };
  return Object.keys(POSES);
})();
