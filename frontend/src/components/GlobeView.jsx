import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Compass, ArrowRight, Sparkles } from 'lucide-react';

const EARTH_TEXTURE_URL = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/textures/planets/earth_atmos_2048.jpg";

// Demo Region Data
const DEMO_REGION = {
  id: 'bay_of_bengal',
  name: 'Bay of Bengal / EEZ',
  subtext: 'MoES Operational Ocean Domain',
  lat: 15.0,
  lon: 85.0,
};

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

function createProceduralEarthCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#061329';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#1B382B';
  ctx.beginPath();
  ctx.ellipse(750, 180, 160, 100, 0, 0, Math.PI * 2);
  ctx.ellipse(560, 260, 90, 120, 0, 0, Math.PI * 2);
  ctx.ellipse(260, 220, 80, 140, -0.2, 0, Math.PI * 2);
  ctx.ellipse(820, 360, 70, 50, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#00D2FF';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas;
}

export default function GlobeView({ onSelectRegion }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const globeMeshRef = useRef(null);
  const markerGroupRef = useRef(null);
  const markerAnchorRef = useRef(null);
  const crystalMeshRef = useRef(null);
  const innerTorusMeshRef = useRef(null);
  const outerTorusMeshRef = useRef(null);
  const outerRingMeshRef = useRef(null);
  const rippleMeshRef = useRef(null);
  const controlsRef = useRef(null);

  const [hoveredRegion, setHoveredRegion] = useState(null);
  const [screenPos, setScreenPos] = useState({ x: -1000, y: -1000, visible: false });
  const [isTransitioning, setIsTransitioning] = useState(false);

  const isInteractingRef = useRef(false);
  const interactTimeoutRef = useRef(null);
  const isZoomingToRegionRef = useRef(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040812);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 4, 14);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.8;
    controls.minDistance = 6;
    controls.maxDistance = 25;
    controlsRef.current = controls;

    const handleStartInteraction = () => {
      isInteractingRef.current = true;
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
    };

    const handleEndInteraction = () => {
      if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
      interactTimeoutRef.current = setTimeout(() => {
        isInteractingRef.current = false;
      }, 3000);
    };

    controls.addEventListener('start', handleStartInteraction);
    controls.addEventListener('end', handleEndInteraction);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.25);
    sunLight.position.set(15, 12, 15);
    scene.add(sunLight);

    // Starfield Background
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 1200;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 180;
      starPositions[i + 1] = (Math.random() - 0.5) * 180;
      starPositions[i + 2] = (Math.random() - 0.5) * 180;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0x88ccee, size: 0.6, transparent: true, opacity: 0.7 });
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);

    // 3D Globe Mesh
    const sphereGeo = new THREE.SphereGeometry(5, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const globeMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1 });

    textureLoader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        globeMat.map = texture;
        globeMat.needsUpdate = true;
      },
      undefined,
      () => {
        const fallbackCanvas = createProceduralEarthCanvas();
        globeMat.map = new THREE.CanvasTexture(fallbackCanvas);
        globeMat.needsUpdate = true;
      }
    );

    const globeMesh = new THREE.Mesh(sphereGeo, globeMat);
    scene.add(globeMesh);
    globeMeshRef.current = globeMesh;

    // Atmospheric Outer Glow
    const atmosGeo = new THREE.SphereGeometry(5.12, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.18,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosMesh);

    // Classy Region Holographic Beacon Marker
    const markerGroup = new THREE.Group();
    scene.add(markerGroup);
    markerGroupRef.current = markerGroup;

    const globeRadius = 5.0;
    const markerPos = latLonToVector3(DEMO_REGION.lat, DEMO_REGION.lon, globeRadius);
    const surfaceNormal = markerPos.clone().normalize();

    // Anchor Object for the region marker
    const markerAnchor = new THREE.Group();
    markerAnchor.position.copy(markerPos);
    
    // Orient marker perpendicularly to the sphere surface
    const upVector = new THREE.Vector3(0, 1, 0);
    markerAnchor.quaternion.setFromUnitVectors(upVector, surfaceNormal);
    markerAnchor.userData = { regionId: DEMO_REGION.id };
    markerAnchorRef.current = markerAnchor;

    // 1. Surface Radar Target Base Ring (Inner Solid Ring)
    const innerRingGeo = new THREE.RingGeometry(0.12, 0.22, 32);
    const innerRingMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const innerRingMesh = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRingMesh.rotation.x = Math.PI / 2; // Flat on surface
    innerRingMesh.userData = { regionId: DEMO_REGION.id };
    markerAnchor.add(innerRingMesh);

    // 2. Outer Rotating Radar Ring (Dashed Outer Ring)
    const outerRingGeo = new THREE.RingGeometry(0.42, 0.48, 32);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
      wireframe: true,
    });
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRingMesh.rotation.x = Math.PI / 2;
    outerRingMesh.userData = { regionId: DEMO_REGION.id };
    markerAnchor.add(outerRingMesh);
    outerRingMeshRef.current = outerRingMesh;

    // 3. Expanding Sonar Ripple Wave Ring
    const rippleGeo = new THREE.RingGeometry(0.1, 0.16, 32);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const rippleMesh = new THREE.Mesh(rippleGeo, rippleMat);
    rippleMesh.rotation.x = Math.PI / 2;
    rippleMesh.userData = { regionId: DEMO_REGION.id };
    markerAnchor.add(rippleMesh);
    rippleMeshRef.current = rippleMesh;

    // 4. Slender Precision Laser Needle Stem
    const beamGeo = new THREE.CylinderGeometry(0.008, 0.035, 1.2, 16);
    const beamMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.75,
      roughness: 0.05,
    });
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.y = 0.6;
    beamMesh.userData = { regionId: DEMO_REGION.id };
    markerAnchor.add(beamMesh);

    // 5. Ultra-Classy Dual-Ring Gyro Beacon Head
    const headGroup = new THREE.Group();
    headGroup.position.y = 1.2;
    headGroup.userData = { regionId: DEMO_REGION.id };

    // Core Pearl Micro Sphere Head
    const orbGeo = new THREE.SphereGeometry(0.10, 24, 24);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x00ffff,
      emissiveIntensity: 1.2,
      roughness: 0.1,
      metalness: 0.9,
    });
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    orbMesh.userData = { regionId: DEMO_REGION.id };
    headGroup.add(orbMesh);

    // Outer Translucent Aura Shell
    const auraGeo = new THREE.SphereGeometry(0.17, 16, 16);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.userData = { regionId: DEMO_REGION.id };
    headGroup.add(auraMesh);

    // Inner Gyro Orbital Ring (Cyan)
    const innerTorusGeo = new THREE.TorusGeometry(0.24, 0.012, 12, 32);
    const innerTorusMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.95,
    });
    const innerTorusMesh = new THREE.Mesh(innerTorusGeo, innerTorusMat);
    innerTorusMesh.rotation.x = Math.PI / 4;
    innerTorusMesh.userData = { regionId: DEMO_REGION.id };
    headGroup.add(innerTorusMesh);
    innerTorusMeshRef.current = innerTorusMesh;

    // Outer Gyro Orbital Ring (Gold/Amber Counter-Rotating)
    const outerTorusGeo = new THREE.TorusGeometry(0.32, 0.010, 12, 32);
    const outerTorusMat = new THREE.MeshBasicMaterial({
      color: 0xffb700,
      transparent: true,
      opacity: 0.85,
    });
    const outerTorusMesh = new THREE.Mesh(outerTorusGeo, outerTorusMat);
    outerTorusMesh.rotation.x = -Math.PI / 4;
    outerTorusMesh.userData = { regionId: DEMO_REGION.id };
    headGroup.add(outerTorusMesh);
    outerTorusMeshRef.current = outerTorusMesh;

    markerAnchor.add(headGroup);
    crystalMeshRef.current = headGroup;

    markerGroup.add(markerAnchor);

    // Raycasting Setup
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const startRegionTransition = () => {
      if (isZoomingToRegionRef.current) return;
      isZoomingToRegionRef.current = true;
      setIsTransitioning(true);

      setTimeout(() => {
        if (onSelectRegion) onSelectRegion(DEMO_REGION.id);
      }, 950);
    };

    const handlePointerDown = (event) => {
      if (!rendererRef.current || !cameraRef.current || isZoomingToRegionRef.current) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(markerGroupRef.current.children, true);

      if (intersects.length > 0) {
        startRegionTransition();
      }
    };

    const handlePointerMove = (event) => {
      if (!rendererRef.current || !cameraRef.current || isZoomingToRegionRef.current) return;
      const rect = rendererRef.current.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, cameraRef.current);
      const intersects = raycaster.intersectObjects(markerGroupRef.current.children, true);

      if (intersects.length > 0) {
        rendererRef.current.domElement.style.cursor = 'pointer';
        setHoveredRegion(DEMO_REGION);
      } else {
        rendererRef.current.domElement.style.cursor = 'grab';
        setHoveredRegion(null);
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointerdown', handlePointerDown);
    domElem.addEventListener('pointermove', handlePointerMove);

    // Animation Loop
    let animationFrameId;
    let animTime = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      animTime += 0.03;

      // Camera Lerp Zoom to Region on click
      if (isZoomingToRegionRef.current && markerAnchorRef.current && cameraRef.current && controlsRef.current) {
        const markerWorldPos = new THREE.Vector3();
        markerAnchorRef.current.getWorldPosition(markerWorldPos);

        const targetCamPos = markerWorldPos.clone().multiplyScalar(1.38);
        cameraRef.current.position.lerp(targetCamPos, 0.08);
        controlsRef.current.target.lerp(markerWorldPos, 0.08);
      } else {
        controls.update();

        // Slow ambient globe auto-rotation when idle
        if (!isInteractingRef.current && globeMeshRef.current) {
          globeMeshRef.current.rotation.y += 0.0012;
          markerGroupRef.current.rotation.y += 0.0012;
        }
      }

      // Classy Marker Animations:
      // 1. Gentle floating levitation bobbing motion
      if (crystalMeshRef.current) {
        crystalMeshRef.current.position.y = 1.2 + Math.sin(animTime * 2.2) * 0.05;
      }

      // 2. Counter-rotating Dual Gyro Rings
      if (innerTorusMeshRef.current) {
        innerTorusMeshRef.current.rotation.z += 0.025;
        innerTorusMeshRef.current.rotation.y += 0.015;
      }
      if (outerTorusMeshRef.current) {
        outerTorusMeshRef.current.rotation.z -= 0.03;
        outerTorusMeshRef.current.rotation.x += 0.015;
      }

      // 3. Expanding Sonar Wave Ripple
      if (rippleMeshRef.current) {
        const rippleScale = 1.0 + ((animTime * 1.5) % 3.0);
        const rippleOpacity = Math.max(0, 1.0 - rippleScale / 4.0);
        rippleMeshRef.current.scale.set(rippleScale, rippleScale, rippleScale);
        rippleMeshRef.current.material.opacity = rippleOpacity;
      }

      // 2D Screen Projection for HTML Hover Badge
      if (cameraRef.current && markerAnchor) {
        const worldPos = new THREE.Vector3();
        markerAnchor.getWorldPosition(worldPos);

        const camToMarker = worldPos.clone().sub(cameraRef.current.position);
        const normal = worldPos.clone().normalize();
        const dot = camToMarker.dot(normal);

        if (dot < 0 && !isZoomingToRegionRef.current) {
          const projected = worldPos.clone().project(cameraRef.current);
          const screenX = ((projected.x + 1) * width) / 2;
          const screenY = ((-projected.y + 1) * height) / 2;
          setScreenPos({ x: screenX, y: screenY, visible: true });
        } else {
          setScreenPos((prev) => ({ ...prev, visible: false }));
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      controls.removeEventListener('start', handleStartInteraction);
      controls.removeEventListener('end', handleEndInteraction);
      domElem.removeEventListener('pointerdown', handlePointerDown);
      domElem.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [onSelectRegion]);

  const handleManualSelect = () => {
    if (isZoomingToRegionRef.current) return;
    isZoomingToRegionRef.current = true;
    setIsTransitioning(true);

    setTimeout(() => {
      if (onSelectRegion) onSelectRegion(DEMO_REGION.id);
    }, 950);
  };

  return (
    <div className="relative w-screen h-screen bg-ocean-dark overflow-hidden select-none">
      {/* Fade Crossfade Overlay */}
      <div
        className={`absolute inset-0 bg-slate-950 z-40 transition-opacity duration-700 pointer-events-none ${
          isTransitioning ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 3D Three.js Canvas Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Header Badge */}
      <div className="absolute top-6 left-6 z-10 flex items-center gap-3 bg-ocean-panel/85 backdrop-blur-md border border-ocean-border/80 px-4 py-2.5 rounded-xl shadow-2xl">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
        <div>
          <h1 className="text-sm font-bold text-white tracking-wider uppercase">
            Global Ocean 3D Platform
          </h1>
          <p className="text-[11px] text-slate-400 font-mono">SIH PS 26067 • MoES / INCOIS</p>
        </div>
      </div>

      {/* Top Right Navigation Hint */}
      <div className="absolute top-6 right-6 z-10 bg-ocean-panel/80 backdrop-blur-md border border-ocean-border px-3.5 py-2 rounded-xl text-xs font-mono text-cyan-300 shadow-lg flex items-center gap-2">
        <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
        <span>Rotate Globe • Click Holographic Marker to Explore</span>
      </div>

      {/* Classy HTML Hover Badge Overlay (Tracks 3D Holographic Marker) */}
      {screenPos.visible && (
        <div
          style={{
            left: `${screenPos.x}px`,
            top: `${screenPos.y - 75}px`,
            transform: 'translate(-50%, -100%)',
          }}
          className={`absolute pointer-events-none transition-all duration-200 z-20 ${
            hoveredRegion ? 'opacity-100 scale-105' : 'opacity-90'
          }`}
        >
          <div className="bg-ocean-panel/95 backdrop-blur-xl border border-cyan-400/70 px-4 py-2.5 rounded-2xl shadow-2xl shadow-cyan-950/80 flex items-center gap-3 text-left">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-slate-950 shadow-md">
              <Sparkles className="w-4.5 h-4.5 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-bold text-white tracking-wide font-sans flex items-center gap-1.5 uppercase">
                {DEMO_REGION.name}
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <p className="text-[10px] text-cyan-300 font-mono">{DEMO_REGION.subtext}</p>
            </div>
          </div>
          <div className="w-3 h-3 bg-ocean-panel border-r border-b border-cyan-400/70 rotate-45 mx-auto -mt-1.5 shadow-sm" />
        </div>
      )}

      {/* Bottom Floating Call-to-Action Button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <button
          onClick={handleManualSelect}
          className="px-6 py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm flex items-center gap-2.5 shadow-2xl shadow-cyan-500/30 hover:scale-105 transition-all duration-200"
        >
          <Sparkles className="w-4 h-4" />
          Enter Bay of Bengal Domain (3D Depth Slices)
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
