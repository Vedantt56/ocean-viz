import * as THREE from 'three';

/**
 * Creates 3D GPU DataTextures for Currents (uo/vo), Temperature (thetao), Salinity (so), and Mask
 */
export function create3DFieldTextures(manifest, uoBuf, voBuf, maskBuf, thetaoBuf, soBuf, initialTimeIndex = 0) {
  const { longitude: width, latitude: height, depth: depthCount, time: timeCount } = manifest.dimensions;
  const numCells = width * height * depthCount;
  const tIdx = Math.max(0, Math.min(initialTimeIndex, timeCount - 1));

  // 1. Currents Texture (RG32F Format: Red = uo, Green = vo)
  const uoData = uoBuf ? new Float32Array(uoBuf) : null;
  const voData = voBuf ? new Float32Array(voBuf) : null;
  const rgData = new Float32Array(numCells * 2);

  if (uoData && voData) {
    const offset = tIdx * numCells;
    for (let i = 0; i < numCells; i++) {
      rgData[i * 2] = uoData[offset + i];
      rgData[i * 2 + 1] = voData[offset + i];
    }
  }

  const uovoTexture = new THREE.Data3DTexture(rgData, width, height, depthCount);
  uovoTexture.format = THREE.RGFormat;
  uovoTexture.type = THREE.FloatType;
  uovoTexture.minFilter = THREE.LinearFilter;
  uovoTexture.magFilter = THREE.LinearFilter;
  uovoTexture.unpackAlignment = 1;
  uovoTexture.needsUpdate = true;

  // 2. Temperature Texture (RedFormat FloatType)
  const thetaoData = thetaoBuf ? new Float32Array(thetaoBuf) : null;
  const tempData = new Float32Array(numCells);
  if (thetaoData) {
    const offset = tIdx * numCells;
    for (let i = 0; i < numCells; i++) {
      tempData[i] = thetaoData[offset + i];
    }
  }
  const tempTexture = new THREE.Data3DTexture(tempData, width, height, depthCount);
  tempTexture.format = THREE.RedFormat;
  tempTexture.type = THREE.FloatType;
  tempTexture.minFilter = THREE.LinearFilter;
  tempTexture.magFilter = THREE.LinearFilter;
  tempTexture.unpackAlignment = 1;
  tempTexture.needsUpdate = true;

  // 3. Salinity Texture (RedFormat FloatType)
  const soData = soBuf ? new Float32Array(soBuf) : null;
  const salData = new Float32Array(numCells);
  if (soData) {
    const offset = tIdx * numCells;
    for (let i = 0; i < numCells; i++) {
      salData[i] = soData[offset + i];
    }
  }
  const salTexture = new THREE.Data3DTexture(salData, width, height, depthCount);
  salTexture.format = THREE.RedFormat;
  salTexture.type = THREE.FloatType;
  salTexture.minFilter = THREE.LinearFilter;
  salTexture.magFilter = THREE.LinearFilter;
  salTexture.unpackAlignment = 1;
  salTexture.needsUpdate = true;

  // 4. Land Mask Texture (RedFormat FloatType: 1.0 = ocean, 0.0 = land)
  const maskData = maskBuf ? new Float32Array(maskBuf) : new Float32Array(numCells).fill(1.0);
  const maskTexture = new THREE.Data3DTexture(maskData, width, height, depthCount);
  maskTexture.format = THREE.RedFormat;
  maskTexture.type = THREE.FloatType;
  maskTexture.minFilter = THREE.LinearFilter;
  maskTexture.magFilter = THREE.LinearFilter;
  maskTexture.unpackAlignment = 1;
  maskTexture.needsUpdate = true;

  return { uovoTexture, tempTexture, salTexture, maskTexture };
}

/**
 * Dynamically updates VRAM textures when active timeline index changes
 */
export function update3DFieldTextures(uovoTexture, tempTexture, salTexture, manifest, uoBuf, voBuf, thetaoBuf, soBuf, timeIndex) {
  const { longitude: width, latitude: height, depth: depthCount, time: timeCount } = manifest.dimensions;
  const numCells = width * height * depthCount;
  const tIdx = Math.max(0, Math.min(timeIndex, timeCount - 1));
  const offset = tIdx * numCells;

  if (uovoTexture && uoBuf && voBuf) {
    const uoData = new Float32Array(uoBuf);
    const voData = new Float32Array(voBuf);
    const rgData = uovoTexture.image.data;
    for (let i = 0; i < numCells; i++) {
      rgData[i * 2] = uoData[offset + i];
      rgData[i * 2 + 1] = voData[offset + i];
    }
    uovoTexture.needsUpdate = true;
  }

  if (tempTexture && thetaoBuf) {
    const thetaoData = new Float32Array(thetaoBuf);
    const tempData = tempTexture.image.data;
    for (let i = 0; i < numCells; i++) {
      tempData[i] = thetaoData[offset + i];
    }
    tempTexture.needsUpdate = true;
  }

  if (salTexture && soBuf) {
    const soData = new Float32Array(soBuf);
    const salData = salTexture.image.data;
    for (let i = 0; i < numCells; i++) {
      salData[i] = soData[offset + i];
    }
    salTexture.needsUpdate = true;
  }
}
