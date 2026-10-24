/**
 * Main Application Controller - FPS FOV & Sensitivity Lab
 * 100vh Full Dashboard Layout with Flat Major Tabs
 */

import { FovSimulator } from './components/fov-simulator.js?v=24';
import { ValorantCalculator } from './components/valorant-calc.js?v=26';
import { ErrorAnalyzer } from './components/error-analyzer.js?v=22';
import { initDocsNav } from './components/docs-nav.js?v=1';
import { degToRad, radToDeg, calculateEffectiveFov, vFovToHfov } from './core/fov.js?v=22';
import { calculateMdRatio } from './core/sensitivity.js?v=22';

document.addEventListener('DOMContentLoaded', () => {
  // 0. テーマ管理 (Dark / Light)
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeToggleIcon = document.getElementById('themeToggleIcon');
  const themeToggleLabel = document.getElementById('themeToggleLabel');

  function updateThemeUI(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fps_fov_theme', theme);

    if (theme === 'light') {
      if (themeToggleIcon) themeToggleIcon.textContent = '🌙';
      if (themeToggleLabel) themeToggleLabel.textContent = 'Dark';
      if (themeToggleBtn) themeToggleBtn.title = 'ダークモードに切り替え';
    } else {
      if (themeToggleIcon) themeToggleIcon.textContent = '☀️';
      if (themeToggleLabel) themeToggleLabel.textContent = 'Light';
      if (themeToggleBtn) themeToggleBtn.title = 'ライトモードに切り替え';
    }
  }

  // 初期テーマ判定: 白系画面の好みを優先し、保存設定がなければ 'light' を適用
  const initialTheme = localStorage.getItem('fps_fov_theme') || 'light';
  updateThemeUI(initialTheme);

  // 1. 大タブナビゲーションの初期化 (5つのフラット大タブ)
  const navBtns = document.querySelectorAll('.header-nav .nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(tab => tab.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = document.getElementById(targetId);
      if (targetTab) {
        targetTab.classList.add('active');
        // タブ切り替え時にCanvas描画サイズを再同期
        setTimeout(() => {
          if (fovSim) {
            fovSim.resizeAll();
            fovSim.render();
          }
          if (errorAnalyzer) {
            errorAnalyzer.resize();
            errorAnalyzer.render();
          }
        }, 30);
      }
    });
  });

  // 2. FOVシミュレーターの初期化 (4画面 + 2俯瞰)
  const canvases = {
    hipA: document.getElementById('canvasHipA'),
    hipB: document.getElementById('canvasHipB'),
    adsHip: document.getElementById('canvasAdsHip'),
    adsZoom: document.getElementById('canvasAdsZoom'),
    topDownHip: document.getElementById('topDownCanvasHip'),
    topDownAds: document.getElementById('topDownCanvasAds')
  };

  const fovSim = new FovSimulator(canvases);

  // 3. エラーアナライザーの初期化
  const errorCanvas = document.getElementById('errorCanvas');
  let errorAnalyzer = null;
  if (errorCanvas) {
    errorAnalyzer = new ErrorAnalyzer(errorCanvas);
  }

  // テーマ切り替えクリックイベント
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      updateThemeUI(newTheme);
      if (fovSim) {
        fovSim.resizeAll();
        fovSim.render();
      }
      if (errorAnalyzer) {
        errorAnalyzer.resize();
        errorAnalyzer.render();
      }
    });
  }

  // 4. 【タブ 1: Hipfire比較】コントロール
  const hipBaseArA = document.getElementById('hipBaseArA');
  const hipBaseArB = document.getElementById('hipBaseArB');
  const sliderFovA = document.getElementById('sliderFovA');
  const sliderFovB = document.getElementById('sliderFovB');
  const numFovA = document.getElementById('numFovA');
  const numFovB = document.getElementById('numFovB');
  const hipActualFovBadgeA = document.getElementById('hipActualFovBadgeA');
  const hipActualFovBadgeB = document.getElementById('hipActualFovBadgeB');
  const badgeFovA = document.getElementById('badgeFovA');
  const badgeFovB = document.getElementById('badgeFovB');
  const statHipSizeRatio = document.getElementById('statHipSizeRatio');
  const statHipAngleDiff = document.getElementById('statHipAngleDiff');

  function updateHipStats() {
    const fovA = fovSim.state.hipFovA;
    const baseArA = fovSim.state.hipBaseArA;
    const fovB = fovSim.state.hipFovB;
    const baseArB = fovSim.state.hipBaseArB;
    const dispAr = fovSim.state.aspectRatio;

    const effA = calculateEffectiveFov(fovA, baseArA, dispAr);
    const effB = calculateEffectiveFov(fovB, baseArB, dispAr);

    if (numFovA && document.activeElement !== numFovA) {
      numFovA.value = Number(fovA).toFixed(2);
    }
    if (sliderFovA) {
      const peggedA = Math.max(55, Math.min(120, fovA));
      if (Number(sliderFovA.value) !== peggedA) {
        sliderFovA.value = peggedA;
      }
    }

    if (numFovB && document.activeElement !== numFovB) {
      numFovB.value = Number(fovB).toFixed(2);
    }
    if (sliderFovB) {
      const peggedB = Math.max(55, Math.min(120, fovB));
      if (Number(sliderFovB.value) !== peggedB) {
        sliderFovB.value = peggedB;
      }
    }

    if (hipActualFovBadgeA) hipActualFovBadgeA.textContent = `実効 ${effA.hFov.toFixed(2)}°`;
    if (hipActualFovBadgeB) hipActualFovBadgeB.textContent = `実効 ${effB.hFov.toFixed(2)}°`;

    if (badgeFovA) badgeFovA.textContent = `実効FOV: ${effA.hFov.toFixed(2)}° (${dispAr}換算)`;
    if (badgeFovB) badgeFovB.textContent = `実効FOV: ${effB.hFov.toFixed(2)}° (${dispAr}換算)`;

    // 標的の見かけのサイズ比 (焦点距離比 = tan(vFovB/2) / tan(vFovA/2))
    const sizeRatio = Math.tan(degToRad(effB.vFov / 2)) / Math.tan(degToRad(effA.vFov / 2));
    if (statHipSizeRatio) statHipSizeRatio.textContent = isFinite(sizeRatio) ? `${sizeRatio.toFixed(2)}x` : '-';

    // 水平索敵角差 (実効 hFOV 差)
    if (statHipAngleDiff) {
      const diff = effB.hFov - effA.hFov;
      statHipAngleDiff.textContent = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}°`;
    }

    // 変換後FOVスタックのリアルタイム更新 (画面 A)
    const vFovA = effA.vFov;
    const hFov43A = vFovToHfov(vFovA, '4:3');
    const hFov169A = vFovToHfov(vFovA, '16:9');
    const convVfovA = document.getElementById('convVfovA');
    const convHfov43A = document.getElementById('convHfov43A');
    const convHfov169A = document.getElementById('convHfov169A');
    if (convVfovA) convVfovA.textContent = `${vFovA.toFixed(2)}°`;
    if (convHfov43A) convHfov43A.textContent = `${hFov43A.toFixed(2)}°`;
    if (convHfov169A) convHfov169A.textContent = `${hFov169A.toFixed(2)}°`;

    // 変換後FOVスタックのリアルタイム更新 (画面 B)
    const vFovB = effB.vFov;
    const hFov43B = vFovToHfov(vFovB, '4:3');
    const hFov169B = vFovToHfov(vFovB, '16:9');
    const convVfovB = document.getElementById('convVfovB');
    const convHfov43B = document.getElementById('convHfov43B');
    const convHfov169B = document.getElementById('convHfov169B');
    if (convVfovB) convVfovB.textContent = `${vFovB.toFixed(2)}°`;
    if (convHfov43B) convHfov43B.textContent = `${hFov43B.toFixed(2)}°`;
    if (convHfov169B) convHfov169B.textContent = `${hFov169B.toFixed(2)}°`;

    // アクティブ表示比率のハイライト
    ['convRowVfovA', 'convRowHfov43A', 'convRowHfov169A', 'convRowVfovB', 'convRowHfov43B', 'convRowHfov169B'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active-ar');
    });
    if (dispAr === '4:3') {
      document.getElementById('convRowHfov43A')?.classList.add('active-ar');
      document.getElementById('convRowHfov43B')?.classList.add('active-ar');
    } else if (dispAr === '16:9') {
      document.getElementById('convRowHfov169A')?.classList.add('active-ar');
      document.getElementById('convRowHfov169B')?.classList.add('active-ar');
    } else if (dispAr === '1:1' || dispAr === 'vfov') {
      document.getElementById('convRowVfovA')?.classList.add('active-ar');
      document.getElementById('convRowVfovB')?.classList.add('active-ar');
    }

    // === [3段目] MD%感度変換 (Sensitivity Converter by Monitordistance) ===
    const hipMdInput = document.getElementById('hipMdInput');
    const hipHurimukiMult = document.getElementById('hipHurimukiMult');
    const hipSensMult = document.getElementById('hipSensMult');
    const hipMdBadge = document.getElementById('hipMdBadge');
    const hipHurimukiEx = document.getElementById('hipHurimukiEx');
    const hipSensEx = document.getElementById('hipSensEx');

    const mdPercent = hipMdInput ? (parseFloat(hipMdInput.value) || 0) : 100;
    const sensRatio = calculateMdRatio(effA.hFov, effB.hFov, mdPercent, 'horizontal', dispAr);
    const hurimukiRatio = (sensRatio > 0 && isFinite(sensRatio)) ? (1 / sensRatio) : 1.0;

    if (hipHurimukiMult) hipHurimukiMult.textContent = `${hurimukiRatio.toFixed(3)}x`;
    if (hipSensMult) hipSensMult.textContent = `${sensRatio.toFixed(3)}x`;

    const exHurimuki = (20 * hurimukiRatio).toFixed(2);
    const exSens = sensRatio.toFixed(3);
    if (hipHurimukiEx) hipHurimukiEx.textContent = `（例：20cm → ${exHurimuki} cm）`;
    if (hipSensEx) hipSensEx.textContent = `（例：1.0 → ${exSens}）`;

    if (hipMdBadge) {
      if (mdPercent <= 0) hipMdBadge.textContent = '焦点距離 (0%)';
      else if (Math.abs(mdPercent - 75) < 0.1) hipMdBadge.textContent = '4:3画面端 (75%)';
      else if (Math.abs(mdPercent - 100) < 0.1) hipMdBadge.textContent = '16:9画面端 (100%)';
      else if (Math.abs(mdPercent - 133.333) < 0.5) hipMdBadge.textContent = '統一照準 (133%)';
      else if (mdPercent >= 9999) hipMdBadge.textContent = '360°回転一致';
      else hipMdBadge.textContent = `MD ${mdPercent}% 一致`;
    }
  }

  if (hipBaseArA) {
    hipBaseArA.addEventListener('change', (e) => {
      fovSim.updateState({ hipBaseArA: e.target.value });
      updateHipStats();
    });
  }

  if (hipBaseArB) {
    hipBaseArB.addEventListener('change', (e) => {
      fovSim.updateState({ hipBaseArB: e.target.value });
      updateHipStats();
    });
  }

  // 画面 A: スライダー ＆ 数値入力の双方向バインディング (スライダー55〜120、入力1〜180)
  if (sliderFovA && numFovA) {
    const syncFromSliderA = () => {
      const val = parseFloat(sliderFovA.value);
      numFovA.value = val.toFixed(2);
      fovSim.updateState({ hipFovA: val });
      updateHipStats();
    };

    sliderFovA.addEventListener('input', syncFromSliderA);
    sliderFovA.addEventListener('pointerdown', syncFromSliderA);

    numFovA.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        val = Math.max(1, Math.min(180, val));
        sliderFovA.value = Math.max(55, Math.min(120, val));
        fovSim.updateState({ hipFovA: val });
        updateHipStats();
      }
    });

    numFovA.addEventListener('blur', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val)) val = 90.0;
      val = Math.max(1, Math.min(180, val));
      numFovA.value = val.toFixed(2);
      sliderFovA.value = Math.max(55, Math.min(120, val));
      fovSim.updateState({ hipFovA: val });
      updateHipStats();
    });
  }

  // 画面 B: スライダー ＆ 数値入力の双方向バインディング (スライダー55〜120、入力1〜180)
  if (sliderFovB && numFovB) {
    const syncFromSliderB = () => {
      const val = parseFloat(sliderFovB.value);
      numFovB.value = val.toFixed(2);
      fovSim.updateState({ hipFovB: val });
      updateHipStats();
    };

    sliderFovB.addEventListener('input', syncFromSliderB);
    sliderFovB.addEventListener('pointerdown', syncFromSliderB);

    numFovB.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        val = Math.max(1, Math.min(180, val));
        sliderFovB.value = Math.max(55, Math.min(120, val));
        fovSim.updateState({ hipFovB: val });
        updateHipStats();
      }
    });

    numFovB.addEventListener('blur', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val)) val = 103.0;
      val = Math.max(1, Math.min(180, val));
      numFovB.value = val.toFixed(2);
      sliderFovB.value = Math.max(55, Math.min(120, val));
      fovSim.updateState({ hipFovB: val });
      updateHipStats();
    });
  }

  // 4.5 【タブ 1: MD%感度変換】コントロール
  const hipMdInput = document.getElementById('hipMdInput');
  const hipMdSlider = document.getElementById('hipMdSlider');

  hipMdSlider?.addEventListener('input', () => {
    const val = parseFloat(hipMdSlider.value);
    if (hipMdInput) hipMdInput.value = val;
    fovSim.updateState({ hipMdPercent: val });
    updateHipStats();
  });

  hipMdInput?.addEventListener('input', () => {
    const val = parseFloat(hipMdInput.value) || 0;
    if (hipMdSlider) hipMdSlider.value = Math.min(200, Math.max(0, val));
    fovSim.updateState({ hipMdPercent: val });
    updateHipStats();
  });

  // 5. 【タブ 2: ADS比較】コントロール
  const adsHipBaseAr = document.getElementById('adsHipBaseAr');
  const sliderBaseHipFov = document.getElementById('sliderBaseHipFov');
  const numBaseHipFov = document.getElementById('numBaseHipFov');
  const adsCalcMode = document.getElementById('adsCalcMode');
  const adsPresetsContainer = document.getElementById('adsPresetsContainer');
  const sliderAdsZoom = document.getElementById('sliderAdsZoom');
  const numAdsZoom = document.getElementById('numAdsZoom');
  const adsHipActualBadge = document.getElementById('adsHipActualBadge');
  const adsZoomActualBadge = document.getElementById('adsZoomActualBadge');
  const badgeAdsHip = document.getElementById('badgeAdsHip');
  const badgeAdsZoom = document.getElementById('badgeAdsZoom');
  const statAdsZoomRatio = document.getElementById('statAdsZoomRatio');
  const statAdsApparentRatio = document.getElementById('statAdsApparentRatio');
  const statAdsFovVal = document.getElementById('statAdsFovVal');
  const adsModeDesc = document.getElementById('adsModeDesc');

  const ADS_PRESETS = {
    optical: [
      { label: '1.0x', val: 1.01, title: '1.0x (画面等倍)' },
      { label: '1.25x', val: 1.25, title: '1.25x' },
      { label: '1.5x', val: 1.5, title: '1.5x' },
      { label: '2.0x', val: 2.0, title: '2.0x' },
      { label: '3.0x', val: 3.0, title: '3.0x' },
      { label: '4.0x', val: 4.0, title: '4.0x' },
      { label: '6.0x', val: 6.0, title: '6.0x' }
    ],
    valorant: [
      { label: '1.15x', val: 1.15, title: '1.15x (SMG / Stinger)' },
      { label: '1.25x', val: 1.25, title: '1.25x (AR1 / Ghost)' },
      { label: '1.5x', val: 1.5, title: '1.5x (Guardian)' },
      { label: '2.0x', val: 2.0, title: '2.0x (AR2 / Bulldog)' },
      { label: '2.5x', val: 2.5, title: '2.5x (Marshal / Operator 1)' },
      { label: '3.5x', val: 3.5, title: '3.5x (Marshal Zoom)' },
      { label: '5.0x', val: 5.0, title: '5.0x (Operator 2)' }
    ],
    apex: [
      { label: '1.0x', val: 1.0, title: '1.0x (等倍 / HCOGクラシック)' },
      { label: '1.25x', val: 1.25, title: '1.25x (アイアンサイト)' },
      { label: '1.5x', val: 1.5, title: '1.5x (アイアンサイト)' },
      { label: '2.0x', val: 2.0, title: '2.0x (Bruiser 2x HCOG)' },
      { label: '3.0x', val: 3.0, title: '3.0x (Ranger 3x HCOG)' },
      { label: '4.0x', val: 4.0, title: '4.0x (2-4x可変 AOG)' },
      { label: '6.0x', val: 6.0, title: '6.0x (スナイパー)' },
      { label: '8.0x', val: 8.0, title: '8.0x (4-8x可変スナイパー)' },
      { label: '10x', val: 10.0, title: '10.0x (クレーバー 4-10x)' }
    ],
    hfov_4_3: [
      { label: '1.25x', val: 1.25, title: '1.25x' },
      { label: '1.5x', val: 1.5, title: '1.5x' },
      { label: '2.0x', val: 2.0, title: '2.0x' },
      { label: '3.0x', val: 3.0, title: '3.0x' },
      { label: '4.0x', val: 4.0, title: '4.0x' },
      { label: '6.0x', val: 6.0, title: '6.0x' }
    ],
    vfov: [
      { label: '1.25x', val: 1.25, title: '1.25x' },
      { label: '1.5x', val: 1.5, title: '1.5x' },
      { label: '2.0x', val: 2.0, title: '2.0x' },
      { label: '3.0x', val: 3.0, title: '3.0x' },
      { label: '4.0x', val: 4.0, title: '4.0x' },
      { label: '6.0x', val: 6.0, title: '6.0x' }
    ]
  };

  function renderAdsPresets() {
    if (!adsPresetsContainer) return;
    const mode = fovSim.state.adsCalcMode || 'optical';
    const presets = ADS_PRESETS[mode] || ADS_PRESETS.optical;
    adsPresetsContainer.innerHTML = '';

    presets.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'chip-btn';
      if (Math.abs(Number(fovSim.state.adsZoom) - p.val) < 0.01) {
        btn.classList.add('active');
      }
      btn.textContent = p.label;
      if (p.title) btn.title = p.title;
      btn.dataset.zoom = p.val;
      btn.addEventListener('click', () => {
        adsPresetsContainer.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (sliderAdsZoom) sliderAdsZoom.value = p.val;
        if (numAdsZoom) numAdsZoom.value = p.val.toFixed(2);
        fovSim.updateState({ adsZoom: p.val });
        updateAdsLabels();
      });
      adsPresetsContainer.appendChild(btn);
    });
  }

  function updateAdsLabels() {
    const hip = fovSim.state.baseHipFov;
    const zoom = fovSim.state.adsZoom;
    const dispAr = fovSim.state.aspectRatio;
    const mode = fovSim.state.adsCalcMode || 'optical';

    const adsInfo = fovSim.calcAdsFovInfo();
    const hipEff = adsInfo.hipEff;
    const adsVfov = adsInfo.vFov;
    const adsHfov = adsInfo.hFov;
    const apparentSizeRatio = adsInfo.apparentSizeRatio;

    if (numBaseHipFov && document.activeElement !== numBaseHipFov) {
      numBaseHipFov.value = Number(hip).toFixed(2);
    }
    if (sliderBaseHipFov) {
      const peggedHip = Math.max(55, Math.min(120, hip));
      if (Number(sliderBaseHipFov.value) !== peggedHip) {
        sliderBaseHipFov.value = peggedHip;
      }
    }

    if (numAdsZoom && document.activeElement !== numAdsZoom) {
      numAdsZoom.value = Number(zoom).toFixed(2);
    }
    if (sliderAdsZoom && Number(sliderAdsZoom.value) !== Number(zoom)) {
      sliderAdsZoom.value = zoom;
    }

    if (adsCalcMode && adsCalcMode.value !== mode) {
      adsCalcMode.value = mode;
    }

    // プリセットチップのactive状態同期
    if (adsPresetsContainer) {
      adsPresetsContainer.querySelectorAll('.chip-btn').forEach(btn => {
        const val = parseFloat(btn.dataset.zoom);
        if (Math.abs(val - Number(zoom)) < 0.01) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    const modeNames = {
      optical: '光学倍率',
      valorant: '16:9hfov',
      hfov_4_3: '4:3hfov',
      vfov: 'vfov',
      apex: 'Apex式'
    };
    const modeName = modeNames[mode] || 'ADS';

    if (adsHipActualBadge) adsHipActualBadge.textContent = `実効 ${hipEff.hFov.toFixed(2)}°`;
    if (adsZoomActualBadge) adsZoomActualBadge.textContent = `実効 ${adsHfov.toFixed(2)}°`;
    if (badgeAdsHip) badgeAdsHip.textContent = `実効FOV: ${hipEff.hFov.toFixed(2)}° (${dispAr}換算)`;
    if (badgeAdsZoom) badgeAdsZoom.textContent = `実効FOV: ${adsHfov.toFixed(2)}° (${zoom.toFixed(2)}x [${modeName}])`;

    if (statAdsZoomRatio) statAdsZoomRatio.textContent = `${zoom.toFixed(2)}x`;
    if (statAdsApparentRatio) statAdsApparentRatio.textContent = `${apparentSizeRatio.toFixed(2)}x`;
    if (statAdsFovVal) statAdsFovVal.textContent = `${adsHfov.toFixed(1)}°`;

    // 方式ごとの解説バナー (ユーザー要望により一旦非表示)
    if (adsModeDesc) {
      adsModeDesc.style.display = 'none';
      adsModeDesc.innerHTML = '';
    }

    // 変換後FOVスタックのリアルタイム更新 (Hipfire)
    const adsHipVfov = hipEff.vFov;
    const adsHipHfov43 = vFovToHfov(adsHipVfov, '4:3');
    const adsHipHfov169 = vFovToHfov(adsHipVfov, '16:9');
    const convVfovAdsHip = document.getElementById('convVfovAdsHip');
    const convHfov43AdsHip = document.getElementById('convHfov43AdsHip');
    const convHfov169AdsHip = document.getElementById('convHfov169AdsHip');
    if (convVfovAdsHip) convVfovAdsHip.textContent = `${adsHipVfov.toFixed(2)}°`;
    if (convHfov43AdsHip) convHfov43AdsHip.textContent = `${adsHipHfov43.toFixed(2)}°`;
    if (convHfov169AdsHip) convHfov169AdsHip.textContent = `${adsHipHfov169.toFixed(2)}°`;

    // 変換後FOVスタックのリアルタイム更新 (ADSズーム)
    const adsZoomHfov43 = vFovToHfov(adsVfov, '4:3');
    const adsZoomHfov169 = vFovToHfov(adsVfov, '16:9');
    const convVfovAdsZoom = document.getElementById('convVfovAdsZoom');
    const convHfov43AdsZoom = document.getElementById('convHfov43AdsZoom');
    const convHfov169AdsZoom = document.getElementById('convHfov169AdsZoom');
    if (convVfovAdsZoom) convVfovAdsZoom.textContent = `${adsVfov.toFixed(2)}°`;
    if (convHfov43AdsZoom) convHfov43AdsZoom.textContent = `${adsZoomHfov43.toFixed(2)}°`;
    if (convHfov169AdsZoom) convHfov169AdsZoom.textContent = `${adsZoomHfov169.toFixed(2)}°`;

    // アクティブ表示比率のハイライト
    ['convRowVfovAdsHip', 'convRowHfov43AdsHip', 'convRowHfov169AdsHip', 'convRowVfovAdsZoom', 'convRowHfov43AdsZoom', 'convRowHfov169AdsZoom'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active-ar');
    });
    if (dispAr === '4:3') {
      document.getElementById('convRowHfov43AdsHip')?.classList.add('active-ar');
      document.getElementById('convRowHfov43AdsZoom')?.classList.add('active-ar');
    } else if (dispAr === '16:9') {
      document.getElementById('convRowHfov169AdsHip')?.classList.add('active-ar');
      document.getElementById('convRowHfov169AdsZoom')?.classList.add('active-ar');
    } else if (dispAr === '1:1' || dispAr === 'vfov') {
      document.getElementById('convRowVfovAdsHip')?.classList.add('active-ar');
      document.getElementById('convRowVfovAdsZoom')?.classList.add('active-ar');
    }

    // === [3段目] ADS MD%感度変換 (Sensitivity Converter by Monitordistance - ADS) ===
    const adsGameMdInput = document.getElementById('adsGameMdInput');
    const adsTargetMdInput = document.getElementById('adsTargetMdInput');
    const adsGameMdHint = document.getElementById('adsGameMdHint');
    const adsMdBadge = document.getElementById('adsMdBadge');
    const adsSensMult = document.getElementById('adsSensMult');
    const adsHurimukiMult = document.getElementById('adsHurimukiMult');
    const adsHurimukiEx = document.getElementById('adsHurimukiEx');

    const gameMd = adsGameMdInput ? (parseFloat(adsGameMdInput.value) || 0) : 0;
    const targetMd = adsTargetMdInput ? (parseFloat(adsTargetMdInput.value) || 0) : 100;

    const rGame = calculateMdRatio(hipEff.hFov, adsHfov, gameMd, 'horizontal', dispAr);
    const rTarget = calculateMdRatio(hipEff.hFov, adsHfov, targetMd, 'horizontal', dispAr);

    const adsMultiplier = (rGame > 0 && isFinite(rGame) && isFinite(rTarget)) ? (rTarget / rGame) : 1.0;
    const hurimukiRatio = (rTarget > 0 && isFinite(rTarget)) ? (1 / rTarget) : 1.0;

    if (adsSensMult) adsSensMult.textContent = `${adsMultiplier.toFixed(3)}x`;

    if (adsMdBadge) {
      if (targetMd <= 0) adsMdBadge.textContent = '焦点距離 (0%)';
      else if (Math.abs(targetMd - 75) < 0.1) adsMdBadge.textContent = '4:3端 (75%)';
      else if (Math.abs(targetMd - 100) < 0.1) adsMdBadge.textContent = '16:9端 (100%)';
      else if (Math.abs(targetMd - 133.333) < 0.5) adsMdBadge.textContent = '統一照準 (133%)';
      else if (targetMd >= 9999) adsMdBadge.textContent = '360°回転一致';
      else adsMdBadge.textContent = `MD ${targetMd}%`;
    }

    const adsGameMdSlider = document.getElementById('adsGameMdSlider');
    const adsTargetMdSlider = document.getElementById('adsTargetMdSlider');
    if (adsGameMdSlider && document.activeElement !== adsGameMdSlider) {
      adsGameMdSlider.value = Math.min(200, Math.max(0, gameMd));
    }
    if (adsTargetMdSlider && document.activeElement !== adsTargetMdSlider) {
      adsTargetMdSlider.value = Math.min(200, Math.max(0, targetMd));
    }

    fovSim.state.adsTargetMdPercent = targetMd;

    if (errorAnalyzer) {
      errorAnalyzer.updateState({
        fov1: hipEff.hFov,
        fov2: adsHfov,
        activeMdPercent: targetMd
      });
    }
  }

  if (adsHipBaseAr) {
    adsHipBaseAr.addEventListener('change', (e) => {
      fovSim.updateState({ baseHipBaseAr: e.target.value });
      updateAdsLabels();
    });
  }

  if (adsCalcMode) {
    adsCalcMode.addEventListener('change', (e) => {
      fovSim.updateState({ adsCalcMode: e.target.value });
      renderAdsPresets();
      updateAdsLabels();
    });
  }

  // Hipfire: スライダー ＆ 数値入力の双方向バインディング (スライダー55〜120、入力1〜180)
  if (sliderBaseHipFov && numBaseHipFov) {
    const syncFromSliderHip = () => {
      const val = parseFloat(sliderBaseHipFov.value);
      numBaseHipFov.value = val.toFixed(2);
      fovSim.updateState({ baseHipFov: val });
      updateAdsLabels();
    };

    sliderBaseHipFov.addEventListener('input', syncFromSliderHip);
    sliderBaseHipFov.addEventListener('pointerdown', syncFromSliderHip);

    numBaseHipFov.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        val = Math.max(1, Math.min(180, val));
        sliderBaseHipFov.value = Math.max(55, Math.min(120, val));
        fovSim.updateState({ baseHipFov: val });
        updateAdsLabels();
      }
    });

    numBaseHipFov.addEventListener('blur', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val)) val = 103.0;
      val = Math.max(1, Math.min(180, val));
      numBaseHipFov.value = val.toFixed(2);
      sliderBaseHipFov.value = Math.max(55, Math.min(120, val));
      fovSim.updateState({ baseHipFov: val });
      updateAdsLabels();
    });
  }

  // ADSズーム: スライダー ＆ 数値入力の双方向バインディング (1.0〜20.0, 小数点2桁)
  if (sliderAdsZoom && numAdsZoom) {
    sliderAdsZoom.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      numAdsZoom.value = val.toFixed(2);
      fovSim.updateState({ adsZoom: val });
      updateAdsLabels();
    });

    numAdsZoom.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        val = Math.max(1.0, Math.min(20.0, val));
        sliderAdsZoom.value = val;
        fovSim.updateState({ adsZoom: val });
        updateAdsLabels();
      }
    });

    numAdsZoom.addEventListener('blur', (e) => {
      let val = parseFloat(e.target.value);
      if (isNaN(val)) val = 2.0;
      val = Math.max(1.0, Math.min(20.0, val));
      numAdsZoom.value = val.toFixed(2);
      sliderAdsZoom.value = val;
      fovSim.updateState({ adsZoom: val });
      updateAdsLabels();
    });
  }

  // 俯瞰画面ドラッグでの距離変更同期コールバック
  fovSim.onDistanceChange = (d) => {
    const topDownDistHip = document.getElementById('topDownDistHip');
    const topDownDistAds = document.getElementById('topDownDistAds');
    const distText = (typeof d === 'number' && d % 1 !== 0) ? `${d.toFixed(1)}m` : `${d}m`;
    if (topDownDistHip) topDownDistHip.textContent = distText;
    if (topDownDistAds) topDownDistAds.textContent = distText;
  };

  // 初期プリセットの生成
  renderAdsPresets();

  // 5.5 【タブ 2: ADS MD%感度変換】コントロール
  const adsGameMdInput = document.getElementById('adsGameMdInput');
  const adsGameMdSlider = document.getElementById('adsGameMdSlider');
  const adsTargetMdInput = document.getElementById('adsTargetMdInput');
  const adsTargetMdSlider = document.getElementById('adsTargetMdSlider');

  adsGameMdSlider?.addEventListener('input', () => {
    const val = parseFloat(adsGameMdSlider.value);
    if (adsGameMdInput) adsGameMdInput.value = val;
    updateAdsLabels();
  });

  adsGameMdInput?.addEventListener('input', () => {
    const val = parseFloat(adsGameMdInput.value) || 0;
    if (adsGameMdSlider) adsGameMdSlider.value = Math.min(200, Math.max(0, val));
    updateAdsLabels();
  });

  adsTargetMdSlider?.addEventListener('input', () => {
    const val = parseFloat(adsTargetMdSlider.value);
    if (adsTargetMdInput) adsTargetMdInput.value = val;
    fovSim.updateState({ adsTargetMdPercent: val });
    updateAdsLabels();
  });

  adsTargetMdInput?.addEventListener('input', () => {
    const val = parseFloat(adsTargetMdInput.value) || 0;
    if (adsTargetMdSlider) adsTargetMdSlider.value = Math.min(200, Math.max(0, val));
    fovSim.updateState({ adsTargetMdPercent: val });
    updateAdsLabels();
  });


  // 6. アスペクト比ボタングループの全同期
  const aspectBtns = document.querySelectorAll('.aspect-btn-sm');
  aspectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const ar = btn.getAttribute('data-aspect');
      aspectBtns.forEach(b => {
        if (b.getAttribute('data-aspect') === ar) b.classList.add('active');
        else b.classList.remove('active');
      });
      fovSim.updateState({ aspectRatio: ar });
      updateHipStats();
      updateAdsLabels();
    });
  });

  // 7. VALORANT専用 最適化計算機の初期化
  const valoCalc = new ValorantCalculator();

  // 初期化実行
  updateHipStats();
  updateAdsLabels();
  fovSim.resizeAll();
  fovSim.render();

  // 8. ドキュメント目次ナビゲーション初期化
  initDocsNav();

  console.log("FPS FOV & Sensitivity Lab 100vh Dashboard ready.");
});
