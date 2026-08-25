import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Compass, ArrowRight, Layers, Navigation, Database, Sparkles } from 'lucide-react';
import { Globe3D } from '@/components/ui/3d-globe';
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';

function LandingStarfield() {
  return (
    <div className="fixed inset-0 w-full h-full z-0 pointer-events-none overflow-hidden">
      <Canvas
        gl={{ antialias: false, alpha: true }}
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 10], fov: 60 }}
        style={{ background: 'transparent', pointerEvents: 'none' }}
      >
        <Stars radius={100} depth={50} count={3500} factor={4} saturation={0} fade speed={1.0} />
      </Canvas>
    </div>
  );
}

const ACETERNITY_MARKERS = [
  {
    lat: 15.0,
    lng: 85.0,
    label: "Bay of Bengal EEZ",
    type: "pin",
  },
];



const EARTH_TEXTURE_URL = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@dev/examples/textures/planets/earth_atmos_2048.jpg";

// Domain Regions Metadata Schema (Reusable for multiple domains)
const DOMAIN_REGIONS = [
  {
    id: 'bay_of_bengal',
    name: 'Bay of Bengal / Indian EEZ',
    agency: 'MoES / INCOIS',
    status: 'OPERATIONAL DATASET',
    lat: 15.0,
    lon: 85.0,
    bounds: '6.59°N - 21.00°N | 78.65°E - 92.32°E',
    variables: ['Temperature', 'Salinity', 'Currents', 'Chlorophyll'],
    depthLevels: '0m - 3992m (Stacked)',
    description: 'High-resolution ocean hydrodynamic and biogeochemical model fields integrated with real-time Argo float observations.',
  }
];

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

// Generate realistic NASA-style Earth texture canvas fallback
function createProceduralEarthCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Deep Ocean Blue Base
  ctx.fillStyle = '#061329';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Ocean Bathymetry Depth Gradients
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  oceanGrad.addColorStop(0, '#040d1e');
  oceanGrad.addColorStop(0.3, '#091f3d');
  oceanGrad.addColorStop(0.7, '#071830');
  oceanGrad.addColorStop(1, '#030a17');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Continents (Realistic Landmass Silhouettes - India, Asia, Africa, Australia)
  ctx.fillStyle = '#1e3023'; // Realistic vegetation land green/brown
  ctx.strokeStyle = '#2d4734';
  ctx.lineWidth = 2;

  // Indian Subcontinent & Bay of Bengal (Centered on Lon 85E -> X ~1500)
  ctx.beginPath();
  ctx.ellipse(1500, 420, 240, 180, 0.2, 0, Math.PI * 2); // Asia landmass
  ctx.ellipse(1460, 520, 140, 120, -0.3, 0, Math.PI * 2); // Indian Peninsula
  ctx.ellipse(1720, 680, 110, 80, 0.4, 0, Math.PI * 2); // SE Asia & Indonesia
  ctx.ellipse(650, 480, 180, 220, -0.1, 0, Math.PI * 2); // Africa
  ctx.ellipse(1820, 780, 140, 100, 0, 0, Math.PI * 2); // Australia
  ctx.fill();

  ctx.strokeStyle = '#00d2ff';
  ctx.lineWidth = 1.0;
  ctx.stroke();

  return canvas;
}

