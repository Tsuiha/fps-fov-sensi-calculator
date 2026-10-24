/**
 * FOV Canvas Simulator Engine (Refined Geometry & Layout)
 * 1. 頭の十字マーカーの中心 = 水平線 (アイレベル) に完全一致
 * 2. 俯瞰画面を中央に大きく配置・見切れ完全解消
 * 3. 画面A・Bを右側に上下2段で配置
 */

import { degToRad, radToDeg, parseAspectRatio, hFovToVfov, vFovToHfov, calculateEffectiveFov } from '../core/fov.js';

/**
 * Apex Legends スコープ別 FOV Multiplier (JSCalc / Drimzi / Source Engine 仕様)
 * baseZoomFOV (4:3基準):
 *  1x (アイアン/等倍): 55.0° (fovMulti = 55.0 / 70.0)
 *  2x (Bruiser): 38.5° (fovMulti = 38.5 / 70.0)
 *  3x (Ranger): 26.5° (fovMulti = 26.5 / 70.0)
 *  4x (2-4x / Sniper): 20.0° (fovMulti = 20.0 / 70.0)
 *  6x (Sniper): 13.5° (fovMulti = 13.5 / 70.0)
 *  8x (4-8x): 10.0° (fovMulti = 10.0 / 70.0)
 *  10x (Kraber / Threat): 8.0° (fovMulti = 8.0 / 70.0)
 */
export function getApexFovMultiplier(zoom) {
  const APEX_SCOPES = [
    { zoom: 1.0, baseFov: 55.0 },
    { zoom: 2.0, baseFov: 38.5 },
    { zoom: 3.0, baseFov: 26.5 },
    { zoom: 4.0, baseFov: 20.0 },
    { zoom: 6.0, baseFov: 13.5 },
    { zoom: 8.0, baseFov: 10.0 },
    { zoom: 10.0, baseFov: 8.0 }
  ];

  if (zoom <= 1.0) {
    const baseFov = 70.0 - Math.max(0, zoom) * (70.0 - 55.0);
    return baseFov / 70.0;
  }
  if (zoom >= 10.0) {
    return (8.0 * (10.0 / zoom)) / 70.0;
  }

  for (let i = 0; i < APEX_SCOPES.length - 1; i++) {
    const p1 = APEX_SCOPES[i];
    const p2 = APEX_SCOPES[i + 1];
    if (zoom >= p1.zoom && zoom <= p2.zoom) {
      const t = (zoom - p1.zoom) / (p2.zoom - p1.zoom);
      const baseFov = p1.baseFov + t * (p2.baseFov - p1.baseFov);
      return baseFov / 70.0;
    }
  }
  return 55.0 / 70.0;
}

export class FovSimulator {
  /**
   * @param {Object} canvases - { hipA, hipB, adsHip, adsZoom, topDownHip, topDownAds }
   */
  constructor(canvases) {
    this.canvases = canvases;
    this.contexts = {};
    for (const key in canvases) {
      if (canvases[key]) {
        this.contexts[key] = canvases[key].getContext('2d');
      }
    }

    this.state = {
      // 共通表示設定
      aspectRatio: '16:9',

      // Hipfire 比較用
      hipFovA: 90,
      hipBaseArA: '4:3_apex',
      hipFovB: 103,
      hipBaseArB: '16:9',
      hipMdPercent: 100, // 変換MD% ガイドライン用 (初期値 100%)

      // ADS 比較用
      baseHipFov: 103,
      baseHipBaseAr: '16:9',
      adsZoom: 2.0,
      adsCalcMode: 'optical', // 'optical' (tan比率), 'valorant' (16:9角度除算), 'apex' (4:3ベース), 'angle_current' (設定角除算)
      adsTargetMdPercent: 100, // 変換MD% ガイドライン用 (ADS)

      // 共通ターゲット設定 (物理単位: メートル)
      // 1体目: 赤 (Red Target)
      targetDistance: 10,   // ターゲット距離 (m)
      targetAngleDeg: 12,   // ターゲットの水平角度 (deg, 右寄り)
      // 2体目: 青 (Blue Target)
      target2Distance: 5,   // ターゲット距離 (m, 近め)
      target2AngleDeg: -18, // ターゲットの水平角度 (deg, 左寄り)
      targetHeightM: 1.70   // 敵の身長 (1.70m = プレイヤーのアイレベル)
    };

    this.isDragging = false;
    this.activeCanvas = null;
    this.activeDragTarget = 1; // ドラッグ対象 (1: 赤, 2: 青)
    this.onDistanceChange = null;

    this.initDragListeners();
    this.resizeAll();
    window.addEventListener('resize', () => {
      this.resizeAll();
      this.render();
    });
  }

