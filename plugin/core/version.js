// core/version.js — versão do Helmet Marker. Precisa ser igual à do manifest.json
// (o empacotar.ps1 e os testes conferem).
var HM_VERSION = "1.0.0";
if (typeof module === "object" && module.exports) module.exports = HM_VERSION;
