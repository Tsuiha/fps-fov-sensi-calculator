/**
 * Sensitivity & Monitor Distance (MD%) Math Engine
 * モニターディスタンス理論および感度スケーリング計算モジュール (一般化対応)
 */

import { degToRad, radToDeg, parseAspectRatio } from './fov.js';

/**
 * 360度回転に必要なマウス移動距離 (cm/360) を算出
 * @param {number} sensitivity - ゲーム内感度値 (または正規化感度)
 * @param {number} dpi - マウスDPI
 * @param {number} yawDegreesPerCount - 1カウントあたりの回転角 (deg)
 * @returns {number} 振り向き (cm)
 */
export function calculateCm360(sensitivity, dpi, yawDegreesPerCount = 0.022) {
  if (sensitivity <= 0 || dpi <= 0 || yawDegreesPerCount <= 0) return 0;
  const countsPer360 = 360 / (sensitivity * yawDegreesPerCount);
  const inches = countsPer360 / dpi;
  return inches * 2.54;
}

/**
 * 振り向き (cm/360) から感度を逆算
 */
export function calculateSensitivityFromCm360(cm360, dpi, yawDegreesPerCount = 0.022) {
  if (cm360 <= 0 || dpi <= 0 || yawDegreesPerCount <= 0) return 0;
  const inches = cm360 / 2.54;
  const countsPer360 = inches * dpi;
  return 360 / (countsPer360 * yawDegreesPerCount);
}

/**
 * モニターディスタンス (MD%) に基づく感度スケーリング比率 (S2 / S1) を算出
 * 
 * - p = 0 のとき (Focal Length / 極限): tan(fov2/2) / tan(fov1/2)
 * - 0 < p < Infinity のとき: atan(p * tan(fov2/2)) / atan(p * tan(fov1/2))
 * - p = Infinity のとき (360°一致): 1.0
 */
export function calculateMdRatio(fov1Deg, fov2Deg, mdPercent, mode = 'horizontal', aspect = '16:9') {
  if (fov1Deg <= 0 || fov2Deg <= 0) return 1.0;
  if (Math.abs(fov1Deg - fov2Deg) < 0.0001) return 1.0;

  // 360° 一致（MD 無限大）
  if (!isFinite(mdPercent) || mdPercent >= 9999) {
    return 1.0;
  }

  const halfRad1 = degToRad(fov1Deg / 2);
  const halfRad2 = degToRad(fov2Deg / 2);

  // MD 0% (極限: tan比率 / 焦点距離比)
  if (mdPercent <= 0) {
    return Math.tan(halfRad2) / Math.tan(halfRad1);
  }

  let p = mdPercent / 100;

  // 垂直基準 (MDV) の場合、水平画角に対する補正
  if (mode === 'vertical') {
    const ar = parseAspectRatio(aspect);
    p = p / ar;
  }

  const theta1 = Math.atan(p * Math.tan(halfRad1));
  const theta2 = Math.atan(p * Math.tan(halfRad2));

  return theta2 / theta1;
}

/**
 * 画面上の特定比率 p (0.0〜1.0) の位置へフリックするのに必要なマウス移動距離 (cm) を算出
 * @param {number} p - 画面中心からの比率 (0.0 〜 1.0)
 * @param {number} fovDeg - 視野角 (deg)
 * @param {number} cm360 - 現在の視野角における360度回転距離 (cm)
 * @returns {number} マウス移動距離 (cm)
 */
export function calculateFlickDistanceCm(p, fovDeg, cm360) {
  const thetaRad = Math.atan(p * Math.tan(degToRad(fovDeg / 2)));
  const thetaDeg = radToDeg(thetaRad);
  return (thetaDeg / 360) * cm360;
}

/**
 * 画面上の任意位置 x におけるフリック誤差 (%) を算出
 */
export function calculateFlickError(x, fov1Deg, fov2Deg, actualRatio) {
  if (x <= 0.0001) {
    const ideal0 = Math.tan(degToRad(fov2Deg / 2)) / Math.tan(degToRad(fov1Deg / 2));
    return ((actualRatio - ideal0) / ideal0) * 100;
  }
  const theta1 = Math.atan(x * Math.tan(degToRad(fov1Deg / 2)));
  const theta2 = Math.atan(x * Math.tan(degToRad(fov2Deg / 2)));
  const idealRatio = theta2 / theta1;
  return ((actualRatio - idealRatio) / idealRatio) * 100;
}

/**
 * ブログ数式に基づく計算ステップ解説テキスト (Markdown/HTML) を動的に生成
 */
export function generateCalculationSteps(fov1Deg, fov2Deg, mdPercent, mode = 'horizontal', aspect = '16:9') {
  const half1 = fov1Deg / 2;
  const half2 = fov2Deg / 2;
  const tan1 = Math.tan(degToRad(half1)).toFixed(4);
  const tan2 = Math.tan(degToRad(half2)).toFixed(4);

  if (mdPercent <= 0) {
    const ratio = (Math.tan(degToRad(half2)) / Math.tan(degToRad(half1))).toFixed(4);
    return `
<strong>【MD 0% (Focal Length / 極限) 計算ステップ】</strong><br>
画面中央近傍 (p → 0) の微小角近似 (tan θ ≒ θ) より：<br>
<code>Ratio = tan(FOV₂ / 2) / tan(FOV₁ / 2)</code><br>
<code>Ratio = tan(${half2.toFixed(1)}°) / tan(${half1.toFixed(1)}°) = ${tan2} / ${tan1} = ${ratio}</code><br>
→ 感度倍率は <strong>${ratio}</strong> となります。
    `.trim();
  }

  if (!isFinite(mdPercent) || mdPercent >= 9999) {
    return `
<strong>【360° 一致 (振り向きcm完全固定) 計算ステップ】</strong><br>
視野角に関わらず回転角に対する移動量を固定するため：<br>
<code>Ratio = 1.0000</code><br>
→ 感度倍率は常に <strong>1.0000</strong>（振り向き不変）となります。
    `.trim();
  }

  let p = mdPercent / 100;
  let pDesc = `${mdPercent}% (p = ${p})`;
  if (mode === 'vertical') {
    const ar = parseAspectRatio(aspect);
    p = p / ar;
    pDesc = `垂直基準 ${mdPercent}% ÷ アスペクト比 ${ar.toFixed(2)} = 水平換算 p = ${p.toFixed(4)}`;
  }

  const theta1Rad = Math.atan(p * Math.tan(degToRad(half1)));
  const theta2Rad = Math.atan(p * Math.tan(degToRad(half2)));
  const theta1Deg = radToDeg(theta1Rad).toFixed(2);
  const theta2Deg = radToDeg(theta2Rad).toFixed(2);
  const ratio = (theta2Rad / theta1Rad).toFixed(4);

  return `
<strong>【モニターディスタンス ${mdPercent}% (${mode === 'horizontal' ? 'MDH' : 'MDV'}) 計算ステップ】</strong><br>
1. 画面位置 ${pDesc} にある目標の回転角を算出：<br>
   <code>θ₁ = atan(p × tan(${half1.toFixed(1)}°)) = ${theta1Deg}°</code><br>
   <code>θ₂ = atan(p × tan(${half2.toFixed(1)}°)) = ${theta2Deg}°</code><br>
2. 回転角の比率から感度倍率を算出：<br>
   <code>Ratio = θ₂ / θ₁ = ${theta2Deg}° / ${theta1Deg}° = ${ratio}</code><br>
→ 感度倍率は <strong>${ratio}</strong> となります。
  `.trim();
}
