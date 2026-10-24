/**
 * Flick Error Curve Analyzer Component
 * 画面比率 (0%〜100%) におけるモニターディスタンスフリック誤差グラフのCanvas描画
 */

import { calculateMdRatio, calculateFlickError } from '../core/sensitivity.js';

export class ErrorAnalyzer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.state = {
      fov1: 106.26,       // 基準水平FOV (Hipfire)
      fov2: 53.13,        // ADS時水平FOV (例: 2倍ズーム)
      activeMdPercent: 0, // ユーザーが現在選択しているMD%
      comparePresets: [0, 75, 100, Infinity] // 比較表示するMD%群
    };

    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      this.render();
    });

    if (window.ResizeObserver && this.canvas.parentElement) {
      const ro = new ResizeObserver(() => {
        this.resize();
        this.render();
      });
      ro.observe(this.canvas.parentElement);
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  updateState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }

  render() {
    const { canvas, ctx, state } = this;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (!width || !height) return;

    ctx.clearRect(0, 0, width, height);

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    // 背景
    ctx.fillStyle = isLight ? '#ffffff' : '#0a0d14';
    ctx.fillRect(0, 0, width, height);

    const padLeft = 55;
    const padRight = 30;
    const padTop = 30;
    const padBottom = 40;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const zeroY = padTop + plotH * 0.45; // 0% 誤差のライン (やや上部)

    // グリッド線描画 (誤差範囲: -40% 〜 +40%)
    const maxError = 30; // ±30%
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;

    for (let err = -maxError; err <= maxError; err += 10) {
      const y = zeroY - (err / maxError) * (plotH * 0.45);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      // 目盛りラベル
      ctx.fillStyle = err === 0 ? (isLight ? '#0088a8' : '#00f2fe') : (isLight ? '#64748b' : 'rgba(255, 255, 255, 0.3)');
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'right';
      ctx.fillText(`${err > 0 ? '+' : ''}${err}%`, padLeft - 8, y + 3);
    }

    // 0% 誤差ライン強調
    ctx.strokeStyle = isLight ? 'rgba(0, 136, 168, 0.5)' : 'rgba(0, 242, 254, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft, zeroY);
    ctx.lineTo(width - padRight, zeroY);
    ctx.stroke();

    // X軸目盛り (画面位置 0% 〜 100%)
    for (let xPct = 0; xPct <= 100; xPct += 25) {
      const x = padLeft + (xPct / 100) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, height - padBottom);
      ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
      ctx.stroke();

      ctx.fillStyle = isLight ? '#64748b' : 'rgba(255, 255, 255, 0.4)';
      ctx.font = '10px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(`${xPct}%`, x, height - padBottom + 16);
    }

    // X軸ラベル
    ctx.fillStyle = isLight ? '#475569' : 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('画面中心からの距離 (%)', padLeft + plotW / 2, height - padBottom + 32);

    // 各プリセット曲線の描画
    const curves = [
      { label: 'MD 0% (Focal Length)', md: 0, color: isLight ? '#0088a8' : '#00f2fe' },
      { label: 'MD 75% (CS / 4:3端)', md: 75, color: isLight ? '#d97706' : '#ffd000' },
      { label: 'MD 100% (VALORANT)', md: 100, color: isLight ? '#059669' : '#00ff88' },
      { label: '360° 一致 (振り向き一定)', md: Infinity, color: isLight ? '#d9146c' : '#ff007f' }
    ];

    curves.forEach(curve => {
      const sensRatio = calculateMdRatio(state.fov1, state.fov2, curve.md);
      const isSelected = Math.abs(state.activeMdPercent - curve.md) < 0.1 || (curve.md === Infinity && state.activeMdPercent > 9000);

      ctx.strokeStyle = curve.color;
      ctx.lineWidth = isSelected ? 3 : 1.5;
      if (!isSelected) {
        ctx.setLineDash([4, 2]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      const steps = 60;
      for (let i = 0; i <= steps; i++) {
        const xPct = i / steps; // 0.0 〜 1.0
        const err = calculateFlickError(xPct, state.fov1, state.fov2, sensRatio);
        // クランプ
        const clampedErr = Math.max(-maxError * 1.5, Math.min(maxError * 1.5, err));
        const px = padLeft + xPct * plotW;
        const py = zeroY - (clampedErr / maxError) * (plotH * 0.45);

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 凡例 (Legend)
    let legendX = padLeft + 10;
    const legendY = padTop + 14;
    ctx.font = 'bold 11px JetBrains Mono';
    ctx.textAlign = 'left';

    curves.forEach((curve, idx) => {
      ctx.fillStyle = curve.color;
      ctx.fillRect(legendX, legendY - 8, 12, 4);
      ctx.fillStyle = isLight ? '#334155' : 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(curve.label, legendX + 16, legendY - 4);
      legendX += ctx.measureText(curve.label).width + 36;
    });
  }
}
