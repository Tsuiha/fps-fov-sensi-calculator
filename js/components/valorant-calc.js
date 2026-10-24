/**
 * VALORANT Dedicated Sensitivity & Scope Optimizer
 * 順引き (現状設定診断) ＆ 逆引き (目標MD%からの設定算出)
 * 100vh ノースクロール ＆ 左右50:50分割
 * 「感度：照準」「ADS感度マルチプライヤー (<2.5x)」「スコープ感度倍率 (>=2.5x)」
 */

export const VALORANT_SCOPES = [
  { id: 'smg_lmg', name: 'SMG / LMG', zoom: 1.15, type: 'ads', category: 'SMG/LMG', typeLabel: 'ADS' },
  { id: 'vandal_phantom', name: 'Vandal/Phantom', zoom: 1.25, type: 'ads', category: 'AR', typeLabel: 'ADS' },
  { id: 'guardian', name: 'Guardian', zoom: 1.50, type: 'ads', category: 'DMR', typeLabel: 'ADS' },
  { id: 'warden', name: 'Warden', zoom: 2.00, type: 'ads', category: 'Rifle', typeLabel: 'ADS' },
  { id: 'operator_1', name: 'Operator 1', zoom: 2.50, type: 'scope', category: 'Sniper', typeLabel: 'スコープ' },
  { id: 'marshal', name: 'Marshal / Outlaw', zoom: 3.50, type: 'scope', category: 'Sniper', typeLabel: 'スコープ' },
  { id: 'operator_2', name: 'Operator 2', zoom: 5.00, type: 'scope', category: 'Sniper', typeLabel: 'スコープ' }
];

export const VALORANT_CONSTANTS = {
  HFOV_HIP: 103.0, // 16:9 水平画角 (固定)
  YAW: 0.07,       // deg per count
  CM_360_FACTOR: 13062.857142857,
  HURIMUKI_FACTOR: 6531.428571429
};

/**
 * 目標MD%におけるゲーム内感度倍率 (ADS感度マルチプライヤー または スコープ感度倍率) を算出
 * VALORANTのゲーム内仕様 (Tsuiha式):
 * gameMD = 1.0 (MD 100%基準)
 * Mult = zoom * [ atan(myMD * tan(radAds)) / atan(myMD * tan(radHip)) ]
 * (※ myMD = 100% のとき Mult = 1.000、myMD = 0% のとき Mult = zoom * tan(radAds)/tan(radHip))
 */
export function getMultForMd(zoom, mdPercent) {
  if (Math.abs(mdPercent - 100.0) < 1e-5) {
    return 1.0;
  }
  const hipFov = VALORANT_CONSTANTS.HFOV_HIP;
  const adsFov = hipFov / zoom;
  const radHip = (hipFov * Math.PI) / 360.0;
  const radAds = (adsFov * Math.PI) / 360.0;
  
  const md0Mult = zoom * (Math.tan(radAds) / Math.tan(radHip));
  if (mdPercent < 0.0) {
    // 負のMD%: MD 0%を基準に下回る分を算出
    const scaleSpan = 1.0 - md0Mult;
    return Math.max(0.01, md0Mult + (mdPercent / 100.0) * scaleSpan);
  }
  if (mdPercent === 0.0) {
    return md0Mult;
  }
  const c = mdPercent / 100.0;
  const atanHip = Math.atan(c * Math.tan(radHip));
  const atanAds = Math.atan(c * Math.tan(radAds));
  return zoom * (atanAds / atanHip);
}

/**
 * ゲーム内感度倍率 (mult) から実効MD%を逆算
 * mult = 1.000 のとき MD 100.0%
 * mult < MD 0% のとき 負のパーセンテージを算出
 */
