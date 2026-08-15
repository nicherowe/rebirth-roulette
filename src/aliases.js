// GPWv4 人口密度グリッドにセルが存在しない国（RS/ME は "Serbia and Montenegro" という
// 統合コードでしか記録されておらず、国境を推測して分割するとバグの元になるため採用しない。
// SS/XK/EH はそもそもデータが存在しない）。
// これらの国では grids/<ISO2>.json の fetch 自体を試みず、国のbbox内一様ランダムにフォールバックする。
const NO_GRID = new Set(['EH', 'SS', 'XK', 'RS', 'ME']);
