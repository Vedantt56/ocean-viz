import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { evaluateColormapValue } from '../utils/colormaps.js';

// Increased vertical spacing between depth planes for visual clarity (Prompt F15)
const DEPTH_Y_MAPPING = {
  0: 0.0,
  50: -1.8,
  100: -3.6,
  150: -4.5, // Visual filler slice between 100m and 200m
  200: -5.4,
  300: -6.3, // Visual filler slice between 200m and 500m
  400: -7.2, // Visual filler slice between 200m and 500m
  500: -8.1,
};

// Explicit Vertical Clearance & Crust Placement Constants (Prompt F31 & F33)
const DEEPEST_SLICE_Y_POS = -8.1;         // Y position of 500m deepest slice
const MIN_CRUST_CLEARANCE_MARGIN = 2.5;    // Guaranteed 2.5 unit gap between lowest slice & highest crust peak
const MAX_CRUST_NOISE_AMPLITUDE = 1.8;     // Rich 1.8 unit 3D terrain height variation
const CRUST_BOX_HEIGHT = 5.0;              // Thickness of solid crust BoxGeometry
// Calculated Crust Base Position Y: -8.1 - 2.5 - 1.8 - 2.5 = -14.9Y
const CALCULATED_CRUST_Y_POS = DEEPEST_SLICE_Y_POS - (CRUST_BOX_HEIGHT / 2.0) - MAX_CRUST_NOISE_AMPLITUDE - MIN_CRUST_CLEARANCE_MARGIN;

// Procedural multi-octave noise generator for realistic 3D seafloor bathymetry terrain (Prompt F33)
function getSeafloorHeight(x, z) {
  const d = Math.sqrt(x * x + z * z);
  // Multi-octave 3D terrain noise for dramatic mountain ridges & ocean trenches
  const n1 = Math.sin(x * 0.5) * Math.cos(z * 0.5) * 0.8;
  const n2 = Math.cos(d * 0.6) * 0.6;
  const n3 = Math.sin(x * 1.2 + z * 0.8) * 0.4;
  const rawHeight = n1 + n2 + n3 + 0.9;

  // STRICT CLAMP to [0 .. MAX_CRUST_NOISE_AMPLITUDE] (max 1.8 height units)
  return Math.max(0.0, Math.min(MAX_CRUST_NOISE_AMPLITUDE, rawHeight));
}



// Generate solid 3D geological crust block geometry (Box with displaced top surface - Prompt F29)
function createSolidCrustGeometry() {
  // Box geometry: 16 wide (X), 5 deep (Y), 16 long (Z), with 64x64 top grid
  const geo = new THREE.BoxGeometry(16, CRUST_BOX_HEIGHT, 16, 64, 1, 64);
  const pos = geo.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);

    // Displace top face vertices (vy > 0) to form organic 3D terrain peaks & valleys
    if (vy > 0.1) {
      const terrainHeight = getSeafloorHeight(vx, vz);
      pos.setY(i, vy + terrainHeight);
    }
  }

  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

// Generate realistic geological earth crust texture (muted browns/tans with rock grain & strata - Prompt F29)
function createEarthCrustTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base muted brown earth color
  ctx.fillStyle = '#2d231c';
  ctx.fillRect(0, 0, 512, 512);

  // Rock sediment strata layers
  for (let y = 0; y < 512; y += 4) {
    const shade = Math.floor(35 + Math.sin(y * 0.08) * 15 + Math.random() * 10);
    ctx.fillStyle = `rgba(${shade + 30}, ${shade + 20}, ${shade + 10}, 0.5)`;
    ctx.fillRect(0, y, 512, 3 + Math.random() * 3);
  }

  // Rock speckles & grain texture
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = Math.random() * 2 + 0.5;
    const shade = Math.floor(Math.random() * 45 + 15);
    ctx.fillStyle = `rgba(${shade + 40}, ${shade + 25}, ${shade + 10}, 0.3)`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}