  calcAdsFovInfo() {
    // ADSは16:9固定
    const dispAr = '16:9';
    const hipEff = calculateEffectiveFov(this.state.baseHipFov, this.state.baseHipBaseAr, dispAr);
    const zoom = Math.max(0.1, Number(this.state.adsZoom) || 1.0);
    const mode = this.state.adsCalcMode || 'optical';

    let adsVfov = hipEff.vFov;

    if (mode === 'optical') {
      // 光学倍率(画面基準, BFV): tan比率で画面上の標的サイズが倍率分拡大
      // tan(vFOV_ads / 2) = (1 / zoom) * tan(vFOV_hip / 2)
      adsVfov = 2 * radToDeg(Math.atan((1 / zoom) * Math.tan(degToRad(hipEff.vFov / 2))));
    } else if (mode === 'valorant' || mode === 'hfov_16_9') {
      // 視野角倍率(16:9hfov, valorant): 16:9 水平画角を直接倍率で割る
      const hip169 = vFovToHfov(hipEff.vFov, '16:9');
      const ads169 = hip169 / zoom;
      // 16:9の角度から vFOV を逆算: tan(v/2) = (9/16) * tan(h169/2)
      adsVfov = 2 * radToDeg(Math.atan((9 / 16) * Math.tan(degToRad(ads169 / 2))));
    } else if (mode === 'hfov_4_3') {
      // 視野角倍率(4:3hfov): 4:3 水平画角を直接倍率で割る
      const hip43 = vFovToHfov(hipEff.vFov, '4:3');
      const ads43 = hip43 / zoom;
      // 4:3 の角度から vFOV を逆算: tan(v/2) = (3/4) * tan(h43/2)
      adsVfov = 2 * radToDeg(Math.atan((3 / 4) * Math.tan(degToRad(ads43 / 2))));
    } else if (mode === 'vfov') {
      // 視野角倍率(vfov): 垂直画角を直接倍率で割る
      adsVfov = hipEff.vFov / zoom;
    } else if (mode === 'apex') {
      // Apex方式 (4:3カスタム):
      // 4:3 水平画角に各スコープ固有の縮小係数 (baseZoomFOV / 70°) を乗算
      const hip43 = vFovToHfov(hipEff.vFov, '4:3');
      const fovMulti = getApexFovMultiplier(zoom);
      const ads43 = hip43 * fovMulti;
      // 4:3 の角度から vFOV を逆算: tan(v/2) = (3/4) * tan(ads43 / 2)
      adsVfov = 2 * radToDeg(Math.atan((3 / 4) * Math.tan(degToRad(ads43 / 2))));
    }

    const adsHfov = vFovToHfov(adsVfov, dispAr);
    // 画面中央での標的ピクセル拡大比率 = tan(hipVfov/2) / tan(adsVfov/2)
    const apparentSizeRatio = Math.tan(degToRad(hipEff.vFov / 2)) / Math.max(0.0001, Math.tan(degToRad(adsVfov / 2)));

    return {
      vFov: adsVfov,
      hFov: adsHfov,
      apparentSizeRatio,
      hipEff,
      mode,
      zoom
    };
  }

  resizeAll() {
    const dpr = window.devicePixelRatio || 1;
    for (const key in this.canvases) {
      const canvas = this.canvases[key];
      if (!canvas) continue;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = this.contexts[key];
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
    }
  }

  isLightMode() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  initDragListeners() {
    // 3Dプレビュー画面での左右ドラッグ (近い方のターゲットの角度変更)
    const attachScreenDrag = (canvas, getFovInfo, getAr = null) => {
      if (!canvas) return;

      const getAngle = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const mouseX = clientX - rect.left;
        const targetAr = parseAspectRatio(getAr ? getAr() : this.state.aspectRatio);

        let frameW = rect.width;
        let frameH = rect.width / targetAr;
        if (frameH > rect.height) {
          frameH = rect.height;
          frameW = rect.height * targetAr;
        }
        const frameX = (rect.width - frameW) / 2;
        const cx = frameX + frameW / 2;

        const info = getFovInfo();
        const halfVrad = degToRad(info.vFov / 2);
        const f = (frameH / 2) / Math.tan(halfVrad);

        const screenXOffset = mouseX - cx;
        const angleRad = Math.atan(screenXOffset / f);
        return radToDeg(angleRad);
      };

      const start = (e) => {
        this.isDragging = true;
        this.activeCanvas = canvas;

        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const mouseX = clientX - rect.left;
        const targetAr = parseAspectRatio(getAr ? getAr() : this.state.aspectRatio);

        let frameW = rect.width;
        let frameH = rect.width / targetAr;
        if (frameH > rect.height) {
          frameH = rect.height;
          frameW = rect.height * targetAr;
        }
        const frameX = (rect.width - frameW) / 2;
        const cx = frameX + frameW / 2;
        const info = getFovInfo();
        const halfVrad = degToRad(info.vFov / 2);
        const f = (frameH / 2) / Math.tan(halfVrad);

        // クリック位置から各ターゲットの画面Xへの距離を比較し、近い方を操作
        const screenX1 = cx + f * Math.tan(degToRad(this.state.targetAngleDeg));
        const screenX2 = cx + f * Math.tan(degToRad(this.state.target2AngleDeg));
        this.activeDragTarget = (Math.abs(mouseX - screenX2) < Math.abs(mouseX - screenX1)) ? 2 : 1;

        const newAngle = Math.max(-88, Math.min(88, getAngle(e)));
        if (this.activeDragTarget === 2) {
          this.state.target2AngleDeg = newAngle;
        } else {
          this.state.targetAngleDeg = newAngle;
        }
        this.render();
      };

      const move = (e) => {
        if (!this.isDragging || this.activeCanvas !== canvas) return;
        const newAngle = Math.max(-88, Math.min(88, getAngle(e)));
        if (this.activeDragTarget === 2) {
          this.state.target2AngleDeg = newAngle;
        } else {
          this.state.targetAngleDeg = newAngle;
        }
        this.render();
      };

      const end = () => {
        this.isDragging = false;
        this.activeCanvas = null;
      };

      canvas.addEventListener('mousedown', start);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);

