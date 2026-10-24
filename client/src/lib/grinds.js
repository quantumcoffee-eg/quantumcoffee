// Keep codes aligned with server/src/catalog/grinds.js.
export const PREPARATIONS = Object.freeze([
  { code:'whole_beans', en:'Whole beans', ar:'حبوب كاملة' },
  { code:'espresso', en:'Espresso', ar:'إسبريسو' },
  { code:'moka_pot', en:'Moka pot', ar:'موكا بوت' },
  { code:'french_press', en:'French press', ar:'فرنش برس' },
  { code:'filter', en:'Filter / V60', ar:'فلتر / V60' },
  { code:'turkish_plain', en:'Turkish (plain)', ar:'تركي سادة' },
  { code:'turkish_spiced', en:'Turkish (spiced / mahwaj)', ar:'تركي محوج' },
]);
export const preparationName = (code, lang='en') => PREPARATIONS.find(o=>o.code===code)?.[lang] || code;