// Generate satellite coastline surface texture overlay (Top plane at 0m)
function createCoastlineSurfaceCanvas(ncols, nrows, values, minVal, maxVal, palette, scaleMode) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base interpolated colormap heatmap
  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = ncols;
  rawCanvas.height = nrows;
  const rawCtx = rawCanvas.getContext('2d');
  const imgData = rawCtx.createImageData(ncols, nrows);

  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const val = values[r][c];
      const [red, green, blue, alpha] = evaluateColormapValue(val, minVal, maxVal, palette, scaleMode);
      const idx = (r * ncols + c) * 4;
      imgData.data[idx] = red;
      imgData.data[idx + 1] = green;
      imgData.data[idx + 2] = blue;
      imgData.data[idx + 3] = alpha;
    }
  }
  rawCtx.putImageData(imgData, 0, 0);

  // Draw high-resolution smooth stretched heatmap
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(rawCanvas, 0, 0, 512, 512);

  // Draw crisp scientific contour lines across heatmap
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.5;
  for (let y = 30; y < 512; y += 45) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y * 0.05) * 15);
    ctx.bezierCurveTo(150, y - 20, 350, y + 20, 512, y + Math.cos(y * 0.05) * 15);
    ctx.stroke();
  }

  // Draw simulated satellite land mass (India & Bay of Bengal coastlines overlay at top left)
  ctx.fillStyle = '#1c2e22'; // Dark satellite terrain land color
  ctx.strokeStyle = '#3e5c47';
  ctx.lineWidth = 2;

  // Land Mass Polygon (Northwest Coastline)
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(240, 0);
  ctx.bezierCurveTo(220, 60, 180, 110, 140, 160);
  ctx.bezierCurveTo(100, 200, 70, 240, 0, 290);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Coastal shelf boundary line
  ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  return canvas;
}

