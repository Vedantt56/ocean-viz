import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { evaluateColormapValue } from '../utils/colormaps.js';

// Increased vertical spacing between depth planes for visual clarity (Prompt F15)
const DEPTH_Y_MAPPING = {
  0: 0.0,
  50: -3.0,
  100: -6.0,
  200: -9.0,
  500: -12.0,
};

// Procedural noise generator for realistic 3D seafloor bathymetry terrain
function getSeafloorHeight(x, z) {
  const d = Math.sqrt(x * x + z * z);
  const trench = Math.sin(x * 0.4) * Math.cos(z * 0.4) * 1.2;
  const ridge = Math.cos(d * 0.5) * 0.8;
  const continentalSlope = (x + 8) * 0.25;
  return -14.5 + trench + ridge + continentalSlope;
}

// Generate realistic dark ocean bed texture with hillshading and sediment details
function createSeafloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#060d1a';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle sand/rock sediment texture pattern
  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const radius = Math.random() * 3 + 1;
    const shade = Math.floor(Math.random() * 35 + 10);
    ctx.fillStyle = `rgba(${shade}, ${shade + 15}, ${shade + 35}, 0.25)`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Contour lines on seafloor
  ctx.strokeStyle = 'rgba(0, 210, 255, 0.12)';
  ctx.lineWidth = 1.5;
  for (let r = 20; r < 250; r += 25) {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
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

    // 🌊 3D Sea Bed / Underwater Bathymetry Terrain Mesh
    const geo = new THREE.PlaneGeometry(16, 16, 64, 64);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      const vy = getSeafloorHeight(vx, vz);
      pos.setY(i, vy);
    }
    geo.computeVertexNormals();

    const seafloorMat = new THREE.MeshStandardMaterial({
      map: createSeafloorTexture(),
      roughness: 0.85,
      metalness: 0.15,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const seafloorMesh = new THREE.Mesh(geo, seafloorMat);
    seafloorMesh.receiveShadow = true;
    scene.add(seafloorMesh);

    // 📦 Glass Bounding Box Guide Lines
    const boundingGroup = new THREE.Group();
    scene.add(boundingGroup);

    const boxGeo = new THREE.BoxGeometry(12, 13.5, 12);
    const boxEdges = new THREE.EdgesGeometry(boxGeo);
    const boxMat = new THREE.LineBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.25 });
    const boxMesh = new THREE.LineSegments(boxEdges, boxMat);
    boxMesh.position.set(0, -6.0, 0);
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
        <div className="w-px h-4 bg-slate-700" />
        <div>
          Isolated Depth: <span className="text-cyan-400 font-bold">{activeDepth}m</span>
        </div>
      </div>
    </div>
  );
}

// 🛠️ Helper: Render Stacked 3D Slice Heatmaps with Crisp Borders & Adjacent-Only Focus (Prompt F15)
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

  // Sort unique available depths ascending
  const availableDepths = slicesData
    .map((s) => s.depth)
    .filter((d, i, arr) => arr.indexOf(d) === i)
    .sort((a, b) => a - b);

  const activeIndex = availableDepths.indexOf(activeDepth);

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

  const planeGeo = new THREE.PlaneGeometry(12, 12, 32, 32);
  const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(12, 12));

  slicesData.forEach((slice) => {
    const { depth, values } = slice;
    if (!values) return;

    const sliceIndex = availableDepths.indexOf(depth);
    const isSelected = depth === activeDepth;
    const isAdjacent = activeIndex !== -1 && Math.abs(sliceIndex - activeIndex) === 1;

    // F15 Rule 1: Only render active depth slice at high opacity (~0.92) + 2 adjacent depths at low opacity (~0.10)
    let opacity = 0.0;
    let isVisible = false;

    if (isSelected) {
      opacity = 0.92;
      isVisible = true;
    } else if (isAdjacent) {
      opacity = 0.10; // Spatial context slice
      isVisible = true;
    } else {
      // Hide all non-adjacent distant depth planes
      opacity = 0.0;
      isVisible = false;
    }

    if (renderMode === 'volume') {
      opacity = 0.70;
      isVisible = true;
    }

    const nrows = values.length;
    const ncols = values[0].length;

    let texture;
    if (depth === 0) {
      const surfCanvas = createCoastlineSurfaceCanvas(ncols, nrows, values, effectiveMin, effectiveMax, palette, scaleMode);
      texture = new THREE.CanvasTexture(surfCanvas);
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
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
      ctx.drawImage(rawCanvas, 0, 0, 256, 256);

      // White scientific isolines overlay
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      for (let y = 20; y < 256; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(256, y);
        ctx.stroke();
      }

      texture = new THREE.CanvasTexture(canvas);
    }

    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    // F15 Depth Material: depthWrite: false for clean stacked transparency
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: opacity,
      depthWrite: false,
      roughness: 0.3,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(planeGeo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = isVisible;

    const yPos = DEPTH_Y_MAPPING[depth] ?? (-depth * 0.024);
    mesh.position.set(0, yPos, 0);

    // F15 Rule 2: Crisp, high-contrast wireframe border around EVERY visible plane
    if (isVisible) {
      const borderMat = new THREE.LineBasicMaterial({
        color: isSelected ? 0x00ffff : 0x00d2ff,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.50,
      });
      const borderLine = new THREE.LineSegments(borderGeo, borderMat);
      mesh.add(borderLine);
    }

    slicesGroup.add(mesh);

    // F15 Rule 4: Leader lines terminating EXACTLY at plane edge (x = 6.0) + Depth Callout Labels
    if (depthLabelsGroup && isVisible) {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(6.0, yPos, 0.0), // Terminates exactly at right edge of plane
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
        map: createDepthLabelTexture(labelText, isSelected, isAdjacent),
        transparent: true,
        opacity: isSelected ? 1.0 : 0.75,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.set(8.2, yPos, 0.0);
      sprite.scale.set(1.8, 0.9, 1);
      depthLabelsGroup.add(sprite);
    }
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