// Generate realistic geographic map thumbnail for domain card visual anchor
function createDomainThumbnailDataUrl() {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#061329';
  ctx.fillRect(0, 0, 400, 180);

  const oceanGrad = ctx.createRadialGradient(250, 90, 10, 250, 90, 160);
  oceanGrad.addColorStop(0, '#0c284e');
  oceanGrad.addColorStop(0.6, '#081b36');
  oceanGrad.addColorStop(1, '#040f22');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, 400, 180);

  // Satellite Land Mass (India Peninsula & Bay of Bengal coast)
  ctx.fillStyle = '#18291d';
  ctx.strokeStyle = '#2c4533';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(150, 0);
  ctx.bezierCurveTo(130, 45, 100, 80, 70, 120);
  ctx.bezierCurveTo(50, 150, 30, 170, 0, 180);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(330, 0);
  ctx.lineTo(400, 0);
  ctx.lineTo(400, 180);
  ctx.lineTo(350, 180);
  ctx.bezierCurveTo(330, 120, 310, 70, 330, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bounding box outline for EEZ domain
  ctx.strokeStyle = 'rgba(0, 210, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(85, 25, 210, 130);
  ctx.setLineDash([]);

  ctx.fillStyle = '#00d2ff';
  ctx.fillRect(83, 23, 5, 5);
  ctx.fillRect(293, 23, 5, 5);
  ctx.fillRect(83, 153, 5, 5);
  ctx.fillRect(293, 153, 5, 5);

  // Label inside thumbnail
  ctx.fillStyle = 'rgba(0, 210, 255, 0.9)';
  ctx.font = 'bold 11px monospace';
  ctx.fillText('BAY OF BENGAL EEZ BOUNDS', 95, 45);

  return canvas.toDataURL();
}

