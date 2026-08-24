import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { animate } from 'animejs';
import { evaluateColormapValue } from '../utils/colormaps.js';

const FOOTPRINT_X = 15;
const FOOTPRINT_Z = 11.5;
const TILE_THICKNESS = 0.28;
const DEFAULT_LON_RANGE = [75, 90];
const DEFAULT_LAT_RANGE = [5, 20];

const VARIABLE_UNITS = {
  temperature: 'deg C',
  salinity: 'PSU',
  currents: 'm/s',
  chlorophyll: 'mg/m3',
};

function getDepthYPosition(depth, availableDepths = [], verticalExaggeration = 1) {
  const depths = availableDepths && availableDepths.length ? availableDepths : [0];
  const minD = Math.min(...depths);
  const maxD = Math.max(...depths, 1);
  const t = maxD > minD ? (depth - minD) / (maxD - minD) : 0;
  return -Math.pow(Math.max(0, Math.min(1, t)), 0.72) * 8.8 * verticalExaggeration;
}

function getSceneMetrics(availableDepths, verticalExaggeration) {
  const depths = availableDepths && availableDepths.length ? availableDepths : [0];
  const deepest = Math.min(...depths.map((d) => getDepthYPosition(d, depths, verticalExaggeration)), -8.8);
  return {
    surfaceY: 0,
    deepestSliceY: deepest,
    waterCenterY: deepest / 2,
    waterHeight: Math.abs(deepest) + 0.5,
    seafloorY: deepest - 1.1,
  };
}

function disposeObject(obj) {
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        Object.values(material).forEach((value) => {
          if (value && value.isTexture) value.dispose();
        });
        material.dispose();
      });
    }
  });
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function collectFieldRange(slicesData) {
  let min = Infinity;
  let max = -Infinity;
  slicesData.forEach((slice) => {
    slice.values?.forEach((row) => {
      row.forEach((value) => {
        if (Number.isFinite(value)) {
          min = Math.min(min, value);
          max = Math.max(max, value);
        }
      });
    });
  });

  return min === Infinity ? { min: 0, max: 1 } : { min, max };
}

function getDomainBounds(slicesData) {
  const sliceWithCoords = slicesData.find((slice) => slice.lat?.length && slice.lon?.length);
  if (!sliceWithCoords) {
    return {
      minLat: DEFAULT_LAT_RANGE[0],
      maxLat: DEFAULT_LAT_RANGE[1],
      minLon: DEFAULT_LON_RANGE[0],
      maxLon: DEFAULT_LON_RANGE[1],
    };
  }

  return {
    minLat: Math.min(...sliceWithCoords.lat),
    maxLat: Math.max(...sliceWithCoords.lat),
    minLon: Math.min(...sliceWithCoords.lon),
    maxLon: Math.max(...sliceWithCoords.lon),
  };
}

function projectLonLat(lon, lat, bounds) {
  const lonT = bounds.maxLon > bounds.minLon ? (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon) : 0.5;
  const latT = bounds.maxLat > bounds.minLat ? (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat) : 0.5;
  return {
    x: (lonT - 0.5) * FOOTPRINT_X,
    z: -(latT - 0.5) * FOOTPRINT_Z,
  };
}