      canvas.addEventListener('touchstart', start, { passive: true });
      window.addEventListener('touchmove', move, { passive: true });
      window.addEventListener('touchend', end);
    };

    attachScreenDrag(this.canvases.hipA, () => {
      return calculateEffectiveFov(this.state.hipFovA, this.state.hipBaseArA, this.state.aspectRatio);
    });
    attachScreenDrag(this.canvases.hipB, () => {
      return calculateEffectiveFov(this.state.hipFovB, this.state.hipBaseArB, this.state.aspectRatio);
    });
    attachScreenDrag(this.canvases.adsHip, () => {
      return calculateEffectiveFov(this.state.baseHipFov, this.state.baseHipBaseAr, '16:9');
    }, () => '16:9');
    attachScreenDrag(this.canvases.adsZoom, () => {
      const info = this.calcAdsFovInfo();
      return { vFov: info.vFov, hFov: info.hFov };
    }, () => '16:9');

    // 俯瞰画面でのドラッグ (近い方のターゲットの角度＋距離を操作)
    const attachTopDownDrag = (canvas) => {
      if (!canvas) return;
      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const originX = rect.width / 2;
        const originY = rect.height - 25;
        const maxRadius = Math.min(rect.height - 45, rect.width / 2 - 14);

        const dx = mouseX - originX;
        const dy = originY - mouseY;
        const angleRad = Math.atan2(dx, dy);
        let dist = (Math.sqrt(dx * dx + dy * dy) / maxRadius) * 15;
        dist = Math.max(1, Math.min(15, dist));
        let angleDeg = radToDeg(angleRad);
        angleDeg = Math.max(-88, Math.min(88, angleDeg));
        return { angleDeg, dist: Math.round(dist * 10) / 10 };
      };

      const start = (e) => {
        this.isDragging = true;
        this.activeCanvas = canvas;
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const originX = rect.width / 2;
        const originY = rect.height - 25;
        const maxRadius = Math.min(rect.height - 45, rect.width / 2 - 14);

        // 赤と青の2D座標を計算し、クリック位置に近い方をドラッグ対象に選定
        const r1 = (this.state.targetDistance / 15) * maxRadius;
        const tx1 = originX + r1 * Math.sin(degToRad(this.state.targetAngleDeg));
        const ty1 = originY - r1 * Math.cos(degToRad(this.state.targetAngleDeg));

        const r2 = (this.state.target2Distance / 15) * maxRadius;
        const tx2 = originX + r2 * Math.sin(degToRad(this.state.target2AngleDeg));
        const ty2 = originY - r2 * Math.cos(degToRad(this.state.target2AngleDeg));

        const d1 = Math.hypot(mouseX - tx1, mouseY - ty1);
        const d2 = Math.hypot(mouseX - tx2, mouseY - ty2);
        this.activeDragTarget = (d2 < d1) ? 2 : 1;

        const { angleDeg, dist } = getPos(e);
        if (this.activeDragTarget === 2) {
          this.state.target2AngleDeg = angleDeg;
          this.state.target2Distance = dist;
        } else {
          this.state.targetAngleDeg = angleDeg;
          this.state.targetDistance = dist;
        }
        if (this.onDistanceChange) {
          this.onDistanceChange({ dist1: this.state.targetDistance, dist2: this.state.target2Distance });
        }
        this.render();
      };

      const move = (e) => {
        if (!this.isDragging || this.activeCanvas !== canvas) return;
        const { angleDeg, dist } = getPos(e);
        if (this.activeDragTarget === 2) {
          this.state.target2AngleDeg = angleDeg;
          this.state.target2Distance = dist;
        } else {
          this.state.targetAngleDeg = angleDeg;
          this.state.targetDistance = dist;
        }
        if (this.onDistanceChange) {
          this.onDistanceChange({ dist1: this.state.targetDistance, dist2: this.state.target2Distance });
        }
        this.render();
      };

      const end = () => {
        this.isDragging = false;
        this.activeCanvas = null;
      };

      canvas.addEventListener('mousedown', start);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);

      canvas.addEventListener('touchstart', start, { passive: true });
      window.addEventListener('touchmove', move, { passive: true });
      window.addEventListener('touchend', end);
    };

    attachTopDownDrag(this.canvases.topDownHip);
    attachTopDownDrag(this.canvases.topDownAds);
  }

  updateState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  render() {
    // 1. Hipfire 比較
    const effA = calculateEffectiveFov(this.state.hipFovA, this.state.hipBaseArA, this.state.aspectRatio);
    const effB = calculateEffectiveFov(this.state.hipFovB, this.state.hipBaseArB, this.state.aspectRatio);
    const hipMd = this.state.hipMdPercent;
    try {
      this.renderPerspectiveScreen(
        this.canvases.hipA, this.contexts.hipA,
        effA.vFov, effA.hFov, this.state.hipFovA, this.state.hipBaseArA,
        '変換前', false, false, null, hipMd
      );
    } catch (e) { console.error('Error rendering hipA:', e); }

    try {
      this.renderPerspectiveScreen(
        this.canvases.hipB, this.contexts.hipB,
        effB.vFov, effB.hFov, this.state.hipFovB, this.state.hipBaseArB,
        '変換後', true, false, null, hipMd
      );
    } catch (e) { console.error('Error rendering hipB:', e); }

    try {
      this.renderTopDown(this.canvases.topDownHip, this.contexts.topDownHip, effA.hFov, effB.hFov, false);
    } catch (e) { console.error('Error rendering topDownHip:', e); }

    // 2. ADS 比較 (16:9固定)
    const adsInfo = this.calcAdsFovInfo();
    const hipEff = adsInfo.hipEff;
    const adsVfov = adsInfo.vFov;
    const adsHfov = adsInfo.hFov;
    const adsTargetMd = this.state.adsTargetMdPercent;
    try {
      this.renderPerspectiveScreen(
        this.canvases.adsHip, this.contexts.adsHip,
        hipEff.vFov, hipEff.hFov, this.state.baseHipFov, this.state.baseHipBaseAr,
        'Hipfire', false, false, '16:9', adsTargetMd
      );
    } catch (e) { console.error('Error rendering adsHip:', e); }

    const modeLabels = {
      optical: '光学',
      valorant: '16:9除算',
      hfov_4_3: '4:3除算',
      vfov: 'vFOV除算',
      apex: 'Apex式'
    };
    const modeLabel = modeLabels[this.state.adsCalcMode] || 'ADS';

    try {
      this.renderPerspectiveScreen(
        this.canvases.adsZoom, this.contexts.adsZoom,
        adsVfov, adsHfov, this.state.baseHipFov, this.state.baseHipBaseAr,
        `ADS [${modeLabel}] (${this.state.adsZoom.toFixed(2)}x)`, true, true, '16:9', adsTargetMd
      );
    } catch (e) { console.error('Error rendering adsZoom:', e); }

    try {
      this.renderTopDown(this.canvases.topDownAds, this.contexts.topDownAds, hipEff.hFov, adsHfov, true);
    } catch (e) { console.error('Error rendering topDownAds:', e); }
  }

  /**
   * 3D透視投影プレビューの描画
   */
  renderPerspectiveScreen(canvas, ctx, vFovDeg, hFovDeg, inputFov, baseAr, title, isScreenB = false, isAdsZoom = false, overrideAr = null, mdPercent = null) {
    if (!canvas || !ctx) return;
    const width = canvas.getBoundingClientRect().width;
    const height = canvas.getBoundingClientRect().height;
    if (width === 0 || height === 0) return;

    const isLight = this.isLightMode();

    ctx.clearRect(0, 0, width, height);

    // 外枠レターボックス/ピラーボックス背景の塗りつぶし
    ctx.fillStyle = isLight ? '#dde3eb' : '#05070a';
    ctx.fillRect(0, 0, width, height);

    // 1. アスペクト比フレームの計算
    const targetAr = parseAspectRatio(overrideAr || this.state.aspectRatio);
    let frameW = width;
    let frameH = width / targetAr;
    if (frameH > height) {
      frameH = height;
      frameW = height * targetAr;
    }
    const frameX = (width - frameW) / 2;
    const frameY = (height - frameH) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(frameX, frameY, frameW, frameH);
    ctx.clip();

    // 2. 水平線 (アイレベル) = 画面中央 Y座標
    const horizonY = frameY + frameH / 2;

    // 空 (眩しさを抑えた落ち着いたマットデイライトブルー)
    const skyGrad = ctx.createLinearGradient(0, frameY, 0, horizonY);
    if (isLight) {
      skyGrad.addColorStop(0, '#c8d7e6');
      skyGrad.addColorStop(1, '#b0c5d8');
    } else {
      skyGrad.addColorStop(0, '#060911');
      skyGrad.addColorStop(1, '#0f1626');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(frameX, frameY, frameW, frameH / 2);

    // 地面 (落ち着いたマットスレートグレー)
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, frameY + frameH);
    if (isLight) {
      groundGrad.addColorStop(0, '#c6d0dc');
      groundGrad.addColorStop(1, '#aebac8');
    } else {
      groundGrad.addColorStop(0, '#0b0f1a');
      groundGrad.addColorStop(1, '#05070a');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(frameX, horizonY, frameW, frameH / 2);

    // 3. 地平線 (水平線)
    if (isLight) {
      ctx.strokeStyle = isAdsZoom ? 'rgba(190, 24, 93, 0.45)' : (isScreenB ? 'rgba(180, 83, 9, 0.45)' : 'rgba(2, 132, 199, 0.45)');
    } else {
      ctx.strokeStyle = isAdsZoom ? 'rgba(255, 0, 128, 0.35)' : (isScreenB ? 'rgba(255, 208, 0, 0.25)' : 'rgba(0, 242, 254, 0.25)');
    }
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(frameX, horizonY);
    ctx.lineTo(frameX + frameW, horizonY);
    ctx.stroke();

    // 4. 地面の透視グリッド
    this.renderGroundGrid(ctx, frameX, horizonY, frameW, frameH / 2);

    // 5. 焦点距離 f (垂直画角基準: f = (frameH / 2) / tan(vFOV / 2))
    const safeVfov = Math.max(0.1, Math.min(179.5, vFovDeg));
    const halfVrad = degToRad(safeVfov / 2);
    const f = (frameH / 2) / Math.tan(halfVrad);

    // 6. 2体の標的（敵1: 赤, 敵2: 青）の物理サイズと画面座標
    const d1 = Math.max(0.5, this.state.targetDistance);
    const H1 = (f * this.state.targetHeightM) / d1;
    const safeAngle1 = Math.max(-88, Math.min(88, this.state.targetAngleDeg));
    const targetScreenX1 = frameX + frameW / 2 + f * Math.tan(degToRad(safeAngle1));
    const isInside1 = (targetScreenX1 >= frameX && targetScreenX1 <= frameX + frameW);

    const d2 = Math.max(0.5, this.state.target2Distance);
    const H2 = (f * this.state.targetHeightM) / d2;
    const safeAngle2 = Math.max(-88, Math.min(88, this.state.target2AngleDeg));
    const targetScreenX2 = frameX + frameW / 2 + f * Math.tan(degToRad(safeAngle2));
    const isInside2 = (targetScreenX2 >= frameX && targetScreenX2 <= frameX + frameW);

    // 距離が遠い順に描画 (手前の敵が奥の敵を自然に遮蔽する正しいZソート)
    const targets = [
      { id: 1, color: 'red', dist: d1, heightPx: H1, screenX: targetScreenX1, inside: isInside1, label: '赤' },
      { id: 2, color: 'blue', dist: d2, heightPx: H2, screenX: targetScreenX2, inside: isInside2, label: '青' }
    ];
    targets.sort((a, b) => b.dist - a.dist);

    for (const t of targets) {
      if (t.inside) {
        this.renderKovaaksKokeshiBot(ctx, t.screenX, horizonY, t.heightPx, t.dist, t.color, t.label);
      } else {
        this.renderOffscreenAlert(ctx, frameX, horizonY, frameW, t.screenX < frameX ? 'left' : 'right', t.color, t.label);
      }
    }

    // 7. クロスヘア (画面中央)
    this.renderCrosshair(ctx, frameX + frameW / 2, horizonY);

    // 8. 変換MD% の縦ライン描画 (MD Guide Lines)
    if (typeof mdPercent === 'number' && isFinite(mdPercent) && mdPercent < 9999) {
      this.renderMdGuideLines(ctx, frameX, frameY, frameW, frameH, mdPercent, isLight);
    }

    ctx.restore();

    // 外枠
    if (isLight) {
      ctx.strokeStyle = isAdsZoom ? 'rgba(190, 24, 93, 0.4)' : (isScreenB ? 'rgba(180, 83, 9, 0.4)' : 'rgba(2, 132, 199, 0.4)');
    } else {
      ctx.strokeStyle = isAdsZoom ? 'rgba(255, 0, 128, 0.4)' : (isScreenB ? 'rgba(255, 208, 0, 0.4)' : 'rgba(0, 242, 254, 0.4)');
    }
    ctx.lineWidth = 1;
    ctx.strokeRect(frameX, frameY, frameW, frameH);
  }

  /**
   * 変換MD% の縦ライン描画 (画面中のMD位置を示すガイドライン)
   */
  renderMdGuideLines(ctx, frameX, frameY, frameW, frameH, mdPercent, isLight) {
    if (typeof mdPercent !== 'number' || !isFinite(mdPercent) || mdPercent < 0 || mdPercent >= 9999) {
      return;
    }

    const centerX = frameX + frameW / 2;
    const halfW = frameW / 2;
    const p = mdPercent / 100;

    const strokeColor = isLight ? 'rgba(147, 51, 234, 0.75)' : 'rgba(192, 132, 252, 0.75)';

    ctx.save();

    if (p <= 0.001) {
      // MD 0% (中心線)
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, frameY);
      ctx.lineTo(centerX, frameY + frameH);
      ctx.stroke();
    } else {
      const offset = p * halfW;
      const xL = centerX - offset;
      const xR = centerX + offset;

      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;

      // 左側のライン
      if (xL >= frameX - 1 && xL <= frameX + frameW + 1) {
        const drawX = Math.max(frameX + 1, Math.min(frameX + frameW - 1, xL));
        ctx.beginPath();
        ctx.moveTo(drawX, frameY);
        ctx.lineTo(drawX, frameY + frameH);
        ctx.stroke();
      }

      // 右側のライン
      if (xR >= frameX - 1 && xR <= frameX + frameW + 1) {
        const drawX = Math.max(frameX + 1, Math.min(frameX + frameW - 1, xR));
        ctx.beginPath();
        ctx.moveTo(drawX, frameY);
        ctx.lineTo(drawX, frameY + frameH);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  /**
   * ★KovaaK's 風 フラットこけし型 ターゲットダミー描画
   * - まんまこけし形状 (球体の頭部 ＋ 太さ1.5倍の均一胴体)
   * - 肩の曲率をさらに丸め、滑らかなドーム型ショルダークーブを形成
   * - 頭と胴体は接する自然な配置 (bodyTopY を頭部下端へ)
   * - 立体感のないベタ塗り (赤 or 青)
   * - 接地ドロップシャドウ
   * - 頭部中心 (ヘッドショット十字) が「水平線 (horizonY)」と厳密に一致 (1.70m目線)
   */
  renderKovaaksKokeshiBot(ctx, x, horizonY, totalHeightPx, distM = null, colorTheme = 'red', label = '') {
    ctx.save();
    const isLight = this.isLightMode();

    // ★立体感のないベタ塗りカラー (赤 or 青)
    let solidColor, strokeColor;
    if (colorTheme === 'blue') {
      solidColor = isLight ? '#2563eb' : '#0088ff';
      strokeColor = isLight ? '#1e40af' : '#60a5fa';
    } else {
      solidColor = isLight ? '#dc2626' : '#ff0038';
      strokeColor = isLight ? '#991b1b' : '#ff4d6d';
    }

    const effectiveDist = distM !== null ? distM : this.state.targetDistance;
    const distStr = (typeof effectiveDist === 'number' && effectiveDist % 1 !== 0)
      ? `${effectiveDist.toFixed(1)}m`
      : `${effectiveDist}m`;
    const labelPrefix = label ? `${label} ` : '';

    // ★超広角(180°近傍)や極小表示時でも敵を見失わないよう、最小マーカーとして確実に描画
    if (totalHeightPx < 12) {
      if (!isLight) {
        ctx.shadowColor = solidColor;
        ctx.shadowBlur = 4;
      }
      ctx.fillStyle = solidColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, horizonY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 足元距離・ラベル表記 (赤と青で上下に分離して重なりを防止)
      ctx.fillStyle = isLight ? '#0f172a' : '#ffffff';
      ctx.font = 'bold 8px JetBrains Mono';
      ctx.textAlign = 'center';
      const heightText = totalHeightPx < 1 ? '<1px' : `${totalHeightPx.toFixed(0)}px`;
      const labelY = colorTheme === 'blue' ? horizonY + 12 : horizonY - 8;
      ctx.fillText(`${labelPrefix}${distStr} (${heightText})`, x, labelY);
      ctx.restore();
      return;
    }

    const H = totalHeightPx;
    // 頭部半径 (全体の約9.2%)
    const headR = H * 0.092;
    // 足元接地Y座標 (頭部中心が horizonY のため、接地底面は horizonY + H - headR)
    const feetY = horizonY + H - headR;

    // ★胴体の太さは頭の1.5倍 (頭の直径 2*headR に対し、胴体幅 3*headR -> bodyR = headR * 1.5)
    const bodyR = headR * 1.5;

    // 1. 接地ドロップシャドウ (太さに合わせた自然な影)
    const shadowW = bodyR * 1.35;
    const shadowH = Math.max(1.8, H * 0.024);
    const shadowGrad = ctx.createRadialGradient(x, feetY, 0, x, feetY, shadowW);
    if (isLight) {
      shadowGrad.addColorStop(0, 'rgba(15, 23, 42, 0.35)');
      shadowGrad.addColorStop(0.7, 'rgba(15, 23, 42, 0.12)');
      shadowGrad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
    } else {
      shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
      shadowGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.22)');
      shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
    }
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(x, feetY, shadowW, shadowH, 0, 0, Math.PI * 2);
    ctx.fill();

    // 2. 胴体: 太さは頭の1.5倍、頭の下端と接するように下げ、肩を大きく丸めたこけし胴体
    const bodyTopY = horizonY + headR * 0.94; // 頭部下端 (horizonY + headR) とぴったり接する位置
    const bodyH = Math.max(1, feetY - bodyTopY);
    const bodyL = x - bodyR;
    const bodyW = bodyR * 2;
    // ★肩の曲率をさらに丸める (bodyR * 0.85 = より大きな円弧)
    const cornerR = Math.min(bodyR * 0.85, bodyH / 2);

    ctx.fillStyle = solidColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;

    // 上部の肩を丸め、下部は接地したベタ塗り胴体
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(bodyL, bodyTopY, bodyW, bodyH, [cornerR, cornerR, 0, 0]);
    } else {
      ctx.moveTo(bodyL, feetY);
      ctx.lineTo(bodyL, bodyTopY + cornerR);
      ctx.arcTo(bodyL, bodyTopY, bodyL + cornerR, bodyTopY, cornerR);
      ctx.lineTo(bodyL + bodyW - cornerR, bodyTopY);
      ctx.arcTo(bodyL + bodyW, bodyTopY, bodyL + bodyW, bodyTopY + cornerR, cornerR);
      ctx.lineTo(bodyL + bodyW, feetY);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // 3. 頭部 (球体・ベタ塗り、中心が厳密に horizonY)
    ctx.fillStyle = solidColor;
    ctx.strokeStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(x, horizonY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 4. ★KovaaK's風 ヘッドショット十字マーカー (真ん中が horizonY に厳密一致)
    const tickR = headR * 0.85;
    const gap = Math.max(1.5, headR * 0.22);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    // 水平軸
    ctx.moveTo(x - tickR, horizonY);
    ctx.lineTo(x - gap, horizonY);
    ctx.moveTo(x + gap, horizonY);
    ctx.lineTo(x + tickR, horizonY);
    // 垂直軸
    ctx.moveTo(x, horizonY - tickR);
    ctx.lineTo(x, horizonY - gap);
    ctx.moveTo(x, horizonY + gap);
    ctx.lineTo(x, horizonY + tickR);
    ctx.stroke();

    // ヘッド中心ドット
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, horizonY, Math.min(1.5, headR * 0.2), 0, Math.PI * 2);
    ctx.fill();

    // 5. 足元ターゲット距離タグ
    ctx.fillStyle = isLight ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 9px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`${labelPrefix}${distStr} (${H.toFixed(0)}px)`, x, Math.min(feetY + 13, horizonY + H * 0.98));

    ctx.restore();
  }

  // 互換性エイリアス
  renderValorantTrainingBot(ctx, x, horizonY, totalHeightPx) {
    this.renderKovaaksKokeshiBot(ctx, x, horizonY, totalHeightPx);
  }

  renderGroundGrid(ctx, x, horizonY, w, groundH) {
    ctx.save();
    const isLight = this.isLightMode();
    ctx.strokeStyle = isLight ? 'rgba(30, 41, 59, 0.10)' : 'rgba(79, 172, 254, 0.08)';
    ctx.lineWidth = 1;
    const cx = x + w / 2;

    for (let offset = -w; offset <= w * 2; offset += w / 10) {
      ctx.beginPath();
      ctx.moveTo(cx, horizonY);
      ctx.lineTo(offset, horizonY + groundH);
      ctx.stroke();
    }

    for (let i = 1; i <= 8; i++) {
      const lineY = horizonY + groundH * Math.pow(i / 8, 2);
      ctx.beginPath();
      ctx.moveTo(x, lineY);
      ctx.lineTo(x + w, lineY);
      ctx.stroke();
    }
    ctx.restore();
  }

  renderOffscreenAlert(ctx, fx, horizonY, fw, side, colorTheme = 'red', label = '赤') {
    ctx.save();
    const isLight = this.isLightMode();
    const arrowX = side === 'left' ? fx + 24 : fx + fw - 24;
    // 赤と青でアラートのY位置をずらし、同一方向に出ても重ならないように配置
    const alertY = colorTheme === 'blue' ? horizonY + 14 : horizonY - 14;

    const alertColor = colorTheme === 'blue'
      ? (isLight ? '#2563eb' : '#0091ff')
      : (isLight ? '#dc2626' : '#ff0038');

    ctx.fillStyle = alertColor;
    if (!isLight) {
      ctx.shadowColor = alertColor;
      ctx.shadowBlur = 6;
    }

    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(arrowX - 7, alertY);
      ctx.lineTo(arrowX + 5, alertY - 8);
      ctx.lineTo(arrowX + 5, alertY + 8);
    } else {
      ctx.moveTo(arrowX + 7, alertY);
      ctx.lineTo(arrowX - 5, alertY - 8);
      ctx.lineTo(arrowX - 5, alertY + 8);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = side === 'left' ? 'left' : 'right';
    ctx.fillText(`${label} 視界外`, side === 'left' ? arrowX + 11 : arrowX - 11, alertY + 3);

    ctx.restore();
  }

  renderCrosshair(ctx, cx, cy) {
    const isLight = this.isLightMode();
    const color = isLight ? '#0284c7' : '#00f2fe';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    const sz = 5;
    const gap = 3;

    ctx.beginPath();
    ctx.moveTo(cx - sz - gap, cy);
    ctx.lineTo(cx - gap, cy);
    ctx.moveTo(cx + gap, cy);
    ctx.lineTo(cx + sz + gap, cy);
    ctx.moveTo(cx, cy - sz - gap);
    ctx.lineTo(cx, cy - gap);
    ctx.moveTo(cx, cy + gap);
    ctx.lineTo(cx, cy + sz + gap);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }

  renderCompactBadge(ctx, fx, fy, title, inputFov, baseAr, hFovDeg, vFovDeg, distanceM, heightPx, isScreenB, isAdsZoom) {
    ctx.save();
    const isLight = this.isLightMode();
    if (isLight) {
      ctx.fillStyle = 'rgba(238, 242, 247, 0.94)';
      ctx.strokeStyle = isAdsZoom ? 'rgba(190, 24, 93, 0.4)' : (isScreenB ? 'rgba(180, 83, 9, 0.4)' : 'rgba(2, 132, 199, 0.4)');
    } else {
      ctx.fillStyle = 'rgba(10, 14, 22, 0.88)';
      ctx.strokeStyle = isAdsZoom ? 'rgba(255, 0, 128, 0.4)' : (isScreenB ? 'rgba(255, 208, 0, 0.35)' : 'rgba(0, 242, 254, 0.35)');
    }
    ctx.lineWidth = 1;
    ctx.roundRect(fx + 6, fy + 6, 215, 46, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isLight
      ? (isAdsZoom ? '#be185d' : (isScreenB ? '#b45309' : '#0284c7'))
      : (isAdsZoom ? '#ff007f' : (isScreenB ? '#ffd000' : '#00f2fe'));
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(title, fx + 10, fy + 18);

    ctx.fillStyle = isLight ? '#334155' : '#c9d1d9';
    ctx.font = '9px JetBrains Mono';
    if (isAdsZoom) {
      ctx.fillText(`倍率: ${this.state.adsZoom.toFixed(1)}x | 実効: ${hFovDeg.toFixed(1)}°(H) / ${vFovDeg.toFixed(1)}°(V)`, fx + 10, fy + 31);
    } else {
      ctx.fillText(`基準: ${baseAr} ${inputFov.toFixed(1)}° → 実効: ${hFovDeg.toFixed(1)}°(H)`, fx + 10, fy + 31);
    }
    ctx.fillText(`標的高: ${heightPx.toFixed(0)}px | 距離: ${distanceM}m`, fx + 10, fy + 44);
    ctx.restore();
  }

  /**
   * ★中央配置用 俯瞰シミュレーター (Top-Down View)
   * 見切れを完全に解消し、コーン・距離円・標的球を美しく描画
   */
  renderTopDown(canvas, ctx, fovA, fovB, isAds = false) {
    if (!canvas || !ctx) return;
    const width = canvas.getBoundingClientRect().width;
    const height = canvas.getBoundingClientRect().height;
    if (width === 0 || height === 0) return;

    ctx.clearRect(0, 0, width, height);

    const isLight = this.isLightMode();

    // 眩しさを完全排除した落ち着いたマットレーダー背景
    ctx.fillStyle = isLight ? '#dde3eb' : '#07090e';
    ctx.fillRect(0, 0, width, height);

    // プレイヤーカメラ位置: 下部中央
    const originX = width / 2;
    const originY = height - 25;
    // 半径: 上部・左右に見切れないよう余裕を持たせる
    const maxRadius = Math.min(height - 45, width / 2 - 14);

    // 距離同心円ガイド (5m, 10m, 15m)
    ctx.strokeStyle = isLight ? 'rgba(30, 41, 59, 0.12)' : 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const r = (maxRadius / 3) * i;
      ctx.beginPath();
      ctx.arc(originX, originY, r, Math.PI, 0, false);
      ctx.stroke();

      ctx.fillStyle = isLight ? '#475569' : 'rgba(255, 255, 255, 0.35)';
      ctx.font = '9px JetBrains Mono';
      ctx.textAlign = 'left';
      ctx.fillText(`${i * 5}m`, originX + r - 22, originY - 3);
    }

    // FOV A コーン
    const radA = degToRad(fovA / 2);
    const colorA = isLight ? '#0284c7' : '#00f2fe';
    ctx.fillStyle = isLight ? 'rgba(2, 132, 199, 0.14)' : 'rgba(0, 242, 254, 0.16)';
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.arc(originX, originY, maxRadius, -Math.PI / 2 - radA, -Math.PI / 2 + radA);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = colorA;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX - maxRadius * Math.sin(radA), originY - maxRadius * Math.cos(radA));
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + maxRadius * Math.sin(radA), originY - maxRadius * Math.cos(radA));
    ctx.stroke();

    // FOV B コーン
    const radB = degToRad(fovB / 2);
    let colorB;
    if (isLight) {
      colorB = isAds ? '#be185d' : '#b45309';
      ctx.fillStyle = isAds ? 'rgba(190, 24, 93, 0.14)' : 'rgba(180, 83, 9, 0.14)';
    } else {
      colorB = isAds ? '#ff007f' : '#ffd000';
      ctx.fillStyle = isAds ? 'rgba(255, 0, 128, 0.16)' : 'rgba(255, 208, 0, 0.14)';
    }
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.arc(originX, originY, maxRadius, -Math.PI / 2 - radB, -Math.PI / 2 + radB);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = colorB;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX - maxRadius * Math.sin(radB), originY - maxRadius * Math.cos(radB));
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + maxRadius * Math.sin(radB), originY - maxRadius * Math.cos(radB));
    ctx.stroke();

    // 標的 1 の 2D位置球 (赤)
    const targetAngleRad1 = degToRad(this.state.targetAngleDeg);
    const targetR1 = (this.state.targetDistance / 15) * maxRadius;
    const tx1 = originX + targetR1 * Math.sin(targetAngleRad1);
    const ty1 = originY - targetR1 * Math.cos(targetAngleRad1);

    // 標的 2 の 2D位置球 (青)
    const targetAngleRad2 = degToRad(this.state.target2AngleDeg);
    const targetR2 = (this.state.target2Distance / 15) * maxRadius;
    const tx2 = originX + targetR2 * Math.sin(targetAngleRad2);
    const ty2 = originY - targetR2 * Math.cos(targetAngleRad2);

    // 標的 1 への視線ライン (赤)
    ctx.strokeStyle = isLight ? 'rgba(220, 38, 38, 0.45)' : 'rgba(255, 0, 56, 0.45)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(tx1, ty1);
    ctx.stroke();

    // 標的 2 への視線ライン (青)
    ctx.strokeStyle = isLight ? 'rgba(37, 99, 235, 0.45)' : 'rgba(0, 136, 255, 0.45)';
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 標的 1 の球 (赤)
    const redTargetColor = isLight ? '#dc2626' : '#ff0038';
    ctx.fillStyle = redTargetColor;
    if (!isLight) {
      ctx.shadowColor = redTargetColor;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(tx1, ty1, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 標的 1 ラベル
    ctx.fillStyle = isLight ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 9px JetBrains Mono';
    ctx.textAlign = 'center';
    const distStr1 = (typeof this.state.targetDistance === 'number' && this.state.targetDistance % 1 !== 0)
      ? `${this.state.targetDistance.toFixed(1)}m`
      : `${this.state.targetDistance}m`;
    ctx.fillText(`赤 ${distStr1}`, tx1, ty1 - 9);

    // 標的 2 の球 (青)
    const blueTargetColor = isLight ? '#2563eb' : '#0088ff';
    ctx.fillStyle = blueTargetColor;
    if (!isLight) {
      ctx.shadowColor = blueTargetColor;
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    ctx.arc(tx2, ty2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 標的 2 ラベル
    ctx.fillStyle = isLight ? '#0f172a' : '#ffffff';
    ctx.font = 'bold 9px JetBrains Mono';
    ctx.textAlign = 'center';
    const distStr2 = (typeof this.state.target2Distance === 'number' && this.state.target2Distance % 1 !== 0)
      ? `${this.state.target2Distance.toFixed(1)}m`
      : `${this.state.target2Distance}m`;
    ctx.fillText(`青 ${distStr2}`, tx2, ty2 - 9);

    // プレイヤーカメラ位置
    ctx.fillStyle = colorA;
    ctx.beginPath();
    ctx.arc(originX, originY, 4, 0, Math.PI * 2);
    ctx.fill();

    // 凡例 (左上)
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillStyle = colorA;
    ctx.fillText(`■ ${fovA.toFixed(1)}°`, 12, 18);
    ctx.fillStyle = colorB;
    ctx.fillText(`■ ${fovB.toFixed(1)}°`, 12, 32);
  }
}