export default function GlobeView({ onSelectRegion, floatsCount = 0 }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const globeMeshRef = useRef(null);
  const markerGroupRef = useRef(null);
  const markerAnchorRef = useRef(null);
  const controlsRef = useRef(null);

  const [screenPos, setScreenPos] = useState({ x: -1000, y: -1000, visible: false });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [activeDomainTile] = useState(DOMAIN_REGIONS[0]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [useAceternityGlobe, setUseAceternityGlobe] = useState(true);


  const isInteractingRef = useRef(false);
  const interactTimeoutRef = useRef(null);
  const isZoomingToRegionRef = useRef(false);

  useEffect(() => {
    setThumbnailUrl(createDomainThumbnailDataUrl());
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030712);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 2.5, 14.0); // Dominant realistic earth perspective
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.7;
    controls.minDistance = 6.5;
    controls.maxDistance = 20;
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

    // Realistic Sun & Atmospheric Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xd4e8ff, 0.45); // Dark space ambient
    scene.add(ambientLight);

    // Realistic Directional Sun Light creating Day/Night Terminator
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.8);
    sunLight.position.set(22, 10, 18);
    scene.add(sunLight);

    // Soft Rim Light from deep space
    const rimLight = new THREE.DirectionalLight(0x00d2ff, 0.4);
    rimLight.position.set(-20, -10, -15);
    scene.add(rimLight);

    // Starfield Points
    const starsGeo = new THREE.BufferGeometry();
    const starCount = 1600;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPositions[i] = (Math.random() - 0.5) * 200;
      starPositions[i + 1] = (Math.random() - 0.5) * 200;
      starPositions[i + 2] = (Math.random() - 0.5) * 200;
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.5, transparent: true, opacity: 0.5 });
    const starField = new THREE.Points(starsGeo, starsMat);
    scene.add(starField);

    // 3D Realistic Earth Sphere
    const sphereGeo = new THREE.SphereGeometry(5, 64, 64);
    const textureLoader = new THREE.TextureLoader();
    const globeMat = new THREE.MeshStandardMaterial({
      roughness: 0.65,
      metalness: 0.1,
    });

    textureLoader.load(
      EARTH_TEXTURE_URL,
      (texture) => {
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        globeMat.map = texture;
        globeMat.needsUpdate = true;
      },
      undefined,
      () => {
        const fallbackCanvas = createProceduralEarthCanvas();
        const texture = new THREE.CanvasTexture(fallbackCanvas);
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        globeMat.map = texture;
        globeMat.needsUpdate = true;
      }
    );

    const globeMesh = new THREE.Mesh(sphereGeo, globeMat);
    // Rotate globe initially so Indian Ocean & Bay of Bengal are perfectly centered!
    globeMesh.rotation.y = -Math.PI / 2.8;
    scene.add(globeMesh);
    globeMeshRef.current = globeMesh;

    // Subtle Blue Atmospheric Rim Shell
    const atmosGeo = new THREE.SphereGeometry(5.08, 64, 64);
    const atmosMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.14,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosMesh);

    // Minimal Scientific Region Indicator Marker (Geographically Anchored to Bay of Bengal 15N, 85E)
    const markerGroup = new THREE.Group();
    markerGroup.rotation.y = -Math.PI / 2.8;
    scene.add(markerGroup);
    markerGroupRef.current = markerGroup;

    const globeRadius = 5.0;
    const domain = DOMAIN_REGIONS[0];
    const markerPos = latLonToVector3(domain.lat, domain.lon, globeRadius);
    const surfaceNormal = markerPos.clone().normalize();

    const markerAnchor = new THREE.Group();
    markerAnchor.position.copy(markerPos);
    
    const upVector = new THREE.Vector3(0, 1, 0);
    markerAnchor.quaternion.setFromUnitVectors(upVector, surfaceNormal);
    markerAnchor.userData = { regionId: domain.id };
    markerAnchorRef.current = markerAnchor;

    // 1. Small cyan circular point sitting exactly on Earth surface
    const pointGeo = new THREE.SphereGeometry(0.08, 20, 20);
    const pointMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff });
    const pointMesh = new THREE.Mesh(pointGeo, pointMat);
    pointMesh.userData = { regionId: domain.id };
    markerAnchor.add(pointMesh);

    // 2. Subtle thin selection ring
    const ringGeo = new THREE.RingGeometry(0.1, 0.16, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.userData = { regionId: domain.id };
    markerAnchor.add(ringMesh);

    // 3. Faint outer expanding pulse ring
    const outerRingGeo = new THREE.RingGeometry(0.18, 0.22, 32);
    const outerRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.4,
    });
    const outerRingMesh = new THREE.Mesh(outerRingGeo, outerRingMat);
    outerRingMesh.rotation.x = Math.PI / 2;
    outerRingMesh.userData = { regionId: domain.id };
    markerAnchor.add(outerRingMesh);

    // 4. Thin Leader Line connecting surface point to label
    const leaderLineGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.6, 8);
    const leaderLineMat = new THREE.MeshBasicMaterial({ color: 0x00d2ff, transparent: true, opacity: 0.75 });
    const leaderLineMesh = new THREE.Mesh(leaderLineGeo, leaderLineMat);
    leaderLineMesh.position.y = 0.3;
    leaderLineMesh.userData = { regionId: domain.id };
    markerAnchor.add(leaderLineMesh);

    markerGroup.add(markerAnchor);

    // Raycaster
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const startRegionTransition = (regionId) => {
      if (isZoomingToRegionRef.current) return;
      isZoomingToRegionRef.current = true;
      setIsTransitioning(true);

      setTimeout(() => {
        if (onSelectRegion) onSelectRegion(regionId || domain.id);
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
        startRegionTransition(domain.id);
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
      } else {
        rendererRef.current.domElement.style.cursor = 'grab';
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
      animTime += 0.02;

      if (isZoomingToRegionRef.current && markerAnchorRef.current && cameraRef.current && controlsRef.current) {
        const markerWorldPos = new THREE.Vector3();
        markerAnchorRef.current.getWorldPosition(markerWorldPos);

        const targetCamPos = markerWorldPos.clone().multiplyScalar(1.35);
        cameraRef.current.position.lerp(targetCamPos, 0.08);
        controlsRef.current.target.lerp(markerWorldPos, 0.08);
      } else {
        controls.update();

        // Very subtle ambient earth rotation when idle
        if (!isInteractingRef.current && globeMeshRef.current) {
          globeMeshRef.current.rotation.y += 0.0006;
          markerGroupRef.current.rotation.y += 0.0006;
        }
      }

      // Gentle, slow ring pulse (expands & fades, no spinning)
      if (outerRingMesh) {
        const scaleVal = 1.0 + Math.sin(animTime * 1.5) * 0.25;
        const opacityVal = 0.4 - Math.sin(animTime * 1.5) * 0.2;
        outerRingMesh.scale.set(scaleVal, scaleVal, scaleVal);
        outerRingMesh.material.opacity = Math.max(0.05, opacityVal);
      }

      // 2D Screen Projection for Geographic Marker Label
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

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
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

  const handleEnterDomain = (regionId) => {
    if (isZoomingToRegionRef.current) return;
    isZoomingToRegionRef.current = true;
    setIsTransitioning(true);

    setTimeout(() => {
      if (onSelectRegion) onSelectRegion(regionId);
    }, 950);
  };

  return (
    <div className="relative w-screen h-screen bg-ocean-deep overflow-hidden select-none font-sans flex flex-col">
      {/* Screen Transition Overlay */}
      <div
        className={`absolute inset-0 bg-ocean-deep z-50 transition-opacity duration-700 pointer-events-none ${
          isTransitioning ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* 1. Full-Page Starfield Background Layer (100vw x 100vh) */}
      <LandingStarfield />

      {/* Top Right Hint */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-3">
        <div className="glass-panel px-4 py-2 rounded-2xl text-xs font-mono text-cyan-300 shadow-glass hidden sm:flex items-center gap-2 border border-ocean-border">
          <Compass className="w-4 h-4 text-cyan-400" />
          <span>Rotate Globe • Click Marker to Explore</span>
        </div>
      </div>

      {/* 2. Main Hero UI & Globe Content Layer */}
      <div className="relative w-full h-full pt-16 pb-8 px-6 lg:px-16 flex flex-col lg:flex-row items-center justify-between gap-6 z-10 overflow-y-auto lg:overflow-hidden pointer-events-none">
        
        {/* Left Column: Hero Text & Region Selection Cards */}
        <div className="w-full lg:w-1/2 max-w-xl flex flex-col justify-center gap-6 pointer-events-auto z-20 my-auto">
          {/* Eyebrow Label */}
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-cyan-glow" />
            <span className="text-xs font-bold font-mono tracking-widest text-cyan-400 uppercase">
              OCEAN 3D PLATFORM
            </span>
          </div>

          {/* Main Hero Title & Tagline */}
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight font-sans">
              3D OCEAN INTELLIGENCE
            </h1>
            <p className="text-base sm:text-lg font-semibold text-cyan-300 font-sans">
              Explore the ocean beneath the surface.
            </p>
          </div>

          {/* Platform Description */}
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-sans">
            An interactive 3D ocean intelligence platform providing real-time and predictive multi-depth visualization of hydrodynamic and biogeochemical variables such as <span className="text-cyan-300 font-mono font-medium">Temperature</span>, <span className="text-cyan-300 font-mono font-medium">Salinity</span>, <span className="text-cyan-300 font-mono font-medium">Currents</span>, and <span className="text-cyan-300 font-mono font-medium">Chlorophyll</span>.
          </p>

          {/* Region Cards Area */}
          <div className="pt-2">
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 mb-3">
              SELECTABLE OCEAN DOMAINS
            </p>
            <div className="flex flex-col sm:flex-row items-stretch gap-4">
              {/* 1. Bay of Bengal Card (Active Region) */}
              <div className="flex-1 bg-[#09152b]/90 backdrop-blur-xl p-4 rounded-2xl border border-cyan-500/50 hover:border-cyan-400 transition-all duration-200 shadow-xl flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-bold text-white tracking-wide font-sans">
                      BAY OF BENGAL
                    </h3>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 font-bold uppercase tracking-wider shrink-0">
                      ACTIVE
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans">
                    Indian EEZ • MoES / INCOIS
                  </p>
                  <p className="text-[11px] text-slate-300 mt-2 leading-snug">
                    Hydrodynamic & Biogeochemical model field (0m–3992m).
                  </p>
                  <div className="text-[10px] font-mono text-cyan-300/90 mt-2">
                    Active Argo Floats · 4 Variables
                  </div>
                </div>
                <button
                  onClick={() => handleEnterDomain(activeDomainTile.id)}
                  className="w-full mt-4 py-2.5 px-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider flex items-center justify-between shadow-md shadow-cyan-500/20 transition-all duration-200 group-hover:bg-cyan-400 cursor-pointer"
                >
                  <span>EXPLORE 3D DOMAIN</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* 2. Arabian Sea Card (Coming Soon Placeholder) */}
              <div className="flex-1 bg-[#09152b]/50 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50 opacity-70 flex flex-col justify-between select-none">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-bold text-slate-300 tracking-wide font-sans">
                      ARABIAN SEA
                    </h3>
                    <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-slate-800 text-amber-400 border border-amber-500/30 font-bold uppercase tracking-wider shrink-0">
                      COMING SOON
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-sans">
                    Indian EEZ Domain
                  </p>
                  <p className="text-[11px] text-slate-400 mt-2 leading-snug">
                    High-resolution hydrodynamic modeling dataset.
                  </p>
                  <div className="text-[10px] font-mono text-slate-400 mt-2">
                    Temperature · Salinity · Currents
                  </div>
                </div>
                <div className="w-full mt-4 py-2.5 px-3 rounded-xl bg-slate-800/60 border border-slate-700/50 text-slate-400 font-mono text-[10px] font-semibold uppercase tracking-wider text-center">
                  DATASET INACTIVE
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Rotating 3D Globe Container (Positioned on the Right Side) */}
        <div className="w-full lg:w-1/2 h-[420px] lg:h-[580px] relative pointer-events-auto flex items-center justify-center z-10">
          {useAceternityGlobe ? (
            <div className="w-full h-full">
              <Globe3D
                markers={ACETERNITY_MARKERS}
                className="w-full h-full"
                config={{
                  showAtmosphere: false,
                  atmosphereIntensity: 0,
                  bumpScale: 3,
                  autoRotateSpeed: 0.35,
                  enableZoom: true,
                  enablePan: false,
                  radius: 2.2,
                }}
                onMarkerClick={(marker) => {
                  console.log("Clicked marker:", marker.label);
                  if (marker.label === "Bay of Bengal EEZ") {
                    handleEnterDomain(activeDomainTile.id);
                  }
                }}
              />
            </div>
          ) : (
            <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          )}

          {/* Precise Geographic Marker Attached Label (Standard Mode Overlay) */}
          {screenPos.visible && !useAceternityGlobe && (
            <div
              style={{
                left: `${screenPos.x}px`,
                top: `${screenPos.y - 45}px`,
                transform: 'translate(-50%, -100%)',
              }}
              className="absolute z-20 cursor-pointer transition-transform duration-200 hover:scale-105 pointer-events-auto"
              onClick={() => handleEnterDomain(activeDomainTile.id)}
            >
              <div className="bg-ocean-deep/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-cyan-400/60 shadow-2xl flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
                  <Navigation className="w-3 h-3" />
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-bold text-white font-mono tracking-wider flex items-center gap-1 uppercase">
                    {activeDomainTile.name}
                    <ArrowRight className="w-3 h-3 text-cyan-400" />
                  </div>
                  <p className="text-[9px] text-slate-400 font-mono">{activeDomainTile.agency}</p>
                </div>
              </div>
              <div className="w-2 h-2 bg-ocean-deep border-r border-b border-cyan-400/60 rotate-45 mx-auto -mt-1" />
            </div>
          )}
        </div>

      </div>

      {/* Bottom Left Badge */}
      <div className="absolute bottom-6 left-6 z-20 hidden md:flex items-center gap-2.5 glass-panel-subtle px-4 py-2.5 rounded-2xl border border-ocean-border text-xs text-slate-400 font-mono">
        <Database className="w-4 h-4 text-cyan-400 shrink-0" />
        <span>High Resolution Earth Rendering</span>
      </div>
    </div>
  );
}


