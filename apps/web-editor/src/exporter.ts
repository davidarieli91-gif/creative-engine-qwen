import { SceneObject } from './Editor'
import { LogicData } from './logic'

export function exportGameHtml(objects: SceneObject[], logic: LogicData, title: string): string {
  const data = JSON.stringify({ objects, logic }).replace(/</g, '\\u003c')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<style>
  html,body{margin:0;padding:0;overflow:hidden;height:100%;background:#111}
  #c{width:100%;height:100%;outline:none}
  #score{position:fixed;top:10px;left:12px;font:800 20px Arial;color:#fff;text-shadow:0 1px 4px #000}
  #msg{position:fixed;top:38%;left:0;right:0;text-align:center;font:800 30px Arial;color:#ffe08a;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .3s}
  #hint{position:fixed;bottom:8px;left:10px;font:12px Arial;color:#bbb;opacity:.7}
  #made{position:fixed;bottom:8px;right:10px;font:11px Arial;color:#888}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="score"></div>
<div id="msg"></div>
<div id="hint">WASD / стрелки — движение · мышь — камера · колесо — зум</div>
<div id="made">Сделано в Creative Engine Qwen</div>
<script>
var DATA = ${data};
var canvas = document.getElementById('c');
var engine = new BABYLON.Engine(canvas, true);
var scene = new BABYLON.Scene(engine);
scene.clearColor = BABYLON.Color4(0.07, 0.07, 0.12, 1);
var camera = new BABYLON.ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 12, new BABYLON.Vector3(0, 0.5, 0), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 20;
var hemi = new BABYLON.HemisphericLight('h', BABYLON.Vector3.Up(), scene);
hemi.intensity = 0.5;
var sun = new BABYLON.DirectionalLight('s', new BABYLON.Vector3(-1, -2, -1), scene);
sun.intensity = 0.8;
var ground = BABYLON.MeshBuilder.CreateGround('g', { width: 40, height: 40 }, scene);
var gmat = new BABYLON.StandardMaterial('gm', scene);
gmat.diffuseColor = new BABYLON.Color3(0.25, 0.28, 0.25);
ground.material = gmat;

var meshes = {};
DATA.objects.forEach(function (o) {
  var m;
  if (o.type === 'cube') m = BABYLON.MeshBuilder.CreateBox(o.id, { size: 1 }, scene);
  else if (o.type === 'sphere') m = BABYLON.MeshBuilder.CreateSphere(o.id, { diameter: 1 }, scene);
  else if (o.type === 'cylinder') m = BABYLON.MeshBuilder.CreateCylinder(o.id, { height: 1, diameter: 1 }, scene);
  else m = BABYLON.MeshBuilder.CreatePlane(o.id, { size: 1 }, scene);
  m.position.set(o.position.x, o.position.y, o.position.z);
  m.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(
    o.rotation.y * Math.PI / 180, o.rotation.x * Math.PI / 180, o.rotation.z * Math.PI / 180);
  m.scaling.set(o.scale.x, o.scale.y, o.scale.z);
  var mat = new BABYLON.StandardMaterial('m' + o.id, scene);
  var c = o.color || { r: 0.2, g: 0.5, b: 0.8 };
  mat.diffuseColor = new BABYLON.Color3(c.r, c.g, c.b);
  m.material = mat;
  m.actionManager = new BABYLON.ActionManager(scene);
  m.actionManager.registerAction(new BABYLON.ExecuteCodeAction(
    BABYLON.ActionManager.OnPickTrigger,
    (function (id) { return function () { handleClick(id); }; })(o.id)
  ));
  meshes[o.id] = m;
});

function buildChains(lg) {
  var byId = {};
  lg.nodes.forEach(function (n) { byId[n.id] = n; });
  var out = {};
  lg.edges.forEach(function (e) { (out[e.source] = out[e.source] || []).push(e); });
  var res = [];
  lg.nodes.filter(function (n) { return n.data.kind === 'event'; }).forEach(function (ev) {
    var actions = []; var cur = ev; var seen = {};
    for (;;) {
      var es = out[cur.id] || []; var nx = es[0];
      if (!nx) break;
      var tg = byId[nx.target];
      if (!tg || tg.data.kind !== 'action' || seen[tg.id]) break;
      seen[tg.id] = true; actions.push(tg); cur = tg;
    }
    res.push({ event: ev, actions: actions });
  });
  return res;
}
var chains = buildChains(DATA.logic);

var score = 0;
var keys = {};
var fired = {};
var timers = {};
var startTime = performance.now();
var last = startTime;

function hud() { document.getElementById('score').textContent = '🏆 ' + score; }
function msg(t) {
  var el = document.getElementById('msg');
  el.textContent = t; el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.style.opacity = 0; }, 2500);
}