function sampleGrid(values, u, v) {
  const rows = values?.length ?? 0;
  const cols = values?.[0]?.length ?? 0;
  if (!rows || !cols) return null;

  const x = Math.max(0, Math.min(cols - 1, u * (cols - 1)));
  const y = Math.max(0, Math.min(rows - 1, (1 - v) * (rows - 1)));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(cols - 1, x0 + 1);
  const y1 = Math.min(rows - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const v00 = values[y0][x0];
  const v10 = values[y0][x1];
  const v01 = values[y1][x0];
  const v11 = values[y1][x1];
  const valid = [v00, v10, v01, v11].filter(Number.isFinite);
  if (!valid.length) return null;

  const fallback = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  const a = Number.isFinite(v00) ? v00 : fallback;
  const b = Number.isFinite(v10) ? v10 : fallback;
  const c = Number.isFinite(v01) ? v01 : fallback;
  const d = Number.isFinite(v11) ? v11 : fallback;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

function createRealTileGroup(slice, props, effectiveRange) {
  const {
    activeDepth,
    availableDepths,
    palette,
    scaleMode,
    renderMode,
    verticalExaggeration,
    sliceOpacity,
  } = props;

  const segmentsX = 120;
  const segmentsZ = 92;
  const vertexCount = (segmentsX + 1) * (segmentsZ + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const alphas = new Float32Array(vertexCount);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = [];

  const initialDepthY = getDepthYPosition(slice.depth, availableDepths, verticalExaggeration);
  const sortedDepths = [...availableDepths].sort((a, b) => a - b);
  const maxDepth = Math.max(...sortedDepths, 1);
  const depthT = Math.max(0, Math.min(1, slice.depth / maxDepth));
  const isSelected = slice.depth === activeDepth;
  const activeIndex = Math.max(0, sortedDepths.indexOf(activeDepth));
  const sliceIndex = Math.max(0, sortedDepths.indexOf(slice.depth));
  const indexDistance = Math.abs(sliceIndex - activeIndex);
  const range = effectiveRange.max - effectiveRange.min || 1;
  const baseOpacity = sliceOpacity ?? 0.9;
  // Stacked Slices mode: keep every tile clearly visible; only a mild lift for the active one
  const sliceStrengths = [1.0, 0.30, 0.16, 0.10, 0.07];
  // Volumetric mode: intentionally more see-through so you can peer through the stack
  const volumeStrengths = [0.92, 0.42, 0.26, 0.18, 0.13];
  const focus = renderMode === 'volume'
    ? volumeStrengths[Math.min(indexDistance, volumeStrengths.length - 1)]
    : sliceStrengths[Math.min(indexDistance, sliceStrengths.length - 1)];
  const layerOpacity = baseOpacity * focus;

  let ptr = 0;
  for (let iz = 0; iz <= segmentsZ; iz += 1) {
    const v = iz / segmentsZ;
    for (let ix = 0; ix <= segmentsX; ix += 1) {
      const u = ix / segmentsX;
      const x = (u - 0.5) * FOOTPRINT_X;
      const z = (v - 0.5) * FOOTPRINT_Z;
      const value = sampleGrid(slice.values, u, v);
      const normalized = Number.isFinite(value) ? Math.max(0, Math.min(1, (value - effectiveRange.min) / range)) : 0.5;
      const [r, g, b] = evaluateColormapValue(value, effectiveRange.min, effectiveRange.max, palette, scaleMode);
      const alpha = Number.isFinite(value) ? Math.max(0, Math.min(1, layerOpacity)) : 0;

      const wave1 = Math.sin(u * 9.0 + v * 7.0) * Math.cos(v * 8.0 - u * 6.0);
      const wave2 = Math.sin(u * 18.0 - v * 14.0) * 0.35 * Math.cos(u * 12.0 + v * 16.0);
      const organicWave = (wave1 + wave2) * 0.26;
      const waveRelief = (normalized - 0.5) * 0.50 + organicWave * (0.35 - depthT * 0.15);

      positions[ptr * 3] = x;
      positions[ptr * 3 + 1] = waveRelief;
      positions[ptr * 3 + 2] = z;
      colors[ptr * 3] = r / 255;
      colors[ptr * 3 + 1] = g / 255;
      colors[ptr * 3 + 2] = b / 255;
      alphas[ptr] = alpha;
      uvs[ptr * 2] = u;
      uvs[ptr * 2 + 1] = v;
      ptr += 1;
    }
  }

  for (let iz = 0; iz < segmentsZ; iz += 1) {
    for (let ix = 0; ix < segmentsX; ix += 1) {
      const a = iz * (segmentsX + 1) + ix;
      const b = a + 1;
      const c = a + segmentsX + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const topGeometry = new THREE.BufferGeometry();
  topGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  topGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  topGeometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
  topGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  topGeometry.setIndex(indices);
  topGeometry.computeVertexNormals();

  const topMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uDepthTint: { value: depthT },
      uSelectedBoost: { value: isSelected ? 0.20 : 0.0 },
      uLayerOpacity: { value: layerOpacity },
      uLightDirection: { value: new THREE.Vector3(-0.35, 0.82, 0.45).normalize() },
    },
    vertexShader: `
      attribute float alpha;
      varying vec3 vColor;
      varying float vAlpha;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uDepthTint;
      uniform float uSelectedBoost;
      uniform float uLayerOpacity;
      uniform vec3 uLightDirection;
      varying vec3 vColor;
      varying float vAlpha;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 normal = normalize(gl_FrontFacing ? vWorldNormal : -vWorldNormal);
        vec3 lightDirection = normalize(uLightDirection);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        vec3 halfVector = normalize(lightDirection + viewDirection);

        float frontDiffuse = max(dot(normal, lightDirection), 0.0);
        float backDiffuse = max(dot(-normal, lightDirection), 0.0) * 0.45;
        float diffuse = 0.82 + frontDiffuse * 0.28 + backDiffuse * 0.15;
        float specular = pow(max(dot(normal, halfVector), 0.0), 32.0) * 0.18 * (1.0 - uDepthTint * 0.4);

        vec3 shaded = vColor * diffuse + vec3(specular) + uSelectedBoost * vec3(0.20, 0.22, 0.28);
        gl_FragColor = vec4(shaded, vAlpha * uLayerOpacity);
      }
    `,
    vertexColors: true,
    blending: THREE.NormalBlending,
  });

  const topMesh = new THREE.Mesh(topGeometry, topMaterial);

  const perimeterTopPoints = [];
  const perimeterGridIndices = [];

  for (let ix = 0; ix <= segmentsX; ix++) perimeterGridIndices.push(0 * (segmentsX + 1) + ix);
  for (let iz = 1; iz <= segmentsZ; iz++) perimeterGridIndices.push(iz * (segmentsX + 1) + segmentsX);
  for (let ix = segmentsX - 1; ix >= 0; ix--) perimeterGridIndices.push(segmentsZ * (segmentsX + 1) + ix);
  for (let iz = segmentsZ - 1; iz >= 1; iz--) perimeterGridIndices.push(iz * (segmentsX + 1) + 0);

  const numPerimeterPoints = perimeterGridIndices.length;
  const sidePositions = new Float32Array(numPerimeterPoints * 2 * 3);
  const sideUvs = new Float32Array(numPerimeterPoints * 2 * 2);
  const sideIndices = [];

  for (let i = 0; i < numPerimeterPoints; i++) {
    const gIdx = perimeterGridIndices[i];
    const px = positions[gIdx * 3];
    const py = positions[gIdx * 3 + 1];
    const pz = positions[gIdx * 3 + 2];
    perimeterTopPoints.push(new THREE.Vector3(px, py, pz));

    sidePositions[(i * 2) * 3] = px;
    sidePositions[(i * 2) * 3 + 1] = py;
    sidePositions[(i * 2) * 3 + 2] = pz;
    sideUvs[(i * 2) * 2] = i / numPerimeterPoints;
    sideUvs[(i * 2) * 2 + 1] = 1.0;

    sidePositions[(i * 2 + 1) * 3] = px;
    sidePositions[(i * 2 + 1) * 3 + 1] = -TILE_THICKNESS;
    sidePositions[(i * 2 + 1) * 3 + 2] = pz;
    sideUvs[(i * 2 + 1) * 2] = i / numPerimeterPoints;
    sideUvs[(i * 2 + 1) * 2 + 1] = 0.0;
  }

  for (let i = 0; i < numPerimeterPoints; i++) {
    const currentTop = i * 2;
    const currentBot = i * 2 + 1;
    const nextTop = ((i + 1) % numPerimeterPoints) * 2;
    const nextBot = ((i + 1) % numPerimeterPoints) * 2 + 1;

    sideIndices.push(currentTop, currentBot, nextTop);
    sideIndices.push(nextTop, currentBot, nextBot);
  }

  const sideGeometry = new THREE.BufferGeometry();
  sideGeometry.setAttribute('position', new THREE.BufferAttribute(sidePositions, 3));
  sideGeometry.setAttribute('uv', new THREE.BufferAttribute(sideUvs, 2));
  sideGeometry.setIndex(sideIndices);
  sideGeometry.computeVertexNormals();

  const sideMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uDepthTint: { value: depthT },
      uSelectedBoost: { value: isSelected ? 0.22 : 0.0 },
      uLayerOpacity: { value: layerOpacity },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vYRel;
      void main() {
        vYRel = position.y;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uDepthTint;
      uniform float uSelectedBoost;
      uniform float uLayerOpacity;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vYRel;
      void main() {
        vec3 lightDir = normalize(vec3(-0.35, 0.82, 0.45));
        vec3 normal = normalize(gl_FrontFacing ? vNormal : -vNormal);
        float diff = max(dot(normal, lightDir), 0.0) * 0.45 + 0.55;

        float topGradient = smoothstep(-0.30, 0.08, vYRel);
        vec3 topColor = mix(vec3(0.06, 0.28, 0.40), vec3(0.02, 0.14, 0.24), uDepthTint);
        vec3 bottomColor = vec3(0.01, 0.05, 0.12);
        vec3 slabColor = mix(bottomColor, topColor, topGradient) * diff;

        vec3 activeGlow = vec3(0.0, 0.65, 0.85) * uSelectedBoost * (0.4 + topGradient * 0.6);
        vec3 finalColor = slabColor + activeGlow;

        float alpha = (0.75 + topGradient * 0.20 + uSelectedBoost * 0.20) * uLayerOpacity;
        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
  });

  const sideMesh = new THREE.Mesh(sideGeometry, sideMaterial);

  const bottomGeometry = new THREE.PlaneGeometry(FOOTPRINT_X, FOOTPRINT_Z);
  const bottomMaterial = new THREE.MeshBasicMaterial({
    color: 0x040e1a,
    transparent: true,
    opacity: layerOpacity * 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial);
  bottomMesh.rotation.x = Math.PI / 2;
  bottomMesh.position.y = -TILE_THICKNESS;

  const frameGeometry = new THREE.BufferGeometry().setFromPoints([
    ...perimeterTopPoints,
    perimeterTopPoints[0].clone(),
  ]);
  const frameMaterial = new THREE.LineBasicMaterial({
    color: isSelected ? 0x00f0ff : 0x2c5a78,
    transparent: true,
    opacity: isSelected ? 0.85 : 0.45,
  });
  const frameLine = new THREE.Line(frameGeometry, frameMaterial);

  const bottomPerimeterPoints = perimeterTopPoints.map(
    (p) => new THREE.Vector3(p.x, -TILE_THICKNESS, p.z)
  );
  const bottomFrameGeometry = new THREE.BufferGeometry().setFromPoints([
    ...bottomPerimeterPoints,
    bottomPerimeterPoints[0].clone(),
  ]);
  const bottomFrameMaterial = new THREE.LineBasicMaterial({
    color: isSelected ? 0x00c4e6 : 0x142b3a,
    transparent: true,
    opacity: isSelected ? 0.45 : 0.12,
  });
  const bottomFrameLine = new THREE.Line(bottomFrameGeometry, bottomFrameMaterial);

  const tileGroup = new THREE.Group();
  tileGroup.add(bottomMesh);
  tileGroup.add(sideMesh);
  tileGroup.add(topMesh);
  tileGroup.add(frameLine);
  tileGroup.add(bottomFrameLine);

  const initialY = initialDepthY + (isSelected ? 0.22 : 0);
  tileGroup.position.y = initialY;
  tileGroup.scale.set(isSelected ? 1.015 : 1.0, 1.0, isSelected ? 1.015 : 1.0);

  tileGroup.userData = {
    depth: slice.depth,
    topMesh,
    sideMesh,
    bottomMesh,
    frameLine,
    bottomFrameLine,
    currentY: initialY,
    targetY: initialY,
    currentOpacity: layerOpacity,
    targetOpacity: layerOpacity,
    currentBoost: isSelected ? 0.20 : 0.0,
    targetBoost: isSelected ? 0.20 : 0.0,
    currentScale: isSelected ? 1.015 : 1.0,
    targetScale: isSelected ? 1.015 : 1.0,
  };

  return tileGroup;
}

function animateTileTransitions(sliceTilesMap, depthGuidesGroup, props) {
  const { activeDepth, availableDepths, verticalExaggeration, renderMode, sliceOpacity } = props;
  const sortedDepths = [...availableDepths].sort((a, b) => a - b);
  const activeIndex = Math.max(0, sortedDepths.indexOf(activeDepth));
  const baseOpacity = sliceOpacity ?? 0.92;
  const sliceStrengths = [1.0, 0.30, 0.16, 0.10, 0.07];
  const volumeStrengths = [0.92, 0.42, 0.26, 0.18, 0.13];

  sliceTilesMap.forEach((tileGroup, depth) => {
    const sliceIndex = Math.max(0, sortedDepths.indexOf(depth));
    const indexDistance = Math.abs(sliceIndex - activeIndex);
    const isSelected = depth === activeDepth;
    const depthY = getDepthYPosition(depth, availableDepths, verticalExaggeration);

    const targetY = isSelected ? depthY + 0.22 : depthY;
    const focus = renderMode === 'volume'
      ? volumeStrengths[Math.min(indexDistance, volumeStrengths.length - 1)]
      : sliceStrengths[Math.min(indexDistance, sliceStrengths.length - 1)];
    const targetOpacity = baseOpacity * focus;
    const targetBoost = isSelected ? 0.24 : 0.0;
    const targetScale = isSelected ? 1.015 : 1.0;

    const animData = tileGroup.userData;

    animate(animData, {
      currentY: targetY,
      currentOpacity: targetOpacity,
      currentBoost: targetBoost,
      currentScale: targetScale,
      duration: 650,
      ease: 'outCubic',
      onUpdate: () => {
        tileGroup.position.y = animData.currentY;
        tileGroup.scale.set(animData.currentScale, 1.0, animData.currentScale);

        if (animData.topMesh?.material?.uniforms) {
          animData.topMesh.material.uniforms.uLayerOpacity.value = animData.currentOpacity;
          animData.topMesh.material.uniforms.uSelectedBoost.value = animData.currentBoost;
        }
        if (animData.sideMesh?.material?.uniforms) {
          animData.sideMesh.material.uniforms.uLayerOpacity.value = animData.currentOpacity;
          animData.sideMesh.material.uniforms.uSelectedBoost.value = animData.currentBoost;
        }
        if (animData.bottomMesh?.material) {
          animData.bottomMesh.material.opacity = animData.currentOpacity * 0.6;
        }
        if (animData.frameLine?.material) {
          animData.frameLine.material.opacity = isSelected ? 0.85 : 0.45;
          animData.frameLine.material.color.setHex(isSelected ? 0x00f0ff : 0x2c5a78);
        }
        if (animData.bottomFrameLine?.material) {
          animData.bottomFrameLine.material.opacity = isSelected ? 0.45 : 0.12;
          animData.bottomFrameLine.material.color.setHex(isSelected ? 0x00c4e6 : 0x142b3a);
        }
      },
    });
  });

  if (depthGuidesGroup && depthGuidesGroup.children) {
    depthGuidesGroup.children.forEach((guideGroup) => {
      if (guideGroup.userData && guideGroup.userData.depth !== undefined) {
        const depth = guideGroup.userData.depth;
        const targetY = getDepthYPosition(depth, availableDepths, verticalExaggeration);
        const isSelected = depth === activeDepth;

        animate(guideGroup.position, {
          y: targetY,
          duration: 650,
          ease: 'outCubic',
        });

        const sprite = guideGroup.children.find((c) => c.isSprite);
        if (sprite && sprite.material) {
          animate(sprite.material, {
            opacity: isSelected ? 1.0 : 0.65,
            duration: 400,
            ease: 'outCubic',
          });
        }
      }
    });
  }
}

function createWaterVolume(metrics) {
  const geometry = new THREE.BoxGeometry(FOOTPRINT_X, metrics.waterHeight, FOOTPRINT_Z, 1, 16, 1);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      uTop: { value: metrics.surfaceY + 0.2 },
      uBottom: { value: metrics.deepestSliceY - 0.5 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTop;
      uniform float uBottom;
      varying vec3 vWorldPosition;
      void main() {
        float t = clamp((uTop - vWorldPosition.y) / max(0.001, uTop - uBottom), 0.0, 1.0);
        vec3 topColor = vec3(0.03, 0.32, 0.48);
        vec3 bottomColor = vec3(0.005, 0.025, 0.075);
        vec3 color = mix(topColor, bottomColor, t);
        float alpha = mix(0.045, 0.16, t);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = metrics.waterCenterY;
  mesh.renderOrder = 2;
  return mesh;
}

function createWaterColumnWalls(metrics) {
  const group = new THREE.Group();
  const wallMaterial = new THREE.MeshBasicMaterial({
    color: 0x0c6f8d,
    transparent: true,
    opacity: 0.038,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x33596b,
    transparent: true,
    opacity: 0.055,
  });
  const y = metrics.waterCenterY;
  const h = metrics.waterHeight;
  const zBack = FOOTPRINT_Z / 2;
  const zFront = -FOOTPRINT_Z / 2;
  const xLeft = -FOOTPRINT_X / 2;
  const xRight = FOOTPRINT_X / 2;

  [
    { geo: new THREE.PlaneGeometry(FOOTPRINT_X, h), pos: [0, y, zBack], rot: [0, 0, 0] },
    { geo: new THREE.PlaneGeometry(FOOTPRINT_X, h), pos: [0, y, zFront], rot: [0, Math.PI, 0] },
    { geo: new THREE.PlaneGeometry(FOOTPRINT_Z, h), pos: [xLeft, y, 0], rot: [0, Math.PI / 2, 0] },
    { geo: new THREE.PlaneGeometry(FOOTPRINT_Z, h), pos: [xRight, y, 0], rot: [0, -Math.PI / 2, 0] },
  ].forEach(({ geo, pos, rot }) => {
    const wall = new THREE.Mesh(geo, wallMaterial.clone());
    wall.position.set(...pos);
    wall.rotation.set(...rot);
    wall.renderOrder = 4;
    group.add(wall);
  });

  [
    [xLeft, zFront],
    [xRight, zFront],
    [xLeft, zBack],
    [xRight, zBack],
  ].forEach(([x, z]) => {
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, metrics.surfaceY, z),
        new THREE.Vector3(x, metrics.deepestSliceY - 0.25, z),
      ]),
      edgeMaterial.clone(),
    ));
  });

  return group;
}

