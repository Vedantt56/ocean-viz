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

let activeHoveredFloatId = null;


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
  const numericActiveDepth = Number(activeDepth);
  const sliceDepth = Number(slice.depth);
  const isSelected = sliceDepth === numericActiveDepth;
  const activeIndex = Math.max(0, sortedDepths.indexOf(numericActiveDepth));
  const sliceIndex = Math.max(0, sortedDepths.indexOf(sliceDepth));
  const indexDistance = Math.abs(sliceIndex - activeIndex);

  const range = (effectiveRange.max - effectiveRange.min) || 1;
  const baseOpacity = sliceOpacity ?? 0.95;

  // Active slice (indexDistance === 0) is 1.0 (100% vibrant & opaque); inactive slices are ghosted (10% - 28%)
  const sliceStrengths = [1.0, 0.28, 0.18, 0.12, 0.08];
  const volumeStrengths = [1.0, 0.38, 0.24, 0.16, 0.11];
  const focus = renderMode === 'volume'
    ? volumeStrengths[Math.min(indexDistance, volumeStrengths.length - 1)]
    : sliceStrengths[Math.min(indexDistance, sliceStrengths.length - 1)];
  const layerOpacity = isSelected ? 1.0 : baseOpacity * focus;

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
      uEmissiveBoost: { value: renderMode === 'volume' ? 0.52 : 0.0 },
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
      uniform float uEmissiveBoost;
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

        // Self-luminous data color emission (Glow) for vibrant 3D volumetric stacking
        vec3 emissiveGlow = vColor * uEmissiveBoost;

        vec3 shaded = vColor * diffuse + vec3(specular) + emissiveGlow + uSelectedBoost * vec3(0.20, 0.22, 0.28);
        gl_FragColor = vec4(shaded, vAlpha * uLayerOpacity);
      }
    `,
    vertexColors: true,
    blending: renderMode === 'volume' ? THREE.AdditiveBlending : THREE.NormalBlending,
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
  const numericActiveDepth = Number(activeDepth);
  const baseOpacity = sliceOpacity ?? 0.92;
  const isVolumetric = renderMode === 'volume';

  sliceTilesMap.forEach((tileGroup, depthKey) => {
    const depth = Number(depthKey);
    const isSelected = depth === numericActiveDepth;
    const depthY = getDepthYPosition(depth, availableDepths, verticalExaggeration);

    tileGroup.visible = true;

    // In Stacked Slices mode, active slice elevates +0.22. In Volumetric Stack mode, all slices align to uniform depth elevation.
    const targetY = (isSelected && !isVolumetric) ? depthY + 0.22 : depthY;

    // 1 & 2. Slightly bumped opacity (0.28) and self-emissive glow (0.52) in Volumetric Stack mode
    const targetOpacity = isVolumetric
      ? 0.28 * baseOpacity
      : (isSelected ? 1.0 : 0.08 * baseOpacity);

    const targetBoost = (isSelected && !isVolumetric) ? 0.24 : 0.0;
    const targetEmissive = isVolumetric ? 0.52 : 0.0;
    const targetScale = (isSelected && !isVolumetric) ? 1.015 : 1.0;

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

        if (animData.topMesh) {
          animData.topMesh.visible = true;
          if (animData.topMesh.material) {
            animData.topMesh.material.transparent = true;
            animData.topMesh.material.depthWrite = false;
            animData.topMesh.material.depthTest = true;

            // 3. Enforce Additive Blending in Volumetric Stack mode
            const targetBlending = isVolumetric ? THREE.AdditiveBlending : THREE.NormalBlending;
            if (animData.topMesh.material.blending !== targetBlending) {
              animData.topMesh.material.blending = targetBlending;
              animData.topMesh.material.needsUpdate = true;
            }

            if (animData.topMesh.material.uniforms) {
              animData.topMesh.material.uniforms.uLayerOpacity.value = animData.currentOpacity;
              animData.topMesh.material.uniforms.uSelectedBoost.value = animData.currentBoost;
              if (animData.topMesh.material.uniforms.uEmissiveBoost) {
                animData.topMesh.material.uniforms.uEmissiveBoost.value = targetEmissive;
              }
            }
          }
        }

        if (animData.sideMesh) {
          animData.sideMesh.visible = !isVolumetric;
          if (animData.sideMesh.material) {
            animData.sideMesh.material.transparent = true;
            animData.sideMesh.material.depthWrite = false;
            if (animData.sideMesh.material.uniforms) {
              animData.sideMesh.material.uniforms.uLayerOpacity.value = animData.currentOpacity;
              animData.sideMesh.material.uniforms.uSelectedBoost.value = animData.currentBoost;
            }
          }
        }
        if (animData.bottomMesh?.material) {
          animData.bottomMesh.material.opacity = animData.currentOpacity * 0.6;
        }
        if (animData.frameLine?.material) {
          animData.frameLine.material.opacity = isVolumetric ? 0.25 : (isSelected ? 0.85 : 0.25);
          animData.frameLine.material.color.setHex((isSelected && !isVolumetric) ? 0x00f0ff : 0x2c5a78);
        }
        if (animData.bottomFrameLine?.material) {
          animData.bottomFrameLine.material.opacity = isVolumetric ? 0.10 : (isSelected ? 0.45 : 0.08);
          animData.bottomFrameLine.material.color.setHex((isSelected && !isVolumetric) ? 0x00c4e6 : 0x142b3a);
        }
      },
    });
  });




  if (depthGuidesGroup) {
    depthGuidesGroup.traverse((guideGroup) => {
      if (guideGroup.userData && guideGroup.userData.depth !== undefined) {

        const depth = Number(guideGroup.userData.depth);
        const depthY = getDepthYPosition(depth, availableDepths, verticalExaggeration);
        const isSelected = depth === numericActiveDepth;

        const targetY = isSelected ? depthY + 0.22 : depthY;

        animate(guideGroup.position, {
          y: targetY,
          duration: 650,
          ease: 'outCubic',
        });

        const sprite = guideGroup.children.find((c) => c.isSprite);
        if (sprite && sprite.material) {
          if (sprite.userData.isSelected !== isSelected) {
            sprite.userData.isSelected = isSelected;
            const oldMap = sprite.material.map;
            sprite.material.map = createDepthLabelTexture(`${depth}m`, isSelected);
            sprite.material.needsUpdate = true;
            if (oldMap) oldMap.dispose();
          }

          const targetScaleX = isSelected ? 1.45 : 0.88;
          const targetScaleY = isSelected ? 0.58 : 0.35;

          animate(sprite.scale, {
            x: targetScaleX,
            y: targetScaleY,
            duration: 400,
            ease: 'outCubic',
          });

          animate(sprite.material, {
            opacity: isSelected ? 1.0 : 0.65,
            duration: 400,
            ease: 'outCubic',
          });
        }

        const line = guideGroup.children.find((c) => c.isLine);
        if (line && line.material) {
          line.material.color.setHex(isSelected ? 0x00f0ff : 0x38bdf8);
          line.material.opacity = isSelected ? 0.95 : 0.35;
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
  // Empty group container to ensure top data slice colormap renders 100% pure and un-tinted
  return new THREE.Group();
}



// Multi-octave fractal noise generator for realistic oceanic bathymetry
function fbmNoise(x, z) {
  let total = 0;
  let amplitude = 1.0;
  let frequency = 0.35;
  let maxVal = 0;

  for (let i = 0; i < 4; i += 1) {
    const nx = x * frequency;
    const nz = z * frequency;
    const n = Math.sin(nx * 1.3 + nz * 0.7) * Math.cos(nz * 1.5 - nx * 0.8) +
              Math.sin(nx * 2.7 - nz * 1.9) * 0.5 +
              Math.cos(nx * 0.9 + nz * 3.1) * 0.25;
    total += n * amplitude;
    maxVal += amplitude;
    frequency *= 2.1;
    amplitude *= 0.48;
  }
  return total / maxVal;
}

function terrainHeight(x, z) {
  // Continental shelf slope
  const shelf = THREE.MathUtils.smoothstep(-x, -8.0, 3.0) * 1.8;
  
  // Rugged mid-oceanic ridge system with steep mountain peaks
  const ridgeBase = Math.exp(-Math.pow((x + 2.5) / 2.8, 2)) * 1.6;
  const ridgeDetail = Math.pow(Math.abs(Math.sin(x * 1.2 + z * 1.4) * Math.cos(z * 1.8 - x * 0.9)), 1.3) * 1.25;
  const mountains = (ridgeBase + ridgeDetail) * 0.88;

  // Deep ocean trench
  const trench = -Math.exp(-Math.pow((x - 4.2) / 1.8, 2)) * 1.4;

  // Fine fractal detail (rocks, crags, seamounts)
  const detail = fbmNoise(x, z) * 0.75;

  return shelf + mountains + trench + detail;
}

function createTerrainAlbedoTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Deep ocean basalt rock gradient
  const grad = ctx.createLinearGradient(0, 0, 1024, 1024);
  grad.addColorStop(0, '#091526');
  grad.addColorStop(0.35, '#0f243b');
  grad.addColorStop(0.7, '#071322');
  grad.addColorStop(1.0, '#0d2a40');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Grain noise for basalt sediment texture
  const imgData = ctx.getImageData(0, 0, 1024, 1024);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 20;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise * 1.2));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise * 1.5));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  return texture;
}

function createTerrainNormalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;

  // Procedural normal vectors for sharp surface micro-cracks and ridges
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const idx = (y * 512 + x) * 4;
      const nx = (x / 512) * 22;
      const ny = (y / 512) * 22;
      
      const hL = Math.sin((nx - 0.1) * 1.5) * Math.cos(ny * 1.5);
      const hR = Math.sin((nx + 0.1) * 1.5) * Math.cos(ny * 1.5);
      const hD = Math.sin(nx * 1.5) * Math.cos((ny - 0.1) * 1.5);
      const hU = Math.sin(nx * 1.5) * Math.cos((ny + 0.1) * 1.5);

      const dx = (hR - hL) * 2.2;
      const dy = (hU - hD) * 2.2;

      const len = Math.sqrt(dx * dx + dy * dy + 1.0);
      const normX = (dx / len) * 0.5 + 0.5;
      const normY = (dy / len) * 0.5 + 0.5;
      const normZ = (1.0 / len) * 0.5 + 0.5;

      data[idx] = Math.floor(normX * 255);
      data[idx + 1] = Math.floor(normY * 255);
      data[idx + 2] = Math.floor(normZ * 255);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

function getBathymetricColor(normH) {
  const c = new THREE.Color();
  const cDeep = new THREE.Color(0x06152d);  // Deepest trench (Navy/Indigo)
  const cNavy = new THREE.Color(0x0284c7);  // Lower slope (Oceanic Azure)
  const cCyan = new THREE.Color(0x06b6d4);  // Mid slope (Bright Cyan)
  const cTeal = new THREE.Color(0x10b981);  // Upper slope (Emerald Teal)
  const cAmber = new THREE.Color(0xf59e0b); // High ridge (Golden Amber)
  const cPeak = new THREE.Color(0xfef08a);  // Mountain crest (Sunlit Yellow)

  if (normH < 0.22) {
    c.lerpColors(cDeep, cNavy, normH / 0.22);
  } else if (normH < 0.48) {
    c.lerpColors(cNavy, cCyan, (normH - 0.22) / 0.26);
  } else if (normH < 0.72) {
    c.lerpColors(cCyan, cTeal, (normH - 0.48) / 0.24);
  } else if (normH < 0.88) {
    c.lerpColors(cTeal, cAmber, (normH - 0.72) / 0.16);
  } else {
    c.lerpColors(cAmber, cPeak, (normH - 0.88) / 0.12);
  }
  return c;
}

function createSeafloor(metrics) {
  // 1. High-Density Geometry Subdivision (200 x 160 subdivisions = 32,000 vertices)
  const geometry = new THREE.PlaneGeometry(FOOTPRINT_X * 1.24, FOOTPRINT_Z * 1.24, 200, 160);
  const pos = geometry.attributes.position;
  const colors = [];

  // 2. Vertex Displacement & Dynamic Bathymetric Heatmap Gradient
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getY(i);
    const h = terrainHeight(x, z) * 0.55;
    pos.setZ(i, h);

    // Altitude & Ambient Occlusion (AO) shading
    const normH = THREE.MathUtils.clamp((h + 0.8) / 2.2, 0.0, 1.0);
    const c = getBathymetricColor(normH);

    // Crevice Ambient Occlusion (AO): Slight shadow for valleys while keeping base bright
    const ao = Math.pow(normH, 0.5);
    c.multiplyScalar(0.62 + 0.38 * ao);

    colors.push(c.r, c.g, c.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // 3. Brightened Neutral Base Material & Optimized Roughness/Metalness Properties
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: createTerrainAlbedoTexture(),
    normalMap: createTerrainNormalTexture(),
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughness: 0.55,
    metalness: 0.18,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = metrics.seafloorY;
  mesh.receiveShadow = true;
  mesh.castShadow = true;
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

function drawRoundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}

function createDepthLabelTexture(text, isSelected) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isSelected) {
    // Active Depth Badge: Glowing Cyan Background with Bold Black Monospace Text
    ctx.fillStyle = 'rgba(0, 230, 255, 0.96)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 16;
    drawRoundRect(ctx, 12, 10, 136, 44, 12);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#020814';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 80, 32);
  } else {
    // Unselected Depth Capsule: Muted Dark Blue/Slate with Soft Gray Text
    ctx.fillStyle = 'rgba(12, 26, 46, 0.85)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    ctx.lineWidth = 1.5;
    drawRoundRect(ctx, 14, 10, 132, 44, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 80, 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createDepthGuides(props) {
  const group = new THREE.Group();
  const { availableDepths, activeDepth, verticalExaggeration } = props;
  const depths = availableDepths.length ? availableDepths.map(Number) : [0, 50, 100, 200, 500];
  const numericActiveDepth = Number(activeDepth);

  depths.forEach((depth) => {
    const y = getDepthYPosition(depth, depths, verticalExaggeration);
    const isSelected = depth === numericActiveDepth;

    const lineGroup = new THREE.Group();
    lineGroup.userData.depth = depth;
    lineGroup.position.y = isSelected ? y + 0.22 : y;


    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(FOOTPRINT_X / 2 - 0.05, 0, FOOTPRINT_Z / 2 + 0.1),
      new THREE.Vector3(FOOTPRINT_X / 2 + 0.95, 0, FOOTPRINT_Z / 2 + 0.1),
    ]);
    const line = new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color: isSelected ? 0x00f0ff : 0x38bdf8,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.35,
      }),
    );
    lineGroup.add(line);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createDepthLabelTexture(`${depth}m`, isSelected),
      transparent: true,
      opacity: isSelected ? 1.0 : 0.65,
      depthWrite: false,
    }));
    sprite.position.set(FOOTPRINT_X / 2 + 1.65, 0, FOOTPRINT_Z / 2 + 0.1);
    sprite.scale.set(isSelected ? 1.45 : 0.88, isSelected ? 0.58 : 0.35, 1);
    sprite.userData.isSelected = isSelected;
    lineGroup.add(sprite);

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

function collectSingleSliceRange(slice) {
  let min = Infinity;
  let max = -Infinity;
  slice.values?.forEach((row) => {
    row.forEach((value) => {
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
  });
  if (min === Infinity || min === max) {
    return { min: 0, max: 1 };
  }
  return { min, max };
}

function rebuildSlicesMesh(slicesGroup, depthGuidesGroup, sliceTilesMapRef, props) {
  clearGroup(slicesGroup);
  clearGroup(depthGuidesGroup);
  sliceTilesMapRef.current.clear();

  if (!slicesDataIsRenderable(props.slicesData)) return;

  const rawRange = collectFieldRange(props.slicesData);
  const globalEffectiveRange = {
    min: props.minOverride !== null ? props.minOverride : rawRange.min,
    max: props.maxOverride !== null ? props.maxOverride : rawRange.max,
  };

  props.slicesData.forEach((slice) => {
    if (!slice.values?.length) return;
    const sliceRange = props.scaleMode === 'local'
      ? collectSingleSliceRange(slice)
      : globalEffectiveRange;
    const tileGroup = createRealTileGroup(slice, props, sliceRange);
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

function createFloatTagTexture(float_id) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dark glass capsule container with glowing cyan border
  ctx.fillStyle = 'rgba(2, 10, 22, 0.96)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
  ctx.lineWidth = 4.5;
  ctx.roundRect(12, 12, 488, 136, 32);
  ctx.fill();
  ctx.stroke();

  // Glowing Green Live Pulse Indicator Dot
  ctx.fillStyle = '#34d399';
  ctx.shadowColor = '#34d399';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(52, 80, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Float WMO ID Title (Clean formatting: "ARGO FLOAT #2901234")
  const shortId = String(float_id || 'argo_2901234').replace(/^argo_?/i, '#');
  ctx.font = 'bold 30px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`ARGO FLOAT ${shortId}`, 82, 36);

  // Informative Action Subtitle
  ctx.font = 'bold 23px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('Click to View Profile →', 82, 88);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}


function rebuildFloatsMesh(floatsGroup, props) {
  clearGroup(floatsGroup);
  const { floatsData, slicesData, availableDepths, verticalExaggeration, activeTime } = props;
  if (!Array.isArray(floatsData)) return;

  const bounds = getDomainBounds(slicesData || []);
  const deepestY = getDepthYPosition(Math.max(...(availableDepths.length ? availableDepths : [500])), availableDepths, verticalExaggeration);

  floatsData.forEach((float) => {
    const lat = Number(float.lat);
    const lon = Number(float.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    // Show float pin ONLY if it reported data on the active date
    if (activeTime) {
      if (Array.isArray(float.dates) && float.dates.length > 0) {
        if (!float.dates.includes(activeTime)) return;
      } else if (float.time && float.time !== activeTime) {
        return;
      }
    }


    const { x, z } = projectLonLat(lon, lat, bounds);
    const group = new THREE.Group();
    group.position.set(x, 0.26, z);
    group.userData.float_id = float.float_id;

    // 1. Aceternity Surface Ripple Ring (Surface Anchor)
    const ringGeo = new THREE.RingGeometry(0.1, 0.19, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = -0.16;
    ringMesh.userData.float_id = float.float_id;
    group.add(ringMesh);

    // 2. Cyan Vertical Laser Beam Pin Stem (Extended 1.3 units ABOVE slice)
    const extensionAbove = 1.3;
    const stemHeight = Math.abs(deepestY) + extensionAbove;
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.014, stemHeight, 8),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 }),
    );
    stem.position.y = (extensionAbove - Math.abs(deepestY)) / 2;
    stem.userData.float_id = float.float_id;
    group.add(stem);

    // 3. Glowing Sensor Head Beacon Node (Elevated 1.3 units above slice)
    const sensor = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00d2ff,
        emissiveIntensity: 0.9,
        roughness: 0.2,
        metalness: 0.1,
      }),
    );
    sensor.position.y = extensionAbove;
    sensor.userData.float_id = float.float_id;
    group.add(sensor);

    // 4. Floating Aceternity UI Pin Tag (Elevated 1.95 units above slice)
    const tagSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: createFloatTagTexture(float.float_id),
      transparent: true,
      opacity: 0.98,
      depthWrite: false,
    }));
    tagSprite.position.set(0, extensionAbove + 0.62, 0);
    tagSprite.scale.set(2.4, 0.75, 1);
    tagSprite.userData.float_id = float.float_id;
    group.add(tagSprite);

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
  activeTime = '',
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
  const onFloatSelectRef = useRef(onFloatSelect);


  useEffect(() => {
    onFloatSelectRef.current = onFloatSelect;
  }, [onFloatSelect]);

  const propsRef = useRef({
    slicesData,
    activeDepth,
    availableDepths,
    activeVariable,
    activeTime,
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
      activeTime,
      floatsData,
      palette,
      scaleMode,
      minOverride,
      maxOverride,
      renderMode,
      verticalExaggeration,
      sliceOpacity,
    };
  }, [slicesData, activeDepth, availableDepths, activeVariable, activeTime, floatsData, palette, scaleMode, minOverride, maxOverride, renderMode, verticalExaggeration, sliceOpacity]);


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

    scene.add(new THREE.HemisphereLight(0xe0f7ff, 0x162c4a, 2.35));

    const sun = new THREE.DirectionalLight(0xffffff, 2.75);
    sun.position.set(-6, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 45;
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    scene.add(sun);

    const sideLight = new THREE.DirectionalLight(0x7dd3fc, 0.85);
    sideLight.position.set(9, 2, -9);
    scene.add(sideLight);

    const terrainGrazingLight = new THREE.DirectionalLight(0xfff2d4, 1.85);
    terrainGrazingLight.position.set(12, 10, 8);
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
      if (floatId && onFloatSelectRef.current) {
        onFloatSelectRef.current(floatId);
      }
    };


    const handlePointerMove = (event) => {
      updateMouse(event);
      const hoveredId = pickFloat();
      activeHoveredFloatId = hoveredId;
      renderer.domElement.style.cursor = hoveredId ? 'pointer' : 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);

    let frameId;
    const clock = new THREE.Clock();
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      controls.update();

      // Organic ocean surface breathing swell motion for realistic sea state
      const surfaceSwell = Math.sin(elapsed * 1.25) * 0.025 + Math.cos(elapsed * 0.85) * 0.015;

      staticGroup.children.forEach((child) => {
        if (child.userData.isOceanSurface) {
          if (child.material?.uniforms?.uTime) {
            child.material.uniforms.uTime.value = elapsed;
          }
          child.position.y = 0.09 + surfaceSwell * 0.5;
        }
      });

      if (slicesGroupRef.current) {
        slicesGroupRef.current.children.forEach((tileGroup) => {
          if (tileGroup.userData?.topMesh?.material?.uniforms?.uTime) {
            tileGroup.userData.topMesh.material.uniforms.uTime.value = elapsed;
          }
          if (tileGroup.userData && Number(tileGroup.userData.depth) === 0) {
            const baseY = tileGroup.userData.currentY ?? 0;
            tileGroup.position.y = baseY + surfaceSwell;
          }
        });
      }



      floatsGroup.children.forEach((marker, index) => {
        const isHovered = Boolean(marker.userData.float_id && marker.userData.float_id === activeHoveredFloatId);
        const bob = Math.sin(elapsed * 1.8 + index) * 0.03;


        // 1. Sensor beacon head node (enlarges slightly when hovered)
        if (marker.children[2]) {
          marker.children[2].position.y = 1.3 + bob;
          const s = isHovered ? 1.4 : 1.0;
          marker.children[2].scale.lerp(new THREE.Vector3(s, s, s), 0.2);
        }

        // 2. Floating Aceternity Tag (Pop up & Enlarge on hover)
        if (marker.children[3]) {
          const baseW = 2.4;
          const baseH = 0.75;
          const targetW = isHovered ? baseW * 1.42 : baseW;
          const targetH = isHovered ? baseH * 1.42 : baseH;
          const targetY = 1.92 + (isHovered ? 0.18 : 0) + bob;

          marker.children[3].scale.x += (targetW - marker.children[3].scale.x) * 0.2;
          marker.children[3].scale.y += (targetH - marker.children[3].scale.y) * 0.2;
          marker.children[3].position.y += (targetY - marker.children[3].position.y) * 0.2;
          marker.children[3].material.opacity = isHovered ? 1.0 : 0.95;
        }

        // 3. Surface ripple ring (expands when hovered)
        if (marker.children[0]) {
          const s = (isHovered ? 1.5 : 1.0) + Math.sin(elapsed * 2.2 + index) * 0.22;
          marker.children[0].scale.set(s, s, s);
        }
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
              ? 1000 + (sortedDepths.length - depthIndex) * 40
              : 1000 + depthIndex * 40;


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
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
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

  }, []);


  useEffect(() => {
    if (!staticGroupRef.current || !slicesGroupRef.current || !depthGuidesGroupRef.current || !floatsGroupRef.current) return;
    rebuildStaticMeshes(staticGroupRef.current, propsRef.current);
    rebuildSlicesMesh(slicesGroupRef.current, depthGuidesGroupRef.current, sliceTilesMapRef, propsRef.current);
    rebuildFloatsMesh(floatsGroupRef.current, propsRef.current);
  }, [slicesData, activeVariable, palette, scaleMode, minOverride, maxOverride]);


  useEffect(() => {
    if (!sliceTilesMapRef.current.size || !depthGuidesGroupRef.current) return;
    animateTileTransitions(sliceTilesMapRef.current, depthGuidesGroupRef.current, propsRef.current);
  }, [activeDepth, availableDepths, renderMode, verticalExaggeration, sliceOpacity]);

  useEffect(() => {
    if (floatsGroupRef.current) rebuildFloatsMesh(floatsGroupRef.current, propsRef.current);
  }, [floatsData, activeTime]);


  return (
    <div className="relative w-full h-full select-none">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="absolute top-4 right-4 bg-ocean-panel/85 backdrop-blur-xl border border-ocean-border px-3 py-1.5 rounded-xl text-[10px] font-mono text-slate-300 shadow-2xl flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        <div>
          <span className="text-slate-400">VAR:</span> <span className="text-white font-bold tracking-wide">{activeVariable.toUpperCase()}</span>
        </div>
        <div>
          <span className="text-slate-400">DEPTH:</span> <span className="text-cyan-300 font-bold">{activeDepth}m</span>
        </div>
        <div className="hidden xl:block text-slate-400">
          {VARIABLE_UNITS[activeVariable] || ''}
        </div>
      </div>

    </div>
  );
}