// 3D Depth Scale Labels Text Canvas generator (High-contrast callout badges)
function createDepthLabelTexture(text, isSelected, isAdjacent) {
  const canvas = document.createElement('canvas');
  canvas.width = 140;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (isSelected) {
    ctx.fillStyle = 'rgba(0, 210, 255, 0.9)';
    ctx.roundRect(4, 4, 132, 56, 10);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#040d1a';
    ctx.font = 'bold 26px monospace';
  } else if (isAdjacent) {
    ctx.fillStyle = 'rgba(11, 19, 37, 0.85)';
    ctx.roundRect(4, 4, 132, 56, 8);
    ctx.fill();
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 22px monospace';
  } else {
    ctx.fillStyle = 'rgba(8, 14, 28, 0.65)';
    ctx.roundRect(4, 4, 132, 56, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '20px monospace';
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 70, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

export default function Scene({
  slicesData = [],
  activeDepth = 0,
  activeVariable = 'temperature',
  floatsData = [],
  onFloatSelect,
  palette = 'thermal',
  scaleMode = 'linear',
  minOverride = null,
  maxOverride = null,
  renderMode = 'slices',
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const slicesGroupRef = useRef(null);
  const floatsGroupRef = useRef(null);
  const depthLabelsGroupRef = useRef(null);

  // Store current props in ref for instantaneous remount rendering
  const propsRef = useRef({
    slicesData,
    activeDepth,
    activeVariable,
    floatsData,
    palette,
    scaleMode,
    minOverride,
    maxOverride,
    renderMode,
  });

  useEffect(() => {
    propsRef.current = {
      slicesData,
      activeDepth,
      activeVariable,
      floatsData,
      palette,
      scaleMode,
      minOverride,
      maxOverride,
      renderMode,
    };
  }, [slicesData, activeDepth, activeVariable, floatsData, palette, scaleMode, minOverride, maxOverride, renderMode]);

  // 1. Primary Scene Initialization & Event Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || (window.innerWidth - 288);
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040814);
    scene.fog = new THREE.FogExp2(0x040814, 0.02);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(16, 13, 23);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, -6.0, 0);

    // 💡 Cinematic Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xd0e8ff, 0.85);
    scene.add(ambientLight);

    const mainSun = new THREE.DirectionalLight(0xffffff, 1.25);
    mainSun.position.set(15, 25, 15);
    mainSun.castShadow = true;
    scene.add(mainSun);

    const cyanRimLight = new THREE.DirectionalLight(0x00ffff, 0.75);
    cyanRimLight.position.set(-15, -10, -15);
    scene.add(cyanRimLight);

    // 🪨 Solid Geological Earth Crust Block (Prompt F29)
    const crustGeo = createSolidCrustGeometry();
    const crustMat = new THREE.MeshStandardMaterial({
      map: createEarthCrustTexture(),
      color: 0x4a3c31, // Muted geological rock brown/tan
      roughness: 0.90,
      metalness: 0.10,
      flatShading: false,
    });
    const crustMesh = new THREE.Mesh(crustGeo, crustMat);
    crustMesh.position.set(0, CALCULATED_CRUST_Y_POS, 0); // Guaranteed 2.0 unit clearance beneath deepest slice
    crustMesh.receiveShadow = true;
    scene.add(crustMesh);

    // 📦 Glass Bounding Box Guide Lines
    const boundingGroup = new THREE.Group();
    scene.add(boundingGroup);

    const boxGeo = new THREE.BoxGeometry(12, 14.5, 12);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const boxMat = new THREE.LineBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.25 });
    const boxMesh = new THREE.LineSegments(boxEdges, boxMat);
    boxMesh.position.set(0, -6.5, 0);

    boundingGroup.add(boxMesh);

    // Depth Labels Group (Dynamic Leader Lines terminating at plane edges)
    const depthLabelsGroup = new THREE.Group();
    scene.add(depthLabelsGroup);
    depthLabelsGroupRef.current = depthLabelsGroup;

    // Mesh Groups for Slices & Argo Floats
    const slicesGroup = new THREE.Group();
    scene.add(slicesGroup);
    slicesGroupRef.current = slicesGroup;

    const floatsGroup = new THREE.Group();
    scene.add(floatsGroup);
    floatsGroupRef.current = floatsGroup;

    // Initial Mesh Assembly
    rebuildSlicesMesh(slicesGroup, depthLabelsGroup, propsRef.current);
    rebuildFloatsMesh(floatsGroup, propsRef.current);

    // Raycasting Event Handling
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (event) => {
      if (!floatsGroupRef.current || !cameraRef.current || !rendererRef.current) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(floatsGroupRef.current.children, true);

      if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.float_id && obj.parent) {
          obj = obj.parent;
        }

        if (obj && obj.userData.float_id) {
          const clickedFloatId = obj.userData.float_id;
          console.log(`[Scene Raycaster] Selected Argo Float Marker: ${clickedFloatId}`);
          if (onFloatSelect) onFloatSelect(clickedFloatId);
        }
      }
    };

    const handlePointerMove = (event) => {
      if (!floatsGroupRef.current || !cameraRef.current || !rendererRef.current) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(floatsGroupRef.current.children, true);

      if (intersects.length > 0) {
        rendererRef.current.domElement.style.cursor = 'pointer';
      } else {
        rendererRef.current.domElement.style.cursor = 'grab';
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    domElem.addEventListener('pointermove', handlePointerMove);

    // Animation Loop with Dynamic Back-to-Front Render Order Sorting
    let animationFrameId;
    let animTime = 0;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      animTime += 0.02;
      controls.update();

      if (floatsGroupRef.current) {
        floatsGroupRef.current.children.forEach((marker) => {
          marker.position.y += Math.sin(animTime * 2.5 + marker.position.x) * 0.002;
        });
      }

      // 1. Dynamic Per-Frame Camera Distance Render Order Sorting for Transparent Slices
      if (slicesGroupRef.current && cameraRef.current) {
        const camPos = cameraRef.current.position;
        const sliceMeshes = [...slicesGroupRef.current.children];
        sliceMeshes.sort((a, b) => {
          const distA = a.position.distanceTo(camPos);
          const distB = b.position.distanceTo(camPos);
          return distB - distA; // Descending: furthest mesh first (lowest renderOrder)
        });
        sliceMeshes.forEach((mesh, index) => {
          mesh.renderOrder = index;
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || (window.innerWidth - 288);
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      domElem.removeEventListener('pointerdown', handlePointerDown);
      domElem.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [onFloatSelect]);

  // 2. Rebuild Slices Effect on Prop Updates
  useEffect(() => {
    if (slicesGroupRef.current && depthLabelsGroupRef.current) {
      rebuildSlicesMesh(slicesGroupRef.current, depthLabelsGroupRef.current, {
        slicesData,
        activeDepth,
        activeVariable,
        palette,
        scaleMode,
        minOverride,
        maxOverride,
        renderMode,
      });
    }
  }, [slicesData, activeDepth, activeVariable, palette, scaleMode, minOverride, maxOverride, renderMode]);

  // 3. Rebuild Argo Float Markers Effect on Prop Updates
  useEffect(() => {
    if (floatsGroupRef.current) {
      rebuildFloatsMesh(floatsGroupRef.current, { floatsData });
    }
  }, [floatsData]);

  return (
    <div className="relative w-full h-full select-none">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Right Variable & Isolated Depth Overlay Badge */}
      <div className="absolute top-4 right-4 bg-ocean-panel/90 backdrop-blur-xl border border-ocean-border/80 px-4 py-2 rounded-xl text-xs font-mono text-cyan-300 shadow-2xl flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
        <div>
          Variable: <span className="text-white font-bold tracking-wide">{activeVariable.toUpperCase()}</span>
        </div>
        <div>
          Isolated Depth: <span className="text-cyan-400 font-bold">{activeDepth}m</span>
        </div>
      </div>
    </div>
  );
}


// 🛠️ Helper: Generate displaced 3D BufferGeometry for 12x12 depth slices (Prompt F28 & F30)
function createDisplacedSliceGeometry(depth, values, effectiveMin, effectiveMax) {
  // 64x64 subdivisions give 65x65 = 4,225 vertices across 12x12 footprint
  const geo = new THREE.PlaneGeometry(12, 12, 64, 64);
  const pos = geo.attributes.position;

  // Depth-appropriate displacement amplitude scaling:
  const amplitudeMap = { 0: 0.50, 50: 0.35, 100: 0.22, 150: 0.18, 200: 0.14, 300: 0.11, 400: 0.09, 500: 0.08 };
  const amplitude = amplitudeMap[depth] ?? Math.max(0.06, 0.50 * Math.exp(-depth / 150.0));

  const nrows = values ? values.length : 0;
  const ncols = values && values[0] ? values[0].length : 0;
  const range = effectiveMax - effectiveMin || 1.0;

  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i); // Local X [-6 .. +6]
    const vy = pos.getY(i); // Local Y [-6 .. +6]

    // 1. Organic multi-octave wave noise across 12x12 surface
    const n1 = Math.sin(vx * 0.7 + vy * 0.5) * Math.cos(vy * 0.6 - vx * 0.4);
    const n2 = Math.sin(vx * 1.5 - vy * 1.2) * 0.4 * Math.cos(vx * 1.1 + vy * 1.3);
    const organicNoise = (n1 + n2) * 0.5;

    // 2. Real field data influence (if values grid available)
    let dataNormalized = 0.5;
    if (nrows > 0 && ncols > 0) {
      const u = Math.max(0, Math.min(1.0, (vx + 6.0) / 12.0));
      const v = Math.max(0, Math.min(1.0, (vy + 6.0) / 12.0));
      const rIdx = Math.max(0, Math.min(nrows - 1, Math.floor((1.0 - v) * nrows)));
      const cIdx = Math.max(0, Math.min(ncols - 1, Math.floor(u * ncols)));
      const rawVal = values[rIdx][cIdx];
      if (rawVal !== null && rawVal !== undefined && !isNaN(rawVal)) {
        dataNormalized = Math.max(0, Math.min(1.0, (rawVal - effectiveMin) / range));
      }
    }

    // Blend: 40% real field data + 60% organic wave noise
    const blendedRelief = (dataNormalized - 0.5) * 0.8 + organicNoise * 0.6;
    const zDisplacement = blendedRelief * amplitude;
    pos.setZ(i, zDisplacement);
  }

  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

// 🛠️ Helper: Extract outer 12x12 perimeter loop
function createPerimeterBorderGeometry(displacedGeo, gridX = 64, gridY = 64) {
  const pos = displacedGeo.attributes.position;
  const numCols = gridX + 1;
  const numRows = gridY + 1;

  const points = [];

  for (let c = 0; c < numCols; c++) {
    points.push(new THREE.Vector3(pos.getX(c), pos.getY(c), pos.getZ(c)));
  }
  for (let r = 1; r < numRows; r++) {
    const idx = r * numCols + (numCols - 1);
    points.push(new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)));
  }
  for (let c = numCols - 2; c >= 0; c--) {
    const idx = (numRows - 1) * numCols + c;
    points.push(new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)));
  }
  for (let r = numRows - 2; r >= 1; r--) {
    const idx = r * numCols;
    points.push(new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)));
  }

  return new THREE.BufferGeometry().setFromPoints(points);
}