function runChain(actions) {
  actions.forEach(function (n) {
    var d = n.data;
    if (d.type === 'score') { score += (typeof d.value === 'number' ? d.value : 1); hud(); }
    else if (d.type === 'text') { msg(d.message || '...'); }
    else if (d.type === 'delete') { var m = meshes[d.objectId]; if (m) m.setEnabled(false); }
    else if (d.type === 'color') {
      var m2 = meshes[d.objectId];
      if (m2 && m2.material) m2.material.diffuseColor = BABYLON.Color3.FromHexString(d.color || '#ffcc00');
    }
  });
}

function handleClick(id) {
  chains.forEach(function (ch) {
    if (ch.event.data.type === 'click' && ch.event.data.objectId === id) runChain(ch.actions);
  });
}

var MOVE_KEYS = ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
window.addEventListener('keydown', function (e) {
  if (MOVE_KEYS.indexOf(e.code) >= 0) e.preventDefault();
  keys[e.code] = true;
});
window.addEventListener('keyup', function (e) { delete keys[e.code]; });
window.addEventListener('resize', function () { engine.resize(); });

chains.filter(function (c) { return c.event.data.type === 'start'; })
  .forEach(function (c) { runChain(c.actions); });

engine.runRenderLoop(function () {
  var now = performance.now();
  var dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  var t = (now - startTime) / 1000;

  var playerObj = null;
  for (var i = 0; i < DATA.objects.length; i++) {
    if (DATA.objects[i].behaviors && DATA.objects[i].behaviors.player) { playerObj = DATA.objects[i]; break; }
  }
  if (playerObj) {
    var pm = meshes[playerObj.id];
    if (pm && pm.isEnabled()) {
      var fwd = camera.target.subtract(camera.position);
      fwd.y = 0;
      if (fwd.lengthSquared() > 0.0001) fwd.normalize();
      var right = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), fwd);
      var move = BABYLON.Vector3.Zero();
      if (keys.KeyW || keys.ArrowUp) move.addInPlace(fwd);
      if (keys.KeyS || keys.ArrowDown) move.subtractInPlace(fwd);
      if (keys.KeyD || keys.ArrowRight) move.addInPlace(right);
      if (keys.KeyA || keys.ArrowLeft) move.subtractInPlace(right);
      if (move.lengthSquared() > 0) {
        move.normalize().scaleInPlace(0.12);
        pm.position.addInPlace(move);
        pm.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(Math.atan2(move.x, move.z), 0, 0);
      }
      camera.target.copyFrom(pm.position);
      camera.target.y += 0.5;
    }
  }

  DATA.objects.forEach(function (o) {
    var m = meshes[o.id];
    if (!m || !m.isEnabled()) return;
    var b = o.behaviors || {};
    if (b.spin) m.rotate(BABYLON.Vector3.Up(), 0.03);
    if (b.bounce) m.position.y = o.position.y + Math.abs(Math.sin(t * 3)) * 1.5;
    if (b.patrol && !b.player) m.position.x = o.position.x + Math.sin(t * 1.5) * 2;
  });

  chains.forEach(function (ch) {
    var ev = ch.event.data;
    if (ev.type === 'timer') {
      var sec = Math.max(0.1, ev.seconds || 1);
      var acc = (timers[ch.event.id] || 0) + dt;
      if (acc >= sec) { timers[ch.event.id] = 0; runChain(ch.actions); }
      else timers[ch.event.id] = acc;
    }
    if (ev.type === 'touch' && ev.objectId) {
      var tg = meshes[ev.objectId];
      var pl = playerObj && meshes[playerObj.id];
      if (tg && pl && tg.isEnabled() && pl.isEnabled()) {
        var d = BABYLON.Vector3.Distance(pl.position, tg.position);
        if (d < 1.3) {
          if (!fired[ch.event.id]) { fired[ch.event.id] = true; runChain(ch.actions); }
        } else delete fired[ch.event.id];
      }
    }
  });

  scene.render();
});
</script>
</body>
</html>`
}
