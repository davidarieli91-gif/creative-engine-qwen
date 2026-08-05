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
scene.clearColor = new BABYLON.Color4(0.07, 0.07, 0.12, 1);
var camera = new BABYLON.ArcRotateCamera('cam', Math.PI / 2, Math.PI / 3, 12, new BABYLON.Vector3(0, 0.5, 0), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 20;
var hemi = new BABYLON.HemisphericLight('h', BABYLON.Vector3.Up(), scene);
hemi.intensity = 0.5;
var sun = new BABYLON.DirectionalLight('s', new BABYLON.Vector3(-1, -2, -1), scene);
sun.intensity = 0.8;

var hasTerrain = false, hasWater = false;
for (var ti = 0; ti < DATA.objects.length; ti++) {
  if (DATA.objects[ti].type === 'terrain') hasTerrain = true;
  if (DATA.objects[ti].type === 'water') hasWater = true;
}

if (!hasTerrain) {
  var g0 = BABYLON.MeshBuilder.CreateGround('g', { width: 40, height: 40 }, scene);
  var gmat = new BABYLON.StandardMaterial('gm', scene);
  gmat.diffuseColor = new BABYLON.Color3(0.25, 0.28, 0.25);
  g0.material = gmat;
}

var terrainData = null;
var waterData = null;
var waterMesh = null, waterBase = null, waterPositions = null, waterNormals = null, waterIndices = null;

function waveH(x, z, t, amp, speed) {
  if (amp <= 0) return 0;
  return amp * (0.5 * Math.sin(x * 0.18 + t * speed) + 0.3 * Math.sin(z * 0.23 + t * speed * 1.31) + 0.2 * Math.sin((x + z) * 0.11 + t * speed * 0.71));
}

function buildTerrain(o) {
  var sub = o.terrain.sub, size = o.terrain.size;
  var heights = o.terrain.heights, colors = o.terrain.colors;
  var vcount = (sub + 1) * (sub + 1);
  var positions = new Float32Array(vcount * 3);
  var normals = new Float32Array(vcount * 3);
  for (var row = 0; row <= sub; row++) {
    for (var col = 0; col <= sub; col++) {
      var i = row * (sub + 1) + col;
      positions[i * 3] = (col / sub - 0.5) * size;
      positions[i * 3 + 1] = heights[i];
      positions[i * 3 + 2] = (row / sub - 0.5) * size;
    }
  }
  var indices = [];
  function fill(fl) {
    indices.length = 0;
    for (var r = 0; r < sub; r++) for (var c = 0; c < sub; c++) {
      var a = r * (sub + 1) + c, b = a + 1, cc = a + sub + 1, d = cc + 1;
      if (fl) indices.push(a, cc, b, b, cc, d); else indices.push(cc, a, b, b, d, cc);
    }
  }
  fill(false);
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  var mid = (Math.floor(sub / 2) * (sub + 1) + Math.floor(sub / 2)) * 3 + 1;
  if (normals[mid] < 0) { fill(true); BABYLON.VertexData.ComputeNormals(positions, indices, normals); }
  var mesh = new BABYLON.Mesh('terrainMesh', scene);
  var vd = new BABYLON.VertexData();
  vd.positions = positions; vd.normals = normals; vd.indices = indices; vd.colors = colors;
  vd.applyToMesh(mesh, true);
  var mat = new BABYLON.StandardMaterial('tmat', scene);
  mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
  mesh.material = mat;
  return mesh;
}

function buildWater(o) {
  var wd = o.water;
  waterData = wd;
  var sub = 64;
  var vcount = (sub + 1) * (sub + 1);
  waterPositions = new Float32Array(vcount * 3);
  waterNormals = new Float32Array(vcount * 3);
  waterBase = new Float32Array(vcount * 2);
  for (var row = 0; row <= sub; row++) {
    for (var col = 0; col <= sub; col++) {
      var i = row * (sub + 1) + col;
      var x = (col / sub - 0.5) * wd.size;
      var z = (row / sub - 0.5) * wd.size;
      waterPositions[i * 3] = x;
      waterPositions[i * 3 + 1] = wd.level;
      waterPositions[i * 3 + 2] = z;
      waterBase[i * 2] = x;
      waterBase[i * 2 + 1] = z;
    }
  }
  waterIndices = [];
  function fill(fl) {
    waterIndices.length = 0;
    for (var r = 0; r < sub; r++) for (var c = 0; c < sub; c++) {
      var a = r * (sub + 1) + c, b = a + 1, cc = a + sub + 1, d = cc + 1;
      if (fl) waterIndices.push(a, cc, b, b, cc, d); else waterIndices.push(cc, a, b, b, d, cc);
    }
  }
  fill(false);
  BABYLON.VertexData.ComputeNormals(waterPositions, waterIndices, waterNormals);
  var mid = (Math.floor(sub / 2) * (sub + 1) + Math.floor(sub / 2)) * 3 + 1;
  if (waterNormals[mid] < 0) { fill(true); BABYLON.VertexData.ComputeNormals(waterPositions, waterIndices, waterNormals); }
  waterMesh = new BABYLON.Mesh('waterMesh', scene);
  var vd = new BABYLON.VertexData();
  vd.positions = waterPositions; vd.normals = waterNormals; vd.indices = waterIndices;
  vd.applyToMesh(waterMesh, true);
  var mat = new BABYLON.StandardMaterial('wmat', scene);
  mat.diffuseColor = BABYLON.Color3.FromHexString(wd.color || '#1e6fd8');
  mat.specularColor = new BABYLON.Color3(0.7, 0.9, 1);
  mat.alpha = 0.72;
  mat.backFaceCulling = false;
  waterMesh.material = mat;
}

function sampleTerrain(x, z) {
  if (!terrainData) return 0;
  var sub = terrainData.sub, size = terrainData.size, h = terrainData.heights;
  var gx = Math.min(Math.max((x / size + 0.5) * sub, 0), sub - 0.0001);
  var gz = Math.min(Math.max((z / size + 0.5) * sub, 0), sub - 0.0001);
  var c0 = Math.floor(gx), r0 = Math.floor(gz);
  var fx = gx - c0, fz = gz - r0;
  var i = r0 * (sub + 1) + c0;
  var h00 = h[i], h10 = h[i + 1], h01 = h[i + sub + 1], h11 = h[i + sub + 2];
  return h00 + (h10 - h00) * fx + (h01 - h00) * fz + (h00 - h10 - h01 + h11) * fx * fz;
}

var meshes = {};
DATA.objects.forEach(function (o) {
  if (o.type === 'terrain') { terrainData = o.terrain; meshes[o.id] = buildTerrain(o); return; }
  if (o.type === 'water') { buildWater(o); meshes[o.id] = waterMesh; return; }
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
var sinkTarget = {};
var sinkProg = {};
var floatVel = {};
var startTime = performance.now();
var last = startTime;
var lastWater = 0;

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
    else if (d.type === 'sink') { sinkTarget[d.objectId] = 1; }
    else if (d.type === 'float') { sinkTarget[d.objectId] = 0; }
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

  if (waterMesh && waterData && now - lastWater > 33) {
    lastWater = now;
    var vcount = waterPositions.length / 3;
    for (var wi = 0; wi < vcount; wi++) {
      waterPositions[wi * 3 + 1] = waterData.level +
        waveH(waterBase[wi * 2], waterBase[wi * 2 + 1], t, waterData.waveHeight, waterData.waveSpeed);
    }
    BABYLON.VertexData.ComputeNormals(waterPositions, waterIndices, waterNormals);
    waterMesh.updateVerticesData('position', waterPositions);
    waterMesh.updateVerticesData('normal', waterNormals);
  }

  var playerObj = null;
  for (var i = 0; i < DATA.objects.length; i++) {
    if (DATA.objects[i].behaviors && DATA.objects[i].behaviors.player) { playerObj = DATA.objects[i]; break; }
  }

  if (waterData) {
    DATA.objects.forEach(function (o) {
      if (o.type === 'terrain' || o.type === 'water') return;
      if (!o.behaviors || !o.behaviors.float) return;
      var m = meshes[o.id];
      if (!m || !m.isEnabled()) return;
      var target = sinkTarget[o.id] || 0;
      var p0 = sinkProg[o.id] || 0;
      var p = p0 + (target - p0) * Math.min(1, dt * 0.4);
      sinkProg[o.id] = p;
      var x = m.position.x, z = m.position.z;
      var h = waterData.level + waveH(x, z, t, waterData.waveHeight, waterData.waveSpeed);
      var targetY = h + o.scale.y * 0.3 - p * (o.scale.y * 0.5 + 2.5);
      var vy = floatVel[o.id] || 0;
      vy += (targetY - m.position.y) * 8 * dt;
      vy *= Math.max(0, 1 - 2.5 * dt);
      m.position.y += vy;
      floatVel[o.id] = vy;
      if (!o.behaviors.player) {
        var d = 1.5;
        var hx = waveH(x + d, z, t, waterData.waveHeight, waterData.waveSpeed) - waveH(x - d, z, t, waterData.waveHeight, waterData.waveSpeed);
        var hz = waveH(x, z + d, t, waterData.waveHeight, waterData.waveSpeed) - waveH(x, z - d, t, waterData.waveHeight, waterData.waveSpeed);
        m.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(0, hz * 0.12, -hx * 0.12);
      }
    });
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
        if (!playerObj.behaviors.float) {
          pm.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(Math.atan2(move.x, move.z), 0, 0);
        }
      }
      if (terrainData && !(playerObj.behaviors && playerObj.behaviors.bounce) && !(playerObj.behaviors && playerObj.behaviors.float)) {
        var half = terrainData.size / 2;
        if (Math.abs(pm.position.x) < half && Math.abs(pm.position.z) < half) {
          pm.position.y = sampleTerrain(pm.position.x, pm.position.z) + 0.5;
        }
      }
      camera.target.copyFrom(pm.position);
      camera.target.y += 0.5;
    }
  }

  DATA.objects.forEach(function (o) {
    if (o.type === 'terrain' || o.type === 'water') return;
    var m = meshes[o.id];
    if (!m || !m.isEnabled()) return;
    var b = o.behaviors || {};
    if (b.spin) m.rotate(BABYLON.Vector3.Up(), 0.03);
    if (b.bounce && !b.float) m.position.y = o.position.y + Math.abs(Math.sin(t * 3)) * 1.5;
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
        var d2 = BABYLON.Vector3.Distance(pl.position, tg.position);
        if (d2 < 1.3) {
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
