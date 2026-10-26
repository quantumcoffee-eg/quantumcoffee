// Only business-facing, publishable settings. Never store credentials or private keys here.
export const POLICY_KEYS = Object.freeze(['shipping', 'refunds', 'privacy', 'terms']);
export const PAYMENT_CODES = Object.freeze(['cod', 'instapay', 'vodafone_cash']);
export const defaultStoreSettings = () => ({
  contact: { whatsapp: '', email: '', instagramUrl: '' },
  shipping: { cairoGizaPiastres: null, otherPiastres: null },
  payments: {
    cod: { enabled: false },
    instapay: { enabled: false, recipient: '', reference: '' },
    vodafone_cash: { enabled: false, recipient: '', phone: '' },
  },
  policies: Object.fromEntries(POLICY_KEYS.map(key => [key, { en: '', ar: '' }])),
});
export class StoreSettingsError extends Error {
  constructor(message) { super(message); this.status = 400; this.code = 'INVALID_STORE_SETTINGS'; }
}
const fail = message => { throw new StoreSettingsError(message); };
const obj = (value, name, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail(`Invalid ${name}.`);
  return value;
};
const str = (value, max, name) => {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) fail(`Invalid ${name}.`);
  return value.trim();
};
const rate = (value, name) => value === null ? null : Number.isSafeInteger(value) && value >= 0 && value <= 1000000 ? value : fail(`Invalid ${name}.`);
const egyptPhone = value => /^01[0125]\d{8}$/.test(value);
export function validateStoreSettings(input) {
  const data = obj(input, 'settings', ['contact','shipping','payments','policies']);
  const contact = obj(data.contact, 'contact', ['whatsapp','email','instagramUrl']);
  const shipping = obj(data.shipping, 'shipping', ['cairoGizaPiastres','otherPiastres']);
  const payments = obj(data.payments, 'payments', PAYMENT_CODES);
  const policies = obj(data.policies, 'policies', POLICY_KEYS);
  if (Object.keys(payments).length !== 3 || Object.keys(policies).length !== 4) fail('Incomplete store configuration.');
  const whatsapp = str(contact.whatsapp, 20, 'WhatsApp number');
  // International Egyptian +20 number; no links, scripts or free-form messages.
  if (whatsapp && !/^\+201[0125]\d{8}$/.test(whatsapp)) fail('WhatsApp must be an Egyptian +20 mobile number.');
  const email = str(contact.email, 254, 'contact email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Invalid contact email.');
  const instagramUrl = str(contact.instagramUrl, 200, 'Instagram URL');
  if (instagramUrl) {
    let parsed;
    try { parsed = new URL(instagramUrl); } catch { fail('Invalid Instagram URL.'); }
    if (parsed.protocol !== 'https:' || !['instagram.com','www.instagram.com'].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port || !/^\/[a-zA-Z0-9_.]+\/?$/.test(parsed.pathname) || parsed.search || parsed.hash) fail('Use a direct HTTPS Instagram profile URL.');
  }
  const result = {
    contact: { whatsapp, email, instagramUrl },
    shipping: {
      cairoGizaPiastres: rate(shipping.cairoGizaPiastres,'Cairo/Giza fee'),
      otherPiastres: rate(shipping.otherPiastres,'other governorates fee'),
    },
    payments: {}, policies: {},
  };
  obj(payments.cod, 'COD', ['enabled']);
  if (typeof payments.cod.enabled !== 'boolean') fail('Invalid COD setting.');
  result.payments.cod = { enabled: payments.cod.enabled };
  const instapay = obj(payments.instapay,'InstaPay',['enabled','recipient','reference']);
  const vodafone = obj(payments.vodafone_cash,'Vodafone Cash',['enabled','recipient','phone']);
  if (typeof instapay.enabled !== 'boolean' || typeof vodafone.enabled !== 'boolean') fail('Invalid payment availability.');
  result.payments.instapay = { enabled: instapay.enabled, recipient: str(instapay.recipient,120,'InstaPay recipient'), reference: str(instapay.reference,120,'InstaPay handle/number') };
  result.payments.vodafone_cash = { enabled: vodafone.enabled, recipient: str(vodafone.recipient,120,'Vodafone Cash recipient'), phone: str(vodafone.phone,20,'Vodafone Cash phone') };
  if (instapay.enabled && (!result.payments.instapay.recipient || !result.payments.instapay.reference)) fail('InstaPay receiver instructions are required before enabling payment.');
  if (vodafone.enabled && (!result.payments.vodafone_cash.recipient || !egyptPhone(result.payments.vodafone_cash.phone))) fail('Valid Vodafone Cash recipient and Egyptian phone are required before enabling payment.');
  for (const key of POLICY_KEYS) {
    const item = obj(policies[key], key, ['en','ar']);
    result.policies[key] = { en: str(item.en,12000,`${key} English text`), ar: str(item.ar,12000,`${key} Arabic text`) };
  }
  return result;
}
export function editableStoreSettings(input) {
  const settings = input || defaultStoreSettings();
  return {contact:settings.contact, shipping:settings.shipping, payments:settings.payments, policies:settings.policies};
}
export function publicStoreSettings(input) {
  const settings = editableStoreSettings(input);
  // Do not expose draft receiver identifiers to visitors before they are enabled.
  const payments = Object.fromEntries(PAYMENT_CODES.map(code => [code, settings.payments[code]?.enabled ? settings.payments[code] : {enabled:false}]));
  return {...settings,payments};
}
export function shippingFeeFromSettings(governorate, settings) {
  const valid = ['cairo','giza','alexandria','qalyubia','dakahlia','sharqia','gharbia','monufia','beheira','kafr_el_sheikh','damietta','port_said','ismailia','suez','north_sinai','south_sinai','red_sea','fayoum','beni_suef','minya','assiut','sohag','qena','luxor','aswan','new_valley','matrouh'];
  if (!valid.includes(governorate)) return {error:'INVALID_GOVERNORATE'};
  const amount = ['cairo','giza'].includes(governorate) ? settings?.shipping?.cairoGizaPiastres : settings?.shipping?.otherPiastres;
  if (!Number.isSafeInteger(amount) || amount < 0) return {error:'SHIPPING_UNAVAILABLE'};
  return {amount};
}