// 🛠️ Helper: Render Subsurface Real Data Slice Canvas
function createSubsurfaceSliceCanvas(ncols, nrows, values, effectiveMin, effectiveMax, palette, scaleMode) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const rawCanvas = document.createElement('canvas');
  rawCanvas.width = ncols;
  rawCanvas.height = nrows;
  const rawCtx = rawCanvas.getContext('2d');
  const imgData = rawCtx.createImageData(ncols, nrows);

  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      const val = values[r][c];
      const [red, green, blue, alpha] = evaluateColormapValue(val, effectiveMin, effectiveMax, palette, scaleMode);
      const idx = (r * ncols + c) * 4;
      imgData.data[idx] = red;
      imgData.data[idx + 1] = green;
      imgData.data[idx + 2] = blue;
      imgData.data[idx + 3] = alpha;
    }
  }
  rawCtx.putImageData(imgData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(rawCanvas, 0, 0, 512, 512);

  // Isolines overlay inside real data region
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  for (let y = 30; y < 512; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  return canvas;
}

// 🛠️ Helper: Render Desaturated Vertical Filler Slice Canvas (Visual-only gap filler)
function createFillerSliceCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Muted desaturated slate-blue tint
  ctx.fillStyle = '#08172c';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = 'rgba(0, 210, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }

  return canvas;
}

