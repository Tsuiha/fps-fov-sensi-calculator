/**
 * FOV Math Engine - 視野角およびアスペクト比の汎用幾何学計算モジュール
 * 透視投影 (Perspective Projection) に基づく数学的純関数群
 */

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function degToRad(deg) {
  return deg * DEG_TO_RAD;
}

export function radToDeg(rad) {
  return rad * RAD_TO_DEG;
}

/**
 * アスペクト比 (width / height) をパース
 */
export function parseAspectRatio(aspect) {
  if (typeof aspect === 'number') return aspect;
  if (typeof aspect === 'string') {
    if (aspect === '4:3_apex' || aspect === 'apex_4_3' || aspect === 'apex') {
      return 4 / 3;
    }
    if (aspect === 'vfov' || aspect === '1:1') {
      return 1;
    }
    if (aspect.includes(':')) {
      const [w, h] = aspect.split(':').map(Number);
      if (w > 0 && h > 0) return w / h;
    }
  }
  return 16 / 9;
}

/**
 * 垂直FOV (vFOV) とアスペクト比から水平FOV (hFOV) を算出
 * tan(hFOV / 2) = aspect * tan(vFOV / 2)
 */
export function vFovToHfov(vFovDeg, aspect) {
  const ar = parseAspectRatio(aspect);
  const safeVdeg = Math.max(0.1, Math.min(179.9, Number(vFovDeg) || 70));
  const halfVrad = degToRad(safeVdeg / 2);
  const halfHrad = Math.atan(ar * Math.tan(halfVrad));
  return radToDeg(halfHrad * 2);
}

/**
 * 水平FOV (hFOV) とアスペクト比から垂直FOV (vFOV) を算出
 * tan(vFOV / 2) = (1 / aspect) * tan(hFOV / 2)
 */
export function hFovToVfov(hFovDeg, aspect) {
  const ar = parseAspectRatio(aspect);
  const safeHdeg = Math.max(0.1, Math.min(179.9, Number(hFovDeg) || 90));
  const halfHrad = degToRad(safeHdeg / 2);
  const halfVrad = Math.atan((1 / ar) * Math.tan(halfHrad));
  return radToDeg(halfVrad * 2);
}

/**
 * 垂直FOV (vFOV) とアスペクト比から対角FOV (dFOV) を算出
 */
export function vFovToDfov(vFovDeg, aspect) {
  const ar = parseAspectRatio(aspect);
  const safeVdeg = Math.max(0.1, Math.min(179.9, Number(vFovDeg) || 70));
  const halfV = Math.tan(degToRad(safeVdeg / 2));
  const halfH = halfV * ar;
  const halfD = Math.atan(Math.sqrt(halfH * halfH + halfV * halfV));
  return radToDeg(halfD * 2);
}

/**
 * 対角FOV (dFOV) とアスペクト比から垂直FOV (vFOV) を算出
 */
export function dFovToVfov(dFovDeg, aspect) {
  const ar = parseAspectRatio(aspect);
  const safeDdeg = Math.max(0.1, Math.min(179.9, Number(dFovDeg) || 90));
  const halfD = Math.tan(degToRad(safeDdeg / 2));
  const halfV = Math.atan(halfD / Math.sqrt(1 + ar * ar));
  return radToDeg(halfV * 2);
}

/**
 * Hor+方式におけるアスペクト比間の水平FOV変換
 * tan(hFOV2 / 2) = (ar2 / ar1) * tan(hFOV1 / 2)
 */
export function convertHfovBetweenAspects(hFovDeg, fromAspect, toAspect) {
  const ar1 = parseAspectRatio(fromAspect);
  const ar2 = parseAspectRatio(toAspect);
  const safeHdeg = Math.max(0.1, Math.min(179.9, Number(hFovDeg) || 90));
  const halfRad1 = degToRad(safeHdeg / 2);
  const halfRad2 = Math.atan((ar2 / ar1) * Math.tan(halfRad1));
  return radToDeg(halfRad2 * 2);
}

/**
 * 任意のFOVタイプから垂直FOV (vFOV) への正規化
 * @param {number} value - 角度 (deg)
 * @param {string} type - 'vfov' | 'hfov_16_9' | 'hfov_4_3' | 'hfov_16_10' | 'hfov_21_9' | 'dfov' | '4:3_apex'
 * @param {number|string} currentAspect - 現在のアスペクト比
 */
export function normalizeToVfov(value, type, currentAspect = '16:9') {
  const ar = parseAspectRatio(currentAspect);
  const safeVal = Math.max(0.1, Math.min(179.9, Number(value) || 90));
  switch (type) {
    case 'vfov':
    case 'hfov_1_1':
    case '1:1':
      return safeVal;
    case '4:3_apex':
    case 'apex_4_3':
    case 'apex': {
      const scale = 1.0 + (safeVal - 70) * (0.55 / 40);
      return hFovToVfov(70 * scale, '4:3');
    }
    case 'hfov_16_9':
      return hFovToVfov(safeVal, '16:9');
    case 'hfov_4_3':
      return hFovToVfov(safeVal, '4:3');
    case 'hfov_16_10':
      return hFovToVfov(safeVal, '16:10');
    case 'hfov_21_9':
      return hFovToVfov(safeVal, '21:9');
    case 'dfov':
      return dFovToVfov(safeVal, ar);
    case 'hfov_current':
    default:
      return hFovToVfov(safeVal, ar);
  }
}