function createOceanSurface() {
  const geometry = new THREE.PlaneGeometry(FOOTPRINT_X, FOOTPRINT_Z, 160, 120);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying float vWave;
      void main() {
        vUv = uv;
        vec3 p = position;
        float wave = sin(p.x * 1.4 + uTime * 0.7) * 0.025 + cos(p.y * 1.7 - uTime * 0.45) * 0.018;
        p.z += wave;
        vWave = wave;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying float vWave;
      void main() {
        float rim = smoothstep(0.0, 0.18, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        vec3 color = mix(vec3(0.02, 0.18, 0.25), vec3(0.10, 0.55, 0.68), 0.45 + vWave * 4.0);
        gl_FragColor = vec4(color, 0.18 * rim);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.09;
  mesh.renderOrder = 900;
  return mesh;
}

function terrainHeight(x, z) {
  const shelf = THREE.MathUtils.smoothstep(-x, -7.5, 2.5) * 1.25;
  const ridge = Math.exp(-Math.pow((x + 3.4) / 2.2, 2)) * (0.8 + Math.sin(z * 1.4) * 0.18);
  const basin = -Math.exp(-Math.pow((x - 3.6) / 4.0, 2)) * 0.55;
  const relief = Math.sin(x * 1.7 + z * 0.8) * 0.12 + Math.cos(x * 0.55 - z * 1.1) * 0.16;
  return shelf + ridge + basin + relief;
}

function createSeafloor(metrics) {
  const geometry = new THREE.PlaneGeometry(FOOTPRINT_X * 1.14, FOOTPRINT_Z * 1.16, 100, 80);
  const pos = geometry.attributes.position;
  const colors = [];

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getY(i);
    const h = terrainHeight(x, z) * 0.45;
    pos.setZ(i, h);

    const c = new THREE.Color(0x0a1c2e);
    c.lerp(new THREE.Color(0x020b14), THREE.MathUtils.clamp(0.5 - h * 0.2, 0.0, 1.0));
    colors.push(c.r, c.g, c.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = metrics.seafloorY;
  return mesh;
}

function createCoastContext(metrics) {
  const shape = new THREE.Shape();
  shape.moveTo(-8.6, -6.2);
  shape.lineTo(-8.6, 5.9);
  shape.lineTo(-1.2, 5.9);
  shape.bezierCurveTo(-1.6, 4.8, -2.7, 3.5, -3.9, 2.6);
  shape.bezierCurveTo(-4.8, 1.7, -5.3, 0.4, -5.8, -1.0);
  shape.bezierCurveTo(-6.4, -2.6, -7.4, -4.4, -8.6, -6.2);

  const geometry = new THREE.ShapeGeometry(shape, 40);
  const material = new THREE.MeshStandardMaterial({
    color: 0x385334,
    roughness: 0.8,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = metrics.surfaceY + 0.13;
  mesh.receiveShadow = true;
  return mesh;
}

function createDepthLabelTexture(text, isSelected) {
  const canvas = document.createElement('canvas');
  canvas.width = 144;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = isSelected ? 'rgba(190, 219, 228, 0.86)' : 'rgba(8, 18, 31, 0.58)';
  ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.52)' : 'rgba(116, 151, 166, 0.14)';
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.roundRect(14, 10, 116, 36, 6);
  ctx.fill();
  ctx.stroke();
  ctx.font = isSelected ? 'bold 19px monospace' : '16px monospace';
  ctx.fillStyle = isSelected ? '#102a35' : '#8fa0ad';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 72, 28);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createDepthGuides(props) {
  const group = new THREE.Group();
  const { availableDepths, activeDepth, verticalExaggeration } = props;
  const depths = availableDepths.length ? availableDepths : [0, 50, 100, 200, 500];
  depths.forEach((depth) => {
    const y = getDepthYPosition(depth, depths, verticalExaggeration);
    const isSelected = depth === activeDepth;

    const lineGroup = new THREE.Group();
    lineGroup.userData.depth = depth;

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(FOOTPRINT_X / 2 - 0.05, 0, FOOTPRINT_Z / 2 + 0.1),
      new THREE.Vector3(FOOTPRINT_X / 2 + 0.95, 0, FOOTPRINT_Z / 2 + 0.1),
    ]);
    const line = new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: isSelected ? 0x00f0ff : 0x263f4e,
        transparent: true,
        opacity: isSelected ? 0.65 : 0.15,
      }),
    );
    lineGroup.add(line);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createDepthLabelTexture(`${depth}m`, isSelected),
      transparent: true,
      opacity: isSelected ? 1 : 0.72,
      depthWrite: false,
    }));
    sprite.position.set(FOOTPRINT_X / 2 + 1.65, 0, FOOTPRINT_Z / 2 + 0.1);
    sprite.scale.set(isSelected ? 1.02 : 0.84, isSelected ? 0.4 : 0.34, 1);
    lineGroup.add(sprite);

    lineGroup.position.y = y;
    group.add(lineGroup);
  });

  const cornerMaterial = new THREE.LineBasicMaterial({ color: 0x294b5c, transparent: true, opacity: 0.075 });
  [
    [-FOOTPRINT_X / 2, -FOOTPRINT_Z / 2],
    [FOOTPRINT_X / 2, -FOOTPRINT_Z / 2],
    [FOOTPRINT_X / 2, FOOTPRINT_Z / 2],
  ].forEach(([x, z]) => {
    const yBottom = getDepthYPosition(Math.max(...depths), depths, verticalExaggeration) - 0.25;
    const guide = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 0, z), new THREE.Vector3(x, yBottom, z)]),
      cornerMaterial.clone(),
    );
    group.add(guide);
  });

  return group;
}