export function solveMdForMult(zoom, mult) {
  if (Math.abs(mult - 1.0) < 1e-5) {
    return 100.0;
  }
  const hipFov = VALORANT_CONSTANTS.HFOV_HIP;
  const adsFov = hipFov / zoom;
  const radHip = (hipFov * Math.PI) / 360.0;
  const radAds = (adsFov * Math.PI) / 360.0;
  
  const target = mult / zoom;
  const md0Ratio = Math.tan(radAds) / Math.tan(radHip);
  const base100Ratio = 1.0 / zoom;
  
  if (Math.abs(target - md0Ratio) < 5e-4) {
    return 0.0;
  }
  
  // MD 0% (クロスヘア1:1一致) を下回る場合の負の値算出
  if (target < md0Ratio) {
    const scaleSpan = base100Ratio - md0Ratio;
    return scaleSpan > 0 ? ((target - md0Ratio) / scaleSpan) * 100.0 : 0.0;
  }
  
  let low = 0.0;
  let high = 3.0; // 最大300%まで探索
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2.0;
    const val = Math.atan(mid * Math.tan(radAds)) / Math.atan(mid * Math.tan(radHip));
    if (val < target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return ((low + high) / 2.0) * 100.0;
}

export class ValorantCalculator {
  constructor() {
    this.dom = {};
    this.initElements();
    if (!this.dom.tab) return;
    this.bindEvents();
    this.updateForward();
    this.updateReverse();
  }

  initElements() {
    this.dom = {
      tab: document.getElementById('tab-valorant'),

      // 順引き inputs
      fwdDpi: document.getElementById('valoFwdDpi'),
      fwdSens: document.getElementById('valoFwdSens'),
      fwdSensNum: document.getElementById('valoFwdSensNum'),
      
      // ADS感度マルチプライヤー (<2.5x)
      fwdAdsMult: document.getElementById('valoFwdAdsMult'),
      fwdAdsMultNum: document.getElementById('valoFwdAdsMultNum'),

      // スコープ感度倍率 (>=2.5x)
      fwdScopeMult: document.getElementById('valoFwdScopeMult'),
      fwdScopeMultNum: document.getElementById('valoFwdScopeMultNum'),

      fwdDpiBtns: document.querySelectorAll('.valo-fwd-dpi-btn'),

      // 順引き stats badge
      fwdEdpi: document.getElementById('valoFwdEdpi'),
      fwdHurimuki: document.getElementById('valoFwdHurimuki'),
      fwdCm360: document.getElementById('valoFwdCm360'),

      // 順引き table body
      fwdTableBody: document.getElementById('valoFwdTableBody'),
      btnSendToReverse: document.getElementById('valoBtnSendToReverse'),

      // 逆引き inputs
      revDpi: document.getElementById('valoRevDpi'),
      revDpiBtns: document.querySelectorAll('.valo-rev-dpi-btn'),
      revTargetHurimuki: document.getElementById('valoRevTargetHurimuki'),
      revTargetHurimukiNum: document.getElementById('valoRevTargetHurimukiNum'),
      revTargetEdpi: document.getElementById('valoRevTargetEdpi'),

      // 基準スコープ感度倍率(SR)
      revSrScope: document.getElementById('valoRevSrScope'),
      revSrMd: document.getElementById('valoRevSrMd'),
      revSrMdNum: document.getElementById('valoRevSrMdNum'),
      revSrMdBtns: document.querySelectorAll('.valo-rev-sr-md-btn'),

      // 基準ADS感度マルチプライヤー(SMG, AR)
      revAdsScope: document.getElementById('valoRevAdsScope'),
      revAdsMd: document.getElementById('valoRevAdsMd'),
      revAdsMdNum: document.getElementById('valoRevAdsMdNum'),
      revAdsMdBtns: document.querySelectorAll('.valo-rev-ads-md-btn'),

      // 逆引き 推奨設定出力
      revRecScopeMult: document.getElementById('valoRevRecScopeMult'),
      revRecAdsMult: document.getElementById('valoRevRecAdsMult'),
      btnCopySens: document.getElementById('valoBtnCopySens'),
      btnCopyScopeMult: document.getElementById('valoBtnCopyScopeMult'),
      btnCopyAdsMult: document.getElementById('valoBtnCopyAdsMult'),
      copyFeedbackSens: document.getElementById('valoCopyFeedbackSens'),
      copyFeedbackScope: document.getElementById('valoCopyFeedbackScope'),
      copyFeedbackAds: document.getElementById('valoCopyFeedbackAds'),

      // 各DPI別「感度：照準」
      revSens400: document.getElementById('valoRevSens400'),
      revSens800: document.getElementById('valoRevSens800'),
      revSens1600: document.getElementById('valoRevSens1600'),
      revCustomDpiLabel: document.getElementById('valoRevCustomDpiLabel'),
      revSensCustom: document.getElementById('valoRevSensCustom'),

      // 各倍率の計算結果テーブル（上段と同一形式）
      revTableBody: document.getElementById('valoRevTableBody') || document.getElementById('valoRevScopeImpactList'),
      revScopeImpactList: document.getElementById('valoRevTableBody') || document.getElementById('valoRevScopeImpactList'),
      btnApplyToForward: document.getElementById('valoBtnApplyToForward')
    };
  }

  bindEvents() {
    // === 順引きイベント ===
    // DPI preset buttons
    this.dom.fwdDpiBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.fwdDpiBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.dom.fwdDpi.value = btn.dataset.dpi;
        this.updateForward();
      });
    });

    this.dom.fwdDpi?.addEventListener('input', () => {
      const val = this.dom.fwdDpi.value;
      this.dom.fwdDpiBtns?.forEach(b => {
        b.classList.toggle('active', b.dataset.dpi === val);
      });
      this.updateForward();
    });

    // 感度：照準 slider <-> number
    this.dom.fwdSens?.addEventListener('input', () => {
      this.dom.fwdSensNum.value = parseFloat(this.dom.fwdSens.value).toFixed(3);
      this.updateForward();
    });
    this.dom.fwdSensNum?.addEventListener('input', () => {
      this.dom.fwdSens.value = this.dom.fwdSensNum.value;
      this.updateForward();
    });

    // ADS感度マルチプライヤー (<2.5x)
    this.dom.fwdAdsMult?.addEventListener('input', () => {
      const val = parseFloat(this.dom.fwdAdsMult.value);
      this.dom.fwdAdsMultNum.value = val.toFixed(3);
      this.updateForward();
    });

    this.dom.fwdAdsMultNum?.addEventListener('input', () => {
      const val = parseFloat(this.dom.fwdAdsMultNum.value) || 1.0;
      this.dom.fwdAdsMult.value = val;
      this.updateForward();
    });

    // スコープ感度倍率 (>=2.5x)
    this.dom.fwdScopeMult?.addEventListener('input', () => {
      const val = parseFloat(this.dom.fwdScopeMult.value);
      this.dom.fwdScopeMultNum.value = val.toFixed(3);
      this.updateForward();
    });

    this.dom.fwdScopeMultNum?.addEventListener('input', () => {
      const val = parseFloat(this.dom.fwdScopeMultNum.value) || 1.0;
      this.dom.fwdScopeMult.value = val;
      this.updateForward();
    });

    // 順引きから逆引きへ数値を送る
    this.dom.btnSendToReverse?.addEventListener('click', () => {
      const dpi = parseFloat(this.dom.fwdDpi.value) || 800;
      const sens = parseFloat(this.dom.fwdSens.value) || 0.35;
      const edpi = dpi * sens;
      const hurimuki = VALORANT_CONSTANTS.HURIMUKI_FACTOR / edpi;
      
      this.dom.revTargetHurimuki.value = hurimuki.toFixed(1);
      this.dom.revTargetHurimukiNum.value = hurimuki.toFixed(2);

      this.dom.revDpi.value = dpi;
      this.dom.revDpiBtns?.forEach(b => {
        b.classList.toggle('active', b.dataset.dpi === String(dpi));
      });

      this.updateReverse();

      this.dom.btnSendToReverse.textContent = '✓ 目標に設定完了';
      setTimeout(() => {
        if (this.dom.btnSendToReverse) this.dom.btnSendToReverse.textContent = '↓ 逆引きの目標にセット';
      }, 1500);
    });

    // === 逆引きイベント ===
    // 逆引き DPI preset buttons
    this.dom.revDpiBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.revDpiBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.dom.revDpi.value = btn.dataset.dpi;
        this.updateReverse();
      });
    });

    this.dom.revDpi?.addEventListener('input', () => {
      const val = this.dom.revDpi.value;
      this.dom.revDpiBtns?.forEach(b => {
        b.classList.toggle('active', b.dataset.dpi === val);
      });
      this.updateReverse();
    });

    // 目標振り向き slider <-> number
    this.dom.revTargetHurimuki?.addEventListener('input', () => {
      const val = parseFloat(this.dom.revTargetHurimuki.value);
      this.dom.revTargetHurimukiNum.value = val.toFixed(2);
      this.updateReverse();
    });
    this.dom.revTargetHurimukiNum?.addEventListener('input', () => {
      const val = parseFloat(this.dom.revTargetHurimukiNum.value) || 20.0;
      this.dom.revTargetHurimuki.value = val;
      this.updateReverse();
    });

    // 基準スコープ感度倍率(SR)
    this.dom.revSrScope?.addEventListener('change', () => {
      this.updateReverse();
    });

    this.dom.revSrMdBtns?.forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.revSrMdBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const md = parseFloat(btn.dataset.md);
        this.dom.revSrMd.value = md;
        this.dom.revSrMdNum.value = md.toFixed(1);
        this.updateReverse();
      });
    });

    this.dom.revSrMd?.addEventListener('input', () => {
      const val = parseFloat(this.dom.revSrMd.value);
      this.dom.revSrMdNum.value = Math.round(val);
      this.updateReverse();
    });

    this.dom.revSrMdNum?.addEventListener('input', () => {
      const parsed = parseFloat(this.dom.revSrMdNum.value);
      const val = isNaN(parsed) ? 100 : parsed;
      this.dom.revSrMd.value = val;
      this.updateReverse();
    });

    // 基準ADS感度マルチプライヤー(SMG, AR)
    this.dom.revAdsScope?.addEventListener('change', () => {
      this.updateReverse();
    });

    this.dom.revAdsMd?.addEventListener('input', () => {
      const val = parseFloat(this.dom.revAdsMd.value);
      this.dom.revAdsMdNum.value = Math.round(val);
      this.updateReverse();
    });

    this.dom.revAdsMdNum?.addEventListener('input', () => {
      const parsed = parseFloat(this.dom.revAdsMdNum.value);
      const val = isNaN(parsed) ? 100 : parsed;
      this.dom.revAdsMd.value = val;
      this.updateReverse();
    });

    // コピーボタン (感度:照準)
    this.dom.btnCopySens?.addEventListener('click', () => {
      const val = this.dom.revSensCustom?.textContent.trim();
      if (val && navigator.clipboard) {
        navigator.clipboard.writeText(val).then(() => {
          if (this.dom.copyFeedbackSens) {
            this.dom.copyFeedbackSens.style.display = 'inline-block';
            setTimeout(() => {
              if (this.dom.copyFeedbackSens) this.dom.copyFeedbackSens.style.display = 'none';
            }, 1800);
          }
        });
      }
    });

    // コピーボタン (スコープ感度倍率 SR)
    this.dom.btnCopyScopeMult?.addEventListener('click', () => {
      const val = this.dom.revRecScopeMult.textContent.trim();
      if (val && navigator.clipboard) {
        navigator.clipboard.writeText(val).then(() => {
          if (this.dom.copyFeedbackScope) {
            this.dom.copyFeedbackScope.style.display = 'inline-block';
            setTimeout(() => {
              if (this.dom.copyFeedbackScope) this.dom.copyFeedbackScope.style.display = 'none';
            }, 1800);
          }
        });
      }
    });

    // コピーボタン (ADS感度マルチプライヤー)
    this.dom.btnCopyAdsMult?.addEventListener('click', () => {
      const val = this.dom.revRecAdsMult.textContent.trim();
      if (val && navigator.clipboard) {
        navigator.clipboard.writeText(val).then(() => {
          if (this.dom.copyFeedbackAds) {
            this.dom.copyFeedbackAds.style.display = 'inline-block';
            setTimeout(() => {
              if (this.dom.copyFeedbackAds) this.dom.copyFeedbackAds.style.display = 'none';
            }, 1800);
          }
        });
      }
    });

    // 推奨設定を順引きに適用する
    this.dom.btnApplyToForward?.addEventListener('click', () => {
      const revDpi = parseFloat(this.dom.revDpi?.value) || 800;
      const targetHurimuki = parseFloat(this.dom.revTargetHurimukiNum?.value) || 20.0;
      const targetEdpi = VALORANT_CONSTANTS.HURIMUKI_FACTOR / targetHurimuki;
      const targetSens = targetEdpi / revDpi;

      const scopeMult = parseFloat(this.dom.revRecScopeMult?.textContent) || 1.0;
      const adsMult = parseFloat(this.dom.revRecAdsMult?.textContent) || 1.0;

      // 順引き側DPI同期
      this.dom.fwdDpi.value = revDpi;
      this.dom.fwdDpiBtns?.forEach(b => {
        b.classList.toggle('active', b.dataset.dpi === String(revDpi));
      });

      // 順引き側感度・マルチプライヤー同期
      this.dom.fwdSens.value = targetSens.toFixed(3);
      this.dom.fwdSensNum.value = targetSens.toFixed(3);
      
      this.dom.fwdAdsMult.value = adsMult.toFixed(3);
      this.dom.fwdAdsMultNum.value = adsMult.toFixed(3);
      this.dom.fwdScopeMult.value = scopeMult.toFixed(3);
      this.dom.fwdScopeMultNum.value = scopeMult.toFixed(3);

      this.updateForward();

      this.dom.btnApplyToForward.textContent = '✓ 上段に反映完了！';
      setTimeout(() => {
        if (this.dom.btnApplyToForward) this.dom.btnApplyToForward.textContent = '↑ 上段の現在の設定に反映して全診断';
      }, 1500);
    });
  }

  updateSrMdBtnActive(val) {
    this.dom.revSrMdBtns?.forEach(b => {
      const target = parseFloat(b.dataset.md);
      b.classList.toggle('active', Math.abs(target - val) < 0.5);
    });
  }

  updateAdsMdBtnActive(val) {
    this.dom.revAdsMdBtns?.forEach(b => {
      const target = parseFloat(b.dataset.md);
      b.classList.toggle('active', Math.abs(target - val) < 0.5);
    });
  }

  /**
   * 順引き (現状診断) の計算＆DOM更新
   */
  updateForward() {
    const dpi = parseFloat(this.dom.fwdDpi?.value) || 800;
    const sens = parseFloat(this.dom.fwdSensNum?.value) || 0.35;
    const adsMult = parseFloat(this.dom.fwdAdsMultNum?.value) || 1.0;
    const scopeMult = parseFloat(this.dom.fwdScopeMultNum?.value) || 1.0;

    const edpi = dpi * sens;
    const cm360 = edpi > 0 ? VALORANT_CONSTANTS.CM_360_FACTOR / edpi : 0;
    const hurimuki = edpi > 0 ? VALORANT_CONSTANTS.HURIMUKI_FACTOR / edpi : 0;

    if (this.dom.fwdEdpi) this.dom.fwdEdpi.textContent = edpi.toFixed(1);
    if (this.dom.fwdHurimuki) this.dom.fwdHurimuki.textContent = `${hurimuki.toFixed(2)} cm`;
    if (this.dom.fwdCm360) this.dom.fwdCm360.textContent = `${cm360.toFixed(2)} cm`;

    if (!this.dom.fwdTableBody) return;

    let html = '';
    VALORANT_SCOPES.forEach((scope, index) => {
      // 2.5倍未満はADS感度マルチプライヤー、2.5倍以上はスコープ感度倍率を適用
      const mult = scope.zoom < 2.5 ? adsMult : scopeMult;
      const hfov = VALORANT_CONSTANTS.HFOV_HIP / scope.zoom;
      
      // 実効振り向き (cm): hipHurimuki * (zoom / mult)
      const adsHurimuki = mult > 0 ? hurimuki * (scope.zoom / mult) : 0;
      
      // 実効MD% (VALORANT仕様: mult=1.000でMD 100.0%)
      const effectiveMd = solveMdForMult(scope.zoom, mult);

      // MD%の表示スタイル
      let mdBadgeClass = 'valo-md-normal';
      if (effectiveMd < -0.1) mdBadgeClass = 'valo-md-negative';
      else if (Math.abs(effectiveMd - 100) < 0.5) mdBadgeClass = 'valo-md-100';
      else if (Math.abs(effectiveMd) <= 0.5) mdBadgeClass = 'valo-md-0';

      const rowClass = index % 2 === 0 ? 'valo-row-even' : 'valo-row-odd';

      html += `
        <tr class="${rowClass}">
          <td class="valo-col-weapon">
            <span class="valo-scope-name">${scope.name}</span>
          </td>
          <td class="valo-col-zoom"><strong>${scope.zoom.toFixed(2)}x</strong></td>
          <td class="valo-col-fov">${hfov.toFixed(1)}°</td>
          <td class="valo-col-hurimuki"><span class="valo-cm-highlight">${adsHurimuki.toFixed(2)} cm</span></td>
          <td class="valo-col-md">
            <span class="valo-md-badge ${mdBadgeClass}">${effectiveMd.toFixed(1)}%</span>
          </td>
        </tr>
      `;
    });

    this.dom.fwdTableBody.innerHTML = html;
  }

  /**
   * 逆引き (設定算出) の計算＆DOM更新
   */
  updateReverse() {
    const revDpi = parseFloat(this.dom.revDpi?.value) || 800;
    const targetHurimuki = parseFloat(this.dom.revTargetHurimukiNum?.value) || 20.0;
    
    // 基準スコープ感度倍率(SR) の推奨値計算
    const srScopeId = this.dom.revSrScope?.value || 'operator_1';
    const parsedSrMd = parseFloat(this.dom.revSrMdNum?.value);
    const targetSrMd = isNaN(parsedSrMd) ? 100.0 : parsedSrMd;
    const srScope = VALORANT_SCOPES.find(s => s.id === srScopeId) || VALORANT_SCOPES[4]; // Operator 1
    const recScopeMult = getMultForMd(srScope.zoom, targetSrMd);

    // 基準ADS感度マルチプライヤー(SMG, AR) の推奨値計算
    const adsScopeId = this.dom.revAdsScope?.value || 'vandal_phantom';
    const parsedAdsMd = parseFloat(this.dom.revAdsMdNum?.value);
    const targetAdsMd = isNaN(parsedAdsMd) ? 100.0 : parsedAdsMd;
    const adsScope = VALORANT_SCOPES.find(s => s.id === adsScopeId) || VALORANT_SCOPES[1]; // Vandal/Phantom
    const recAdsMult = getMultForMd(adsScope.zoom, targetAdsMd);

    // 目標腰だめeDPI ＆ 各DPIでの「感度：照準」
    const targetEdpi = targetHurimuki > 0 ? VALORANT_CONSTANTS.HURIMUKI_FACTOR / targetHurimuki : 0;
    const sens400 = targetEdpi / 400;
    const sens800 = targetEdpi / 800;
    const sens1600 = targetEdpi / 1600;
    const sensCustom = revDpi > 0 ? targetEdpi / revDpi : 0;

    if (this.dom.revTargetEdpi) {
      this.dom.revTargetEdpi.textContent = `eDPI: ${targetEdpi.toFixed(1)}`;
    }

    // 推奨倍率表示
    if (this.dom.revRecScopeMult) {
      this.dom.revRecScopeMult.textContent = recScopeMult.toFixed(3);
    }
    if (this.dom.revRecAdsMult) {
      this.dom.revRecAdsMult.textContent = recAdsMult.toFixed(3);
    }

    // 各DPIでの設定すべき「感度：照準」
    if (this.dom.revSens400) this.dom.revSens400.textContent = sens400.toFixed(3);
    if (this.dom.revSens800) this.dom.revSens800.textContent = sens800.toFixed(3);
    if (this.dom.revSens1600) this.dom.revSens1600.textContent = sens1600.toFixed(3);
    if (this.dom.revCustomDpiLabel) {
      this.dom.revCustomDpiLabel.textContent = `入力 (${Math.round(revDpi)})`;
    }
    if (this.dom.revSensCustom) {
      this.dom.revSensCustom.textContent = sensCustom.toFixed(3);
    }

    // 各倍率の計算結果テーブル (上段の順引きテーブルと全く同じ形式・グリッド)
    const tableEl = this.dom.revTableBody || this.dom.revScopeImpactList || document.getElementById('valoRevTableBody');
    if (tableEl) {
      let tableHtml = '';
      VALORANT_SCOPES.forEach((scope, index) => {
        const isSrRef = scope.id === srScope.id;
        const isAdsRef = scope.id === adsScope.id;

        const mult = scope.zoom < 2.5 ? recAdsMult : recScopeMult;
        const hfov = VALORANT_CONSTANTS.HFOV_HIP / scope.zoom;
        const adsHurimuki = mult > 0 ? targetHurimuki * (scope.zoom / mult) : 0;
        const effectiveMd = solveMdForMult(scope.zoom, mult);

        let mdBadgeClass = 'valo-md-normal';
        if (effectiveMd < -0.1) mdBadgeClass = 'valo-md-negative';
        else if (Math.abs(effectiveMd - 100) < 0.5) mdBadgeClass = 'valo-md-100';
        else if (Math.abs(effectiveMd) <= 0.5) mdBadgeClass = 'valo-md-0';

        let refRowClass = '';
        if (isSrRef) refRowClass = ' valo-row-ref-sr';
        else if (isAdsRef) refRowClass = ' valo-row-ref-ads';

        const rowClass = (index % 2 === 0 ? 'valo-row-even' : 'valo-row-odd') + refRowClass;

        tableHtml += `
          <tr class="${rowClass}">
            <td class="valo-col-weapon">
              <span class="valo-scope-name">${scope.name}</span>
            </td>
            <td class="valo-col-zoom"><strong>${scope.zoom.toFixed(2)}x</strong></td>
            <td class="valo-col-fov">${hfov.toFixed(1)}°</td>
            <td class="valo-col-hurimuki"><span class="valo-cm-highlight">${adsHurimuki.toFixed(2)} cm</span></td>
            <td class="valo-col-md">
              <span class="valo-md-badge ${mdBadgeClass}">${effectiveMd.toFixed(1)}%</span>
            </td>
          </tr>
        `;
      });
      tableEl.innerHTML = tableHtml;
    }
  }
}