/**
 * 垂直FOV (vFOV) から任意のFOVタイプへの変換
 */
export function convertFromVfov(vFovDeg, targetType, currentAspect = '16:9') {
  const ar = parseAspectRatio(currentAspect);
  const safeVdeg = Math.max(0.1, Math.min(179.9, Number(vFovDeg) || 70));
  switch (targetType) {
    case 'vfov':
    case 'hfov_1_1':
    case '1:1':
      return safeVdeg;
    case '4:3_apex':
    case 'apex_4_3':
    case 'apex': {
      const true43 = vFovToHfov(safeVdeg, '4:3');
      const scale = true43 / 70;
      return 70 + (scale - 1.0) * (40 / 0.55);
    }
    case 'hfov_16_9':
      return vFovToHfov(safeVdeg, '16:9');
    case 'hfov_4_3':
      return vFovToHfov(safeVdeg, '4:3');
    case 'hfov_16_10':
      return vFovToHfov(safeVdeg, '16:10');
    case 'hfov_21_9':
      return vFovToHfov(safeVdeg, '21:9');
    case 'dfov':
      return vFovToDfov(safeVdeg, ar);
    case 'hfov_current':
    default:
      return vFovToHfov(safeVdeg, ar);
  }
}

/**
 * ズーム倍率 M からADS視野角を算出
 * tan(adsFov / 2) = (1 / M) * tan(hipFov / 2)
 */
export function calculateAdsFovFromZoom(hipFovDeg, zoomMultiplier) {
  if (zoomMultiplier <= 0) return hipFovDeg;
  const safeHip = Math.max(0.1, Math.min(179.9, Number(hipFovDeg) || 90));
  const halfRad = degToRad(safeHip / 2);
  const adsHalfRad = Math.atan((1 / zoomMultiplier) * Math.tan(halfRad));
  return radToDeg(adsHalfRad * 2);
}

/**
 * 2つの視野角から実効ズーム倍率 M を算出
 */
export function calculateZoomFromFovs(hipFovDeg, adsFovDeg) {
  const safeHip = Math.max(0.1, Math.min(179.9, Number(hipFovDeg) || 90));
  const safeAds = Math.max(0.1, Math.min(179.9, Number(adsFovDeg) || 45));
  const halfHip = Math.tan(degToRad(safeHip / 2));
  const halfAds = Math.tan(degToRad(safeAds / 2));
  if (halfAds === 0) return 1;
  return halfHip / halfAds;
}

/**
 * 画面中心からの比率 p (0.0〜1.0) にある目標を捉えるための回転角度 (deg) を算出
 * theta = atan(p * tan(fov / 2))
 */
export function calculateAngleToScreenRatio(p, fovDeg) {
  const safeFov = Math.max(0.1, Math.min(179.9, Number(fovDeg) || 90));
  const halfRad = degToRad(safeFov / 2);
  return radToDeg(Math.atan(p * Math.tan(halfRad)));
}

/**
 * 基準アスペクト比でのFOVから、指定表示アスペクト比での実効水平FOV (actual hFOV) および垂直FOV (vFOV) を算出
 * @param {number} inputFov - 入力FOV角度 (deg, 1〜180)
 * @param {string} baseAspect - 基準アスペクト比 ('1:1' | '4:3' | '4:3_apex' | '16:9' | '21:9' | 'vfov')
 * @param {string|number} displayAspect - 表示画面アスペクト比 ('16:9' | '4:3' | '1:1' | '21:9')
 * @returns {{ hFov: number, vFov: number }}
 */
export function calculateEffectiveFov(inputFov, baseAspect, displayAspect) {
  const safeInput = Math.max(0.1, Math.min(179.9, Number(inputFov) || 90));
  let vFov;
  if (baseAspect === 'vfov' || baseAspect === '1:1') {
    vFov = safeInput;
  } else if (baseAspect === '4:3_apex' || baseAspect === 'apex_4_3' || baseAspect === 'apex') {
    // Apex Legends 4:3カスタム:
    // ゲーム内スライダー値から内部実質4:3 FOV (70 * cl_fovscale) へ変換後、vFOVを算出
    // cl_fovscale = 1.0 + (inputFov - 70) * (0.55 / 40)
    const scale = 1.0 + (safeInput - 70) * (0.55 / 40);
    const true43 = Math.max(0.1, Math.min(179.9, 70 * scale));
    vFov = hFovToVfov(true43, '4:3');
  } else {
    vFov = hFovToVfov(safeInput, baseAspect);
  }
  vFov = Math.max(0.1, Math.min(179.9, vFov));
  const hFov = vFovToHfov(vFov, displayAspect);
  return { hFov: Math.max(0.1, Math.min(179.9, hFov)), vFov };
}
