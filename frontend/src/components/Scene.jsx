import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { evaluateColormapValue } from '../utils/colormaps.js';

const DEPTH_Y_MAPPING = {
  0: 0.0,
  50: -2.0,
  100: -4.0,
  200: -6.0,
  500: -8.0,
};

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
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const slicesGroupRef = useRef(null);
  const floatsGroupRef = useRef(null);
  const sliceMaterialsRef = useRef({});
  const sliceCanvasesRef = useRef({});

  // 1. Three.js Scene, Controls, Lights, Grid & Raycasting Setup
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || (window.innerWidth - 288);
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1325);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 10, 18);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, -4, 0);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(12, 20, 12);
    scene.add(dirLight);

    // Mesh Groups
    const slicesGroup = new THREE.Group();
    scene.add(slicesGroup);
    slicesGroupRef.current = slicesGroup;

    const floatsGroup = new THREE.Group();
    scene.add(floatsGroup);
    floatsGroupRef.current = floatsGroup;

    // Seafloor Grid
    const baseGrid = new THREE.GridHelper(16, 16, 0x00d2ff, 0x1e2d4a);
    baseGrid.position.y = -10.0;
    scene.add(baseGrid);

    // Raycaster Setup
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
          console.log(`[Scene Raycaster] Clicked Argo Float Marker: ${clickedFloatId}`);
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

    // Animation Loop
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();

      if (floatsGroupRef.current) {
        floatsGroupRef.current.children.forEach((marker) => {
          marker.rotation.y += 0.015;
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
    setTimeout(handleResize, 50);

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

  // 2. Render Stacked Depth Slice Meshes with Client-Side Recoloring Support
  useEffect(() => {
    if (!slicesGroupRef.current || !slicesData || slicesData.length === 0) return;

    const slicesGroup = slicesGroupRef.current;

    while (slicesGroup.children.length > 0) {
      const obj = slicesGroup.children[0];
      slicesGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    }
    sliceMaterialsRef.current = {};
    sliceCanvasesRef.current = {};

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

    const planeGeo = new THREE.PlaneGeometry(12, 12, 1, 1);

    slicesData.forEach((slice) => {
      const { depth, values } = slice;
      if (!values) return;

      const nrows = values.length;
      const ncols = values[0].length;

      const canvas = document.createElement('canvas');
      canvas.width = ncols;
      canvas.height = nrows;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(ncols, nrows);

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
      ctx.putImageData(imgData, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;

      const isSelected = depth === activeDepth;
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.15,
        depthWrite: isSelected,
        roughness: 0.4,
        metalness: 0.1,
      });

      const mesh = new THREE.Mesh(planeGeo, material);
      mesh.rotation.x = -Math.PI / 2;

      const yPos = DEPTH_Y_MAPPING[depth] ?? (-depth * 0.015);
      mesh.position.set(0, yPos, 0);

      slicesGroup.add(mesh);
      sliceMaterialsRef.current[depth] = material;
      sliceCanvasesRef.current[depth] = { canvas, ctx, values, nrows, ncols };
    });
  }, [slicesData, palette, scaleMode, minOverride, maxOverride]);

  // 3. Render Argo Float Markers
  useEffect(() => {
    if (!floatsGroupRef.current || !floatsData) return;

    const floatsGroup = floatsGroupRef.current;

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
      const sceneY = 0.75;

      const markerGroup = new THREE.Group();
      markerGroup.position.set(sceneX, sceneY, sceneZ);
      markerGroup.userData = { float_id };

      const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
      const stemMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.85 });
      const stemMesh = new THREE.Mesh(stemGeo, stemMat);
      stemMesh.position.y = -0.5;
      stemMesh.userData = { float_id };
      markerGroup.add(stemMesh);

      const sphereGeo = new THREE.SphereGeometry(0.4, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00d2ff,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.8,
      });
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      sphereMesh.userData = { float_id };
      markerGroup.add(sphereMesh);

      const ringGeo = new THREE.OctahedronGeometry(0.6, 0);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        wireframe: true,
        transparent: true,
        opacity: 0.9,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.userData = { float_id };
      markerGroup.add(ringMesh);

      floatsGroup.add(markerGroup);
    });
  }, [floatsData]);

  // 4. In-Place Opacity Update on Depth Slider Change
  useEffect(() => {
    const materialsMap = sliceMaterialsRef.current;
    Object.keys(materialsMap).forEach((dStr) => {
      const depthVal = parseInt(dStr, 10);
      const mat = materialsMap[dStr];
      if (mat) {
        const isSelected = depthVal === activeDepth;
        mat.opacity = isSelected ? 0.95 : 0.15;
        mat.depthWrite = isSelected;
        mat.needsUpdate = true;
      }
    });
  }, [activeDepth]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="absolute top-4 right-4 bg-ocean-panel/80 backdrop-blur-md border border-ocean-border px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-300 shadow-md">
        Variable: <span className="text-white font-semibold">{activeVariable}</span> | Isolated Depth: <span className="text-white font-semibold">{activeDepth}m</span>
      </div>
    </div>
  );
}