function rebuildSlicesMesh(slicesGroup, depthGuidesGroup, sliceTilesMapRef, props) {
  clearGroup(slicesGroup);
  clearGroup(depthGuidesGroup);
  sliceTilesMapRef.current.clear();

  if (!slicesDataIsRenderable(props.slicesData)) return;

  const rawRange = collectFieldRange(props.slicesData);
  const effectiveRange = {
    min: props.minOverride !== null ? props.minOverride : rawRange.min,
    max: props.maxOverride !== null ? props.maxOverride : rawRange.max,
  };

  props.slicesData.forEach((slice) => {
    if (!slice.values?.length) return;
    const tileGroup = createRealTileGroup(slice, props, effectiveRange);
    sliceTilesMapRef.current.set(slice.depth, tileGroup);
    slicesGroup.add(tileGroup);
  });

  depthGuidesGroup.add(createDepthGuides(props));
  animateTileTransitions(sliceTilesMapRef.current, depthGuidesGroup, props);
}

function slicesDataIsRenderable(slicesData) {
  return Array.isArray(slicesData) && slicesData.some((slice) => slice.values?.length && slice.values[0]?.length);
}

function createObservationHaloTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(48, 48, 3, 48, 48, 45);
  gradient.addColorStop(0, 'rgba(210, 242, 250, 0.72)');
  gradient.addColorStop(0.28, 'rgba(124, 201, 218, 0.22)');
  gradient.addColorStop(1, 'rgba(124, 201, 218, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 96, 96);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function rebuildFloatsMesh(floatsGroup, props) {
  clearGroup(floatsGroup);
  const { floatsData, slicesData, availableDepths, verticalExaggeration } = props;
  if (!Array.isArray(floatsData)) return;

  const bounds = getDomainBounds(slicesData || []);
  const deepestY = getDepthYPosition(Math.max(...(availableDepths.length ? availableDepths : [500])), availableDepths, verticalExaggeration);

  floatsData.forEach((float) => {
    const lat = Number(float.lat);
    const lon = Number(float.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const { x, z } = projectLonLat(lon, lat, bounds);
    const group = new THREE.Group();
    group.position.set(x, 0.26, z);
    group.userData.float_id = float.float_id;

    const stemHeight = Math.abs(deepestY) + 0.4;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, stemHeight, 8),
      new THREE.MeshBasicMaterial({ color: 0x9cc9d4, transparent: true, opacity: 0.11 }),
    );
    stem.position.y = -stemHeight / 2;
    stem.userData.float_id = float.float_id;
    group.add(stem);

    const sensor = new THREE.Mesh(
      new THREE.SphereGeometry(0.065, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xd8f4f8,
        emissive: 0x4faebe,
        emissiveIntensity: 0.12,
        roughness: 0.46,
        metalness: 0,
      }),
    );
    sensor.userData.float_id = float.float_id;
    group.add(sensor);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createObservationHaloTexture(),
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      color: 0xd8f4f8,
    }));
    halo.scale.set(0.34, 0.34, 1);
    halo.userData.float_id = float.float_id;
    group.add(halo);

    floatsGroup.add(group);
  });
}

