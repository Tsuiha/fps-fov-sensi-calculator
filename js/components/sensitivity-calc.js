/**
 * Universal Sensitivity & FOV Converter Controller (Generalized Math Version)
 * ゲーム非依存の純粋幾何学モデルに基づく高精度感度コンバーター
 */

import {
  normalizeToVfov,
  convertFromVfov,
  calculateAdsFovFromZoom,
  calculateZoomFromFovs,
  parseAspectRatio
} from '../core/fov.js';

import {
  calculateCm360,
  calculateSensitivityFromCm360,
  calculateMdRatio,
  calculateFlickDistanceCm,
  generateCalculationSteps
} from '../core/sensitivity.js';

export class SensitivityCalculator {
  /**
   * @param {Object} elements - UI要素オブジェクト
   * @param {Function} onUpdateCallback - 値変更時のコールバック (シミュレータ連動用)
   */
  constructor(elements, onUpdateCallback) {
    this.elements = elements;
    this.onUpdateCallback = onUpdateCallback;

    // 一般化状態
    this.state = {
      // 基準FOV (FOV 1)
      fov1Type: 'hfov_16_9',
      fov1Value: 103,

      // ターゲットFOV (FOV 2)
      targetInputMode: 'zoom', // 'zoom' (倍率指定) または 'direct' (角度直接指定)
      fov2Type: 'hfov_16_9',
      fov2Value: 53.13,
      zoomMultiplier: 2.0,

      // アスペクト比
      aspectRatio: '16:9',

      // 感度入力
      sensInputMode: 'cm360',  // 'cm360' または 'dpi_sens'
      baseCm360: 34.63,
      dpi: 800,
      sensitivity: 1.5,
      yaw: 0.022,

      // モニターディスタンス
      mdPercent: 75,
      mdMode: 'horizontal' // 'horizontal' (MDH) または 'vertical' (MDV)
    };

    this.initEventListeners();
    this.calculateAndRender();
  }

