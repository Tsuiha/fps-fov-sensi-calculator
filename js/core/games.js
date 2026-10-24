/**
 * Game Presets & Mechanics Definitions
 * 各FPSタイトルの視野角仕様、yaw係数、ADSスケーリング特性の定義
 */

import { vFovToHfov, hFovToVfov, convertHfovBetweenAspects } from './fov.js';

export const GAME_PRESETS = {
  apex: {
    id: 'apex',
    name: 'Apex Legends',
    engine: 'Source Engine (Modified)',
    fovType: '4:3_horizontal', // ゲーム内設定・内部値は4:3アスペクト比基準の水平FOV
    defaultFov: 90,
    minFov: 70,
    maxFov: 110,
    yaw: 0.022,
    defaultAdsScaling: 'md_0', // デフォルトはFocal Length (MD 0%)
    notes: 'ゲーム内スライダー110は内部cl_fovscale 1.55 (=4:3実質108.5°)。スライダー104はcl_fovscale 1.4675 (=4:3実質102.725°)。',
    // スライダー値から内部実質4:3 FOVを取得
    sliderToTrueFov: (sliderVal) => {
      // 70のときはscale 1.0 (70°)
      // 110のときはscale 1.55 (108.5°)
      // 104のときはscale 1.4675 (102.725°)
      if (sliderVal === 110) return 108.5;
      if (sliderVal === 104) return 102.725;
      // 線形補間近傍
      const scale = 1.0 + (sliderVal - 70) * (0.55 / 40);
      return 70 * scale;
    },
    // 内部実質4:3 FOVから16:9での水平FOVを算出
    getActual169Hfov: function(sliderVal) {
      const true43 = this.sliderToTrueFov(sliderVal);
      return convertHfovBetweenAspects(true43, '4:3', '16:9');
    },
    scopes: [
      { id: 'iron_pistol', name: 'アイアンサイト (ピストル/SG)', zoom: 1.15 },
      { id: 'iron_ar', name: 'アイアンサイト (AR/SMG)', zoom: 1.25 },
      { id: '1x', name: '1x HCOG / Holo (等倍サイト)', zoom: 1.30 },
      { id: '2x', name: '2x Bruiser (HCOG)', zoom: 2.0 },
      { id: '3x', name: '3x Ranger (HCOG)', zoom: 3.0 },
      { id: '4x', name: '4x (2x-4x可変)', zoom: 4.0 },
      { id: '6x', name: '6x スナイパースコープ', zoom: 6.0 },
      { id: '8x', name: '8x (4x-8x可変)', zoom: 8.0 },
      { id: '10x', name: '10x (4x-10xデジタル)', zoom: 10.0 }
    ]
  },

  valorant: {
    id: 'valorant',
    name: 'VALORANT',
    engine: 'Unreal Engine 4',
    fovType: '16:9_horizontal_locked', // 16:9固定 (103°)
    defaultFov: 103,
    minFov: 103,
    maxFov: 103,
    yaw: 0.07,
    defaultAdsScaling: 'md_100', // デフォルトはMD 100%
    notes: '視野角は103°に固定。4:3解像度を選択しても視野角は狭まらず、UIのみ引き伸ばされる仕様。',
    sliderToTrueFov: () => 103,
    getActual169Hfov: () => 103,
    scopes: [
      { id: 'smg_lmg', name: 'SMG / LMG (Spectre, Ares等)', zoom: 1.15, weaponGroup: 'SMG/LMG' },
      { id: 'ar_ads', name: 'AR (Vandal, Phantom等)', zoom: 1.25, weaponGroup: 'AR' },
      { id: 'guardian', name: 'Guardian / Bulldog', zoom: 1.5, weaponGroup: 'DMR/Rifle' },
      { id: 'operator_1', name: 'Operator 1段階目 (2.5x)', zoom: 2.5, weaponGroup: 'Sniper' },
      { id: 'marshal', name: 'Marshal / Outlaw (3.5x)', zoom: 3.5, weaponGroup: 'Sniper' },
      { id: 'operator_2', name: 'Operator 2段階目 (5.0x)', zoom: 5.0, weaponGroup: 'Sniper' }
    ]
  },

  cs2: {
    id: 'cs2',
    name: 'Counter-Strike 2 / CS:GO',
    engine: 'Source 2 / Source',
    fovType: '4:3_horizontal',
    defaultFov: 90,
    minFov: 90,
    maxFov: 90,
    yaw: 0.022,
    defaultAdsScaling: 'md_75', // zoom_sensitivity_ratio 1.0 は MD 75% 相当
    notes: '4:3ベース90°固定。16:9モニターでは水平106.26°。zoom_sensitivity_ratio 1.0は4:3画面端(MDH 75%)に一致。',
    sliderToTrueFov: () => 90,
    getActual169Hfov: () => convertHfovBetweenAspects(90, '4:3', '16:9'),
    scopes: [
      { id: 'aug_sg', name: 'AUG / SG553 スコープ', zoom: 2.25 },
      { id: 'ssg_1', name: 'SSG 08 (スカウト) 1段目', zoom: 2.25 },
      { id: 'awp_1', name: 'AWP 1段目', zoom: 2.25 },
      { id: 'awp_2', name: 'AWP 2段目', zoom: 6.0 }
    ]
  },

  overwatch: {
    id: 'overwatch',
    name: 'Overwatch 2',
    engine: 'Proprietary',
    fovType: '16:9_horizontal',
    defaultFov: 103,
    minFov: 80,
    maxFov: 103,
    yaw: 0.0066,
    defaultAdsScaling: 'md_0',
    notes: 'スライダー値は16:9基準の水平FOV。最大103°。',
    sliderToTrueFov: (val) => val,
    getActual169Hfov: (val) => val,
    scopes: [
      { id: 'ana', name: 'アナ (スコープ)', zoom: 1.33 },
      { id: 'ashe', name: 'アッシュ (ADS)', zoom: 1.54 },
      { id: 'widow', name: 'ウィドウメイカー (スコープ)', zoom: 2.67 }
    ]
  },

  r6s: {
    id: 'r6s',
    name: 'Rainbow Six Siege',
    engine: 'AnvilNext 2.0',
    fovType: 'vertical',
    defaultFov: 84,
    minFov: 60,
    maxFov: 90,
    yaw: 0.00572957795,
    defaultAdsScaling: 'md_0', // 新ADS感度システムはMD0%基準
    notes: 'スライダー値は垂直FOV (vFOV)。16:9解像度で設定84は水平約114.7°。旧ADSは等倍で振り向き一致(MD∞%)だったが現在は改修。',
    sliderToTrueFov: (val) => val,
    getActual169Hfov: (val) => vFovToHfov(val, '16:9'),
    scopes: [
      { id: '1x', name: '1.0x サイト', zoom: 1.0 },
      { id: '1.5x', name: '1.5x スコープ', zoom: 1.5 },
      { id: '2.0x', name: '2.0x スコープ', zoom: 2.0 },
      { id: '2.5x', name: '2.5x (ACOG)', zoom: 2.5 },
      { id: '3.0x', name: '3.0x スコープ', zoom: 3.0 }
    ]
  },

  battlefield: {
    id: 'battlefield',
    name: 'Battlefield 2042 / BFV',
    engine: 'Frostbite',
    fovType: 'vertical',
    defaultFov: 55,
    minFov: 40,
    maxFov: 105,
    yaw: 0.022,
    defaultAdsScaling: 'md_133_vert', // 統一照準 133% (MDV 133% = MDH 75%)
    notes: '垂直FOV基準。統一照準（USA: Uniform Soldier Aiming）の係数133%は垂直基準(MDV 133%)であり、16:9画面の4:3端(MDH 75%)に相当。',
    sliderToTrueFov: (val) => val,
    getActual169Hfov: (val) => vFovToHfov(val, '16:9'),
    scopes: [
      { id: '1x_scope', name: '1.0x スコープ (1%拡大)', zoom: 1.01 },
      { id: 'iron', name: 'アイアンサイト (1.25x)', zoom: 1.25 },
      { id: '1.5x', name: '1.5x サイト', zoom: 1.5 },
      { id: '2.0x', name: '2.0x サイト', zoom: 2.0 },
      { id: '3.0x', name: '3.0x スコープ', zoom: 3.0 },
      { id: '4.0x', name: '4.0x スコープ', zoom: 4.0 },
      { id: '6.0x', name: '6.0x スナイパー', zoom: 6.0 }
    ]
  },

  generic: {
    id: 'generic',
    name: '汎用 / カスタム設定',
    engine: 'Generic 3D',
    fovType: '16:9_horizontal',
    defaultFov: 103,
    minFov: 30,
    maxFov: 150,
    yaw: 0.022,
    defaultAdsScaling: 'md_0',
    notes: '任意のアスペクト比、基準FOV、DPI、m_yaw、MD%を設定可能。',
    sliderToTrueFov: (val) => val,
    getActual169Hfov: (val) => val,
    scopes: [
      { id: 'custom_ads', name: 'カスタムADS / スコープ', zoom: 2.0 }
    ]
  }
};
