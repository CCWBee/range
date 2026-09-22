// In-page checks for the 22 September polish, run in Brave (paste into the console of a loaded
// bundle, or evaluate through the browser extension): hint directions in words, the weapons line's
// in-place reload, one crash instruction, target labels that never overlap, Tab and Space left alone
// off the flight, air-target names in capitals, the tier's follow notice, no crater on water, the
// switches unavailable while loading, and the Wyvern's own wording, rotation speed and no designator.
// Returns { pass, failures, results }. The page must be on the intro when it starts.
(async () => {
  const r = {}, failures = [];
  const check = (name, ok, detail) => { if (!ok) failures.push(`${name}: ${JSON.stringify(detail)}`); };
  const range = window.range, $ = (id) => document.getElementById(id);
  const mobile = document.body.classList.contains('touch');
  const hudUpdate = () => range.hud.update(range.flight, range.camera, range.input, range.instructor, range.effects, {});

  const start = $('start'), sw = $('skinSwitch');
  start.disabled = true; const loading = getComputedStyle(sw).pointerEvents;
  start.disabled = false; const ready = getComputedStyle(sw).pointerEvents;
  r.switches = { loading, ready };
  check('switches unavailable while loading', loading === 'none' && ready !== 'none', r.switches);

  r.introKeys = ['Tab', 'Space'].map((code) => {
    const e = new KeyboardEvent('keydown', { code, key: code === 'Tab' ? 'Tab' : ' ', bubbles: true, cancelable: true });
    window.dispatchEvent(e); return e.defaultPrevented;
  });
  check('Tab and Space free on the intro', !r.introKeys[0] && !r.introKeys[1], r.introKeys);

  r.names = range.engagement.airTargets.map((t) => t.name);
  check('air-target names in capitals', r.names.every((n) => n === n.toUpperCase()), r.names);
  r.follow = range.engagement.followHint();
  check('follow notice fits the tier', r.follow === (mobile ? 'HOLD THE CAP TO FOLLOW' : 'HOLD U TO FOLLOW'), r.follow);

  const crater = range.effects.craterCount;
  range.effects.addCrater(range.flight.position.clone().set(9000, 0, -2000), 16);
  check('no crater on the sea', range.effects.craterCount === crater, range.effects.craterCount);

  if (mobile) range.touchDemo('bomb'); else range.stage('bomb');
  range.renderOnce(0);
  const boxes = [...document.querySelectorAll('#markers .target-mark')].filter((g) => g.getAttribute('visibility') === 'visible')
    .flatMap((g) => [...g.querySelectorAll('text')].filter((t) => t.getAttribute('display') !== 'none' && t.textContent).map((t) => t.getBoundingClientRect()));
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++;
  }
  r.labels = { texts: boxes.length, overlaps, distanceY: document.querySelector('#markers .target-distance')?.getAttribute('y') };
  check('target labels never overlap', overlaps === 0 && r.labels.distanceY === '17', r.labels);

  if (!mobile) {
    range.stage('cloud'); range.input.locked = true; range.renderOnce(0);
    r.cruiseHint = $('hint').textContent;
    range.flight.bombs = 0; range.effects.reload.bombs = 2; hudUpdate();
    r.weapons = $('weapons').textContent;
    range.flight.crashed = true; hudUpdate(); r.crashHint = $('hint').textContent;
    range.flight.crashed = false; range.input.locked = false;
    check('directions in words', /The range is \d+ km (ahead|behind|to the)/.test(r.cruiseHint), r.cruiseHint);
    check('reload in place', /PAVEWAY RELOAD 23 S/.test(r.weapons) && !/BOMBS/.test(r.weapons), r.weapons);
    check('one crash instruction', r.crashHint === '', r.crashHint);
  }

  range.returnToMenu();
  r.wyvern = range.setAircraft('wyvern');
  if (r.wyvern) {
    range.engagement.designate(range.flight, {});
    r.designate = { notice: range.engagement.notice, laser: range.engagement.laser.active, helpHidden: $('laserHelp').hidden };
    check('no designator on the Wyvern', r.designate.notice === 'NO DESIGNATOR ON THE WYVERN' && !r.designate.laser && r.designate.helpHidden, r.designate);
    if (mobile) {
      range.touchDemo('ramp'); range.renderOnce(0);
      r.rocketCap = $('touchWeapons').querySelector('.key').className;
      check('rocket cap dim on the ground', /\bdim\b/.test(r.rocketCap), r.rocketCap);
    } else {
      const f = range.flight; range.stage('takeoff'); range.input.locked = true;
      f.onGround = true; f.landed = false; f.velocity.set(0, 0, -40); f.ias = 1.12 * f.stallSpeed; hudUpdate();
      r.rotate = { hint: $('hint').textContent, vr: Math.round(1.12 * f.stallSpeed * 3.6) };
      range.input.locked = false;
      check('Wyvern rotation speed', /Rotate at (1[89]0|2[0-4]0) km\/h/.test(r.rotate.hint), r.rotate);
    }
    range.returnToMenu(); range.setAircraft('typhoon');
  } else failures.push('setAircraft(wyvern) refused');
  return { pass: failures.length === 0, failures, results: r };
})();