  initEventListeners() {
    const el = this.elements;

    // FOV 1 タイプ & 値
    if (el.fov1TypeSelect) {
      el.fov1TypeSelect.addEventListener('change', (e) => {
        this.state.fov1Type = e.target.value;
        this.calculateAndRender();
      });
    }

    if (el.fov1Input) {
      el.fov1Input.addEventListener('input', (e) => {
        this.state.fov1Value = parseFloat(e.target.value) || 90;
        this.calculateAndRender();
      });
    }

    // FOV 2 入力モード (倍率 vs 角度直接)
    if (el.targetModeRadios) {
      el.targetModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.state.targetInputMode = e.target.value;
            this.toggleTargetInputVisibility();
            this.calculateAndRender();
          }
        });
      });
    }

    if (el.zoomInput) {
      el.zoomInput.addEventListener('input', (e) => {
        this.state.zoomMultiplier = parseFloat(e.target.value) || 1.0;
        this.calculateAndRender();
      });
    }

    if (el.fov2Input) {
      el.fov2Input.addEventListener('input', (e) => {
        this.state.fov2Value = parseFloat(e.target.value) || 50;
        this.calculateAndRender();
      });
    }

    // 感度入力
    if (el.cm360Input) {
      el.cm360Input.addEventListener('input', (e) => {
        this.state.baseCm360 = parseFloat(e.target.value) || 30;
        this.calculateAndRender();
      });
    }

    // MD% プリセットボタン & 同期ヘルパー
    const mdPresetBtns = document.querySelectorAll('#tab-calculator .md-preset-btn, #tab-calculator .chip-btn[data-md]');
    const syncPresetActive = (val) => {
      mdPresetBtns.forEach(b => {
        const valStr = b.getAttribute('data-md');
        if (valStr === 'inf') {
          if (!isFinite(val) || val >= 9999) b.classList.add('active');
          else b.classList.remove('active');
        } else {
          const pVal = parseFloat(valStr);
          if (isFinite(val) && Math.abs(val - pVal) < 0.1) b.classList.add('active');
          else b.classList.remove('active');
        }
      });
    };

    // MD% スライダー & 数値入力
    if (el.mdSlider) {
      el.mdSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.state.mdPercent = val;
        if (el.mdNumberInput) el.mdNumberInput.value = val;
        syncPresetActive(val);
        this.calculateAndRender();
      });
    }

    if (el.mdNumberInput) {
      el.mdNumberInput.addEventListener('input', (e) => {
        const raw = e.target.value.trim();
        let val;
        if (raw === '∞' || raw.toLowerCase() === 'inf' || raw === '360') {
          val = Infinity;
        } else {
          val = parseFloat(raw);
          if (isNaN(val)) val = 0;
        }
        this.state.mdPercent = val;
        if (el.mdSlider) el.mdSlider.value = isFinite(val) ? Math.min(val, 200) : 200;
        syncPresetActive(val);
        this.calculateAndRender();
      });
    }

    mdPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const valStr = btn.getAttribute('data-md');
        const val = valStr === 'inf' ? Infinity : parseFloat(valStr);
        this.state.mdPercent = val;
        if (el.mdNumberInput) el.mdNumberInput.value = isFinite(val) ? val : '∞';
        if (el.mdSlider) el.mdSlider.value = isFinite(val) ? Math.min(val, 200) : 200;
        syncPresetActive(val);
        this.calculateAndRender();
      });
    });

    // MDH vs MDV
    if (el.mdModeRadios) {
      el.mdModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.state.mdMode = e.target.value;
            this.calculateAndRender();
          }
        });
      });
    }

    // アスペクト比切り替えボタン (Tab 3内)
    const aspectBtns = document.querySelectorAll('#tab-calculator .aspect-btn-sm');
    aspectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        aspectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.aspectRatio = btn.getAttribute('data-aspect') || '16:9';
        this.calculateAndRender();
      });
    });
  }

  toggleTargetInputVisibility() {
    const isZoom = this.state.targetInputMode === 'zoom';
    if (this.elements.zoomGroup) this.elements.zoomGroup.style.display = isZoom ? 'block' : 'none';
    if (this.elements.directFovGroup) this.elements.directFovGroup.style.display = isZoom ? 'none' : 'block';
  }

  calculateAndRender() {
    const { state, elements: el } = this;

    // 1. 基準FOV (FOV 1) の正規化 (垂直FOVに統一)
    const vFov1 = normalizeToVfov(state.fov1Value, state.fov1Type, state.aspectRatio);
    const hFov1_169 = convertFromVfov(vFov1, 'hfov_16_9', state.aspectRatio);
    const hFov1_43 = convertFromVfov(vFov1, 'hfov_4_3', state.aspectRatio);

    // 2. ターゲットFOV (FOV 2) の決定
    let vFov2;
    if (state.targetInputMode === 'zoom') {
      // ズーム倍率から計算: tan(vFov2 / 2) = (1 / M) * tan(vFov1 / 2)
      vFov2 = calculateAdsFovFromZoom(vFov1, state.zoomMultiplier);
    } else {
      vFov2 = normalizeToVfov(state.fov2Value, state.fov2Type, state.aspectRatio);
      state.zoomMultiplier = calculateZoomFromFovs(vFov1, vFov2);
    }

    const hFov2_169 = convertFromVfov(vFov2, 'hfov_16_9', state.aspectRatio);
    const hFov2_43 = convertFromVfov(vFov2, 'hfov_4_3', state.aspectRatio);

    // 3. モニターディスタンス (MD%) 感度比率 (Ratio = S2 / S1) の計算
    // 水平画角を基準として比率を算出
    const sensRatio = calculateMdRatio(
      hFov1_169,
      hFov2_169,
      state.mdPercent,
      state.mdMode,
      state.aspectRatio
    );

    // 4. FOV 2 での振り向き (cm/360)
    const targetCm360 = state.baseCm360 / sensRatio;

    const hFov1_curr = convertFromVfov(vFov1, 'hfov_current', state.aspectRatio);
    const hFov2_curr = convertFromVfov(vFov2, 'hfov_current', state.aspectRatio);

    // 5. UIへの数値反映
    if (el.resultSensRatio) el.resultSensRatio.textContent = sensRatio.toFixed(4);
    if (el.resultTargetCm) el.resultTargetCm.textContent = `${targetCm360.toFixed(2)} cm`;
    if (el.resultZoomDisplay) el.resultZoomDisplay.textContent = `${state.zoomMultiplier.toFixed(3)}x`;

    if (el.fov1NormalizedDisplay) {
      if (state.aspectRatio === '16:9') {
        el.fov1NormalizedDisplay.textContent = `16:9 H: ${hFov1_169.toFixed(1)}° | 4:3 H: ${hFov1_43.toFixed(1)}° | V: ${vFov1.toFixed(1)}°`;
      } else {
        el.fov1NormalizedDisplay.textContent = `${state.aspectRatio} H: ${hFov1_curr.toFixed(1)}° | 16:9 H: ${hFov1_169.toFixed(1)}° | V: ${vFov1.toFixed(1)}°`;
      }
    }
    if (el.fov2NormalizedDisplay) {
      if (state.aspectRatio === '16:9') {
        el.fov2NormalizedDisplay.textContent = `16:9 H: ${hFov2_169.toFixed(1)}° | 4:3 H: ${hFov2_43.toFixed(1)}° | V: ${vFov2.toFixed(1)}°`;
      } else {
        el.fov2NormalizedDisplay.textContent = `${state.aspectRatio} H: ${hFov2_curr.toFixed(1)}° | 16:9 H: ${hFov2_169.toFixed(1)}° | V: ${vFov2.toFixed(1)}°`;
      }
    }

    // 6. 画面各位置へのフリックマウス移動距離 (cm) 比較テーブルの生成
    if (el.flickDistanceTableBody) {
      el.flickDistanceTableBody.innerHTML = '';
      const positions = [
        { label: '中央付近 (10%)', p: 0.1 },
        { label: '近距離 (25%)', p: 0.25 },
        { label: '画面半分 (50%)', p: 0.5 },
        { label: '4:3 画面端 (75%)', p: 0.75 },
        { label: '16:9 画面端 (100%)', p: 1.0 }
      ];

      positions.forEach(pos => {
        const hipDistCm = calculateFlickDistanceCm(pos.p, hFov1_169, state.baseCm360);
        const adsDistCm = calculateFlickDistanceCm(pos.p, hFov2_169, targetCm360);
        const diffCm = adsDistCm - hipDistCm;
        const diffPct = ((adsDistCm - hipDistCm) / hipDistCm) * 100;

        const isExactMatch = Math.abs(diffPct) < 0.1;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${pos.label}</strong></td>
          <td>${hipDistCm.toFixed(2)} cm</td>
          <td><strong style="color: ${isExactMatch ? 'var(--cyan)' : 'var(--text-main)'};">${adsDistCm.toFixed(2)} cm</strong></td>
          <td>
            <span class="highlight" style="color: ${isExactMatch ? '#00ff88' : (diffPct > 0 ? '#ff8800' : '#4facfe')};">
              ${isExactMatch ? '★ 完全一致 (0%)' : `${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}% (${diffCm > 0 ? '+' : ''}${diffCm.toFixed(2)}cm)`}
            </span>
          </td>
        `;
        el.flickDistanceTableBody.appendChild(tr);
      });
    }

    // 7. ブログ数式ステップ解説の更新
    if (el.calcStepBox) {
      el.calcStepBox.innerHTML = generateCalculationSteps(
        hFov1_169,
        hFov2_169,
        state.mdPercent,
        state.mdMode,
        state.aspectRatio
      );
    }

    // 8. 外部コールバック (シミュレータ＆エラーアナライザー連動)
    if (this.onUpdateCallback) {
      this.onUpdateCallback({
        hFov1: hFov1_169,
        vFov1: vFov1,
        hFov2: hFov2_169,
        vFov2: vFov2,
        zoom: state.zoomMultiplier,
        baseCm360: state.baseCm360,
        targetCm360: targetCm360,
        sensRatio: sensRatio,
        mdPercent: state.mdPercent,
        mdMode: state.mdMode
      });
    }
  }
}