function rebuildStaticMeshes(staticGroup, props) {
  clearGroup(staticGroup);
  const metrics = getSceneMetrics(props.availableDepths, props.verticalExaggeration);
  staticGroup.add(createWaterVolume(metrics));
  staticGroup.add(createWaterColumnWalls(metrics));
  staticGroup.add(createSeafloor(metrics));

  const surface = createOceanSurface();
  surface.userData.isOceanSurface = true;
  staticGroup.add(surface);
}

export default function Scene({
  slicesData = [],
  activeDepth = 0,
  availableDepths = [0, 50, 100, 200, 500],
  activeVariable = 'temperature',
  floatsData = [],
  onFloatSelect,
  palette = 'thermal',
  scaleMode = 'linear',
  minOverride = null,
  maxOverride = null,
  renderMode = 'slices',
  verticalExaggeration = 1.0,
  sliceOpacity = 0.92,
}) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const sceneRef = useRef(null);
  const staticGroupRef = useRef(null);
  const slicesGroupRef = useRef(null);
  const floatsGroupRef = useRef(null);
  const depthGuidesGroupRef = useRef(null);
  const sliceTilesMapRef = useRef(new Map());

  const propsRef = useRef({
    slicesData,
    activeDepth,
    availableDepths,
    activeVariable,
    floatsData,
    palette,
    scaleMode,
    minOverride,
    maxOverride,
    renderMode,
    verticalExaggeration,
    sliceOpacity,
  });

  useEffect(() => {
    propsRef.current = {
      slicesData,
      activeDepth,
      availableDepths,
      activeVariable,
      floatsData,
      palette,
      scaleMode,
      minOverride,
      maxOverride,
      renderMode,
      verticalExaggeration,
      sliceOpacity,
    };
  }, [slicesData, activeDepth, availableDepths, activeVariable, floatsData, palette, scaleMode, minOverride, maxOverride, renderMode, verticalExaggeration, sliceOpacity]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return undefined;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020713);
    scene.fog = new THREE.FogExp2(0x061120, 0.026);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 1000);
    camera.position.set(10.8, 7.2, 12.0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0.25, -4.55, -0.25);
    controls.minDistance = 8;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI * 0.78;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0xc7efff, 0x09111f, 1.15));

    const sun = new THREE.DirectionalLight(0xffffff, 1.95);
    sun.position.set(-6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 45;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    scene.add(sun);

    const sideLight = new THREE.DirectionalLight(0x8bd8e8, 0.22);
    sideLight.position.set(9, -2, -9);
    scene.add(sideLight);

    const terrainGrazingLight = new THREE.DirectionalLight(0xffdfb0, 0.38);
    terrainGrazingLight.position.set(10, 5, 3);
    scene.add(terrainGrazingLight);

    const staticGroup = new THREE.Group();
    const slicesGroup = new THREE.Group();
    const floatsGroup = new THREE.Group();
    const depthGuidesGroup = new THREE.Group();
    staticGroupRef.current = staticGroup;
    slicesGroupRef.current = slicesGroup;
    floatsGroupRef.current = floatsGroup;
    depthGuidesGroupRef.current = depthGuidesGroup;
    scene.add(staticGroup, slicesGroup, floatsGroup, depthGuidesGroup);

    rebuildStaticMeshes(staticGroup, propsRef.current);
    rebuildSlicesMesh(slicesGroup, depthGuidesGroup, sliceTilesMapRef, propsRef.current);
    rebuildFloatsMesh(floatsGroup, propsRef.current);

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const updateMouse = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
    };

    const pickFloat = () => {
      const hits = raycaster.intersectObjects(floatsGroup.children, true);
      if (!hits.length) return null;
      let obj = hits[0].object;
      while (obj && !obj.userData.float_id && obj.parent) obj = obj.parent;
      return obj?.userData.float_id ?? null;
    };

    const handlePointerDown = (event) => {
      updateMouse(event);
      const floatId = pickFloat();
      if (floatId && onFloatSelect) onFloatSelect(floatId);
    };

    const handlePointerMove = (event) => {
      updateMouse(event);
      renderer.domElement.style.cursor = pickFloat() ? 'pointer' : 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    let frameId;
    const clock = new THREE.Clock();
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      controls.update();

      staticGroup.children.forEach((child) => {
        if (child.userData.isOceanSurface && child.material?.uniforms?.uTime) {
          child.material.uniforms.uTime.value = elapsed;
        }
      });

      floatsGroup.children.forEach((marker, index) => {
        marker.children[1].position.y = Math.sin(elapsed * 1.8 + index) * 0.035;
      });

      if (cameraRef.current && slicesGroupRef.current && propsRef.current.availableDepths?.length) {
        const cameraY = cameraRef.current.position.y;
        const metrics = getSceneMetrics(propsRef.current.availableDepths, propsRef.current.verticalExaggeration);
        const isCameraAbove = cameraY > metrics.waterCenterY;
        const sortedDepths = [...propsRef.current.availableDepths].sort((a, b) => a - b);

        slicesGroupRef.current.children.forEach((tileGroup) => {
          if (tileGroup.userData && tileGroup.userData.depth !== undefined) {
            const depth = tileGroup.userData.depth;
            const depthIndex = sortedDepths.indexOf(depth);

            const baseOrder = isCameraAbove
              ? 1000 + depthIndex * 40
              : 1000 + (sortedDepths.length - depthIndex) * 40;

            tileGroup.renderOrder = baseOrder;
            if (tileGroup.userData.bottomMesh) tileGroup.userData.bottomMesh.renderOrder = baseOrder;
            if (tileGroup.userData.sideMesh) tileGroup.userData.sideMesh.renderOrder = baseOrder + 1;
            if (tileGroup.userData.topMesh) tileGroup.userData.topMesh.renderOrder = baseOrder + 2;
            if (tileGroup.userData.frameLine) tileGroup.userData.frameLine.renderOrder = baseOrder + 3;
          }
        });
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      disposeObject(scene);
      renderer.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onFloatSelect]);

  useEffect(() => {
    if (!staticGroupRef.current || !slicesGroupRef.current || !depthGuidesGroupRef.current || !floatsGroupRef.current) return;
    rebuildStaticMeshes(staticGroupRef.current, propsRef.current);
    rebuildSlicesMesh(slicesGroupRef.current, depthGuidesGroupRef.current, sliceTilesMapRef, propsRef.current);
    rebuildFloatsMesh(floatsGroupRef.current, propsRef.current);
  }, [slicesData, palette, scaleMode, minOverride, maxOverride]);

  useEffect(() => {
    if (!sliceTilesMapRef.current.size || !depthGuidesGroupRef.current) return;
    animateTileTransitions(sliceTilesMapRef.current, depthGuidesGroupRef.current, propsRef.current);
  }, [activeDepth, availableDepths, renderMode, verticalExaggeration, sliceOpacity]);

  useEffect(() => {
    if (floatsGroupRef.current) rebuildFloatsMesh(floatsGroupRef.current, propsRef.current);
  }, [floatsData]);

  return (
    <div className="relative w-full h-full select-none">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="absolute top-4 right-4 bg-ocean-panel/70 backdrop-blur-md border border-slate-700/50 px-3.5 py-2 rounded-lg text-[11px] font-mono text-slate-300 shadow-xl flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-cyan-300/80" />
        <div>
          Variable: <span className="text-white font-bold tracking-wide">{activeVariable.toUpperCase()}</span>
        </div>
        <div>
          Selected Depth: <span className="text-cyan-200 font-bold">{activeDepth}m</span>
        </div>
        <div className="hidden xl:block text-slate-400">
          {VARIABLE_UNITS[activeVariable] || ''}
        </div>
      </div>
    </div>
  );
}