// 🛠️ Helper: Render Stacked 3D Slice Heatmaps with Multi-Layer Visibility & Vertical Filler Slices (Prompt F30 Revised)
function rebuildSlicesMesh(slicesGroup, depthLabelsGroup, props) {
  const { slicesData, activeDepth, palette, scaleMode, minOverride, maxOverride, renderMode } = props;
  if (!slicesGroup || !slicesData || slicesData.length === 0) return;

  // Clear Slices Group
  while (slicesGroup.children.length > 0) {
    const obj = slicesGroup.children[0];
    slicesGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (obj.material.map) obj.material.map.dispose();
      obj.material.dispose();
    }
  }

  // Clear Depth Labels Group
  if (depthLabelsGroup) {
    while (depthLabelsGroup.children.length > 0) {
      const obj = depthLabelsGroup.children[0];
      depthLabelsGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
  }

  const availableDepths = slicesData
    .map((s) => s.depth)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .sort((a, b) => a - b);

  let globalMin = Infinity;
  let globalMax = -Infinity;
  slicesData.forEach((slice) => {
    if (!slice.values) return;
    slice.values.forEach((row) => {
      row.forEach((v) => {
        if (v !== null && v !== undefined && !isNaN(v)) {
          if (v < globalMin) globalMin = v;
          if (v > globalMax) globalMax = v;
        }
      });
    });
  });

  if (globalMin === Infinity) {
    globalMin = 0;
    globalMax = 1;
  }

  const effectiveMin = minOverride !== null ? minOverride : globalMin;
  const effectiveMax = maxOverride !== null ? maxOverride : globalMax;

  // 1. Render REAL Data Slices (All visible simultaneously with depth stack opacities)
  slicesData.forEach((slice) => {
    const { depth, values } = slice;
    if (!values) return;

    const isSelected = depth === activeDepth;

    // Multi-Layer Stack Visibility Rule: Selected slice is high-opacity (0.92), all other real slices are translucent (0.38)
    let opacity = isSelected ? 0.92 : 0.38;
    if (renderMode === 'volume') opacity = 0.70;

    const nrows = values.length;
    const ncols = values[0].length;

    let texture;
    if (depth === 0) {
      const surfCanvas = createCoastlineSurfaceCanvas(ncols, nrows, values, effectiveMin, effectiveMax, palette, scaleMode);
      texture = new THREE.CanvasTexture(surfCanvas);
    } else {
      const subCanvas = createSubsurfaceSliceCanvas(ncols, nrows, values, effectiveMin, effectiveMax, palette, scaleMode);
      texture = new THREE.CanvasTexture(subCanvas);
    }

    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // 12x12 Displaced Wavy Geometry (Prompt F28)
    const sliceGeo = createDisplacedSliceGeometry(depth, values, effectiveMin, effectiveMax);
    const borderGeo = createPerimeterBorderGeometry(sliceGeo, 64, 64);

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      roughness: 0.35,
      metalness: 0.15,
    });

    const mesh = new THREE.Mesh(sliceGeo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = true;

    const yPos = DEPTH_Y_MAPPING[depth] ?? (-depth * 0.024);
    mesh.position.set(0, yPos, 0);

    // Border Outline Loop (Selected = Bright Cyan 0.98 opacity, Other Real Slices = Clean Blue 0.55 opacity)
    const borderMat = new THREE.LineBasicMaterial({
      color: isSelected ? 0x00ffff : 0x00aacc,
      transparent: true,
      opacity: isSelected ? 0.98 : 0.55,
    });
    const borderLine = new THREE.LineLoop(borderGeo, borderMat);
    mesh.add(borderLine);

    slicesGroup.add(mesh);

    // Leader Line & Depth Label Callout
    if (depthLabelsGroup) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(6.0, yPos, 0.0),
        new THREE.Vector3(7.4, yPos, 0.0),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0x00ffff : 0x00aacc,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.55,
      });
      depthLabelsGroup.add(new THREE.Line(lineGeo, lineMat));

      const labelText = `${depth}m`;
      const spriteMat = new THREE.SpriteMaterial({
        map: createDepthLabelTexture(labelText, isSelected, !isSelected),
        transparent: true,
        opacity: isSelected ? 1.0 : 0.75,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(8.2, yPos, 0.0);
      sprite.scale.set(1.8, 0.9, 1);
      depthLabelsGroup.add(sprite);
    }
  });

  // 2. Render VERTICAL FILLER SLICES between wide depth gaps (150m, 300m, 400m)
  const fillerDepths = [150, 300, 400];
  const fillerTexture = new THREE.CanvasTexture(createFillerSliceCanvas());
  fillerTexture.minFilter = THREE.LinearFilter;

  fillerDepths.forEach((fDepth) => {
    const yPos = DEPTH_Y_MAPPING[fDepth];
    if (yPos === undefined) return;

    // Displaced wavy geometry using F28 organic wave noise (no real data)
    const fillerGeo = createDisplacedSliceGeometry(fDepth, null, 0, 1);
    const fillerBorderGeo = createPerimeterBorderGeometry(fillerGeo, 64, 64);

    const fillerMat = new THREE.MeshStandardMaterial({
      map: fillerTexture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.18, // Desaturated visual-only context filler
      depthWrite: false,
      roughness: 0.45,
      metalness: 0.10,
    });

    const fillerMesh = new THREE.Mesh(fillerGeo, fillerMat);
    fillerMesh.rotation.x = -Math.PI / 2;
    fillerMesh.position.set(0, yPos, 0);

    const borderMat = new THREE.LineBasicMaterial({
      color: 0x1a365d,
      transparent: true,
      opacity: 0.25,
    });
    const borderLine = new THREE.LineLoop(fillerBorderGeo, borderMat);
    fillerMesh.add(borderLine);

    slicesGroup.add(fillerMesh);
  });
}

// 🛠️ Helper: Render Futuristic Glowing Argo Float Buoys
function rebuildFloatsMesh(floatsGroup, props) {
  const { floatsData } = props;
  if (!floatsGroup || !floatsData) return;

  while (floatsGroup.children.length > 0) {
    const obj = floatsGroup.children[0];
    floatsGroup.remove(obj);
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) obj.material.dispose();
  }

  const minLat = 5.0, maxLat = 20.0;
  const minLon = 75.0, maxLon = 90.0;

  floatsData.forEach((float) => {
    const { float_id, lat, lon } = float;

    const normX = (lon - minLon) / (maxLon - minLon);
    const normZ = (lat - minLat) / (maxLat - minLat);

    const sceneX = (normX - 0.5) * 12.0;
    const sceneZ = -(normZ - 0.5) * 12.0;

    const markerGroup = new THREE.Group();
    markerGroup.position.set(sceneX, 0, sceneZ);
    markerGroup.userData = { float_id };

    // 1. Vertical Laser Column to Ocean Floor
    const laserGeo = new THREE.CylinderGeometry(0.02, 0.02, 14.5, 8);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.5,
    });
    const laserMesh = new THREE.Mesh(laserGeo, laserMat);
    laserMesh.position.y = -7.25;
    laserMesh.userData = { float_id };
    markerGroup.add(laserMesh);

    // 2. Floating Ocean Buoy Head
    const buoyHead = new THREE.Group();
    buoyHead.position.y = 0.5;
    buoyHead.userData = { float_id };

    // Central Emissive Orb
    const orbGeo = new THREE.SphereGeometry(0.32, 24, 24);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00d2ff,
      emissiveIntensity: 1.2,
      roughness: 0.1,
      metalness: 0.9,
    });
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    orbMesh.userData = { float_id };
    buoyHead.add(orbMesh);

    // Outer Spinning Gold Ring
    const ringGeo = new THREE.TorusGeometry(0.55, 0.02, 12, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb700,
      transparent: true,
      opacity: 0.9,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 3;
    ringMesh.userData = { float_id };
    buoyHead.add(ringMesh);

    // Pulsing Outer Radar Wave Octahedron
    const radarGeo = new THREE.OctahedronGeometry(0.7, 0);
    const radarMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const radarMesh = new THREE.Mesh(radarGeo, radarMat);
    radarMesh.userData = { float_id };
    buoyHead.add(radarMesh);

    markerGroup.add(buoyHead);
    floatsGroup.add(markerGroup);
  });
}
