import { createHash, randomBytes } from 'node:crypto';

export class CommerceError extends Error {
  constructor(message, code = 'INVALID_CHECKOUT', status = 400) {
    super(message); this.code = code; this.status = status;
  }
}
export const GOVERNORATES = Object.freeze([
  'cairo','giza','alexandria','qalyubia','dakahlia','sharqia','gharbia','monufia','beheira','kafr_el_sheikh',
  'damietta','port_said','ismailia','suez','north_sinai','south_sinai','red_sea','fayoum','beni_suef',
  'minya','assiut','sohag','qena','luxor','aswan','new_valley','matrouh'
]);
export const PAYMENT_METHODS = Object.freeze(['cod','instapay','vodafone_cash']);
// Phase 4A deliberately cannot accept real orders. Switch on only after proof uploads,
// payment instructions, delivery policies and full checkout verification in Phase 4B.
export const ORDERING_IMPLEMENTED = false;
const validId = id => typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id);
const clean = (text, maximum) => typeof text === 'string' ? text.trim().slice(0, maximum + 1) : '';
export function validateItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw new CommerceError('Choose between 1 and 20 different products.');
  const ids = new Set();
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(k => !['productId','quantity'].includes(k)) ||
       !validId(item.productId) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 || ids.has(item.productId.toLowerCase()))
      throw new CommerceError('The cart contains an invalid item.', 'INVALID_CART');
    ids.add(item.productId.toLowerCase());
    return { productId: item.productId.toLowerCase(), quantity: item.quantity };
  });
}
export function phoneNumber(value) {
  const raw = clean(value, 22).replace(/[\s()-]/g, '');
  const local = raw.startsWith('+20') ? `0${raw.slice(3)}` : raw.startsWith('20') ? `0${raw.slice(2)}` : raw;
  if (!/^01[0125]\d{8}$/.test(local)) throw new CommerceError('Enter a valid Egyptian mobile phone number.', 'INVALID_PHONE');
  return local;
}
export function validateCustomer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['name','phone','email','governorate','city','street','details'].includes(k)))
    throw new CommerceError('Invalid delivery information.');
  const name = clean(value.name, 100), phone = phoneNumber(value.phone), email = clean(value.email || '', 254).toLowerCase();
  const governorate = value.governorate, city = clean(value.city, 120), street = clean(value.street, 240), details = clean(value.details || '', 500);
  if (name.length < 2 || name.length > 100 || !GOVERNORATES.includes(governorate) || city.length < 2 || city.length > 120 || street.length < 5 || street.length > 240 || details.length > 500 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
    throw new CommerceError('Complete the delivery name, governorate, city and address.', 'INVALID_DELIVERY');
  return { name, phone, email, governorate, city, street, details };
}
export function shippingAmount(governorate, env = process.env) {
  if (!GOVERNORATES.includes(governorate)) throw new CommerceError('Select a governorate.', 'INVALID_GOVERNORATE');
  const raw = ['cairo','giza'].includes(governorate) ? env.SHIPPING_CAIRO_GIZA_PIASTRES : env.SHIPPING_OTHER_PIASTRES;
  if (typeof raw !== 'string' || !/^(?:0|[1-9]\d{0,8})$/.test(raw))
    throw new CommerceError('Shipping rates have not been configured yet.', 'SHIPPING_UNAVAILABLE', 503);
  return Number(raw);
}
export function lineTotals(entries) {
  if (!Array.isArray(entries) || entries.length < 1) throw new CommerceError('Cart is empty.', 'EMPTY_CART');
  let subtotalPiastres = 0;
  const lines = entries.map(({ product, quantity }) => {
    if (!product || product.status !== 'published' || !Number.isSafeInteger(product.pricePiastres) || product.pricePiastres < 1)
      throw new CommerceError('A selected product is no longer available.', 'PRODUCT_UNAVAILABLE', 409);
    if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < quantity)
      throw new CommerceError('Not enough stock for a selected product.', 'OUT_OF_STOCK', 409);
    const lineTotalPiastres = product.pricePiastres * quantity;
    if (!Number.isSafeInteger(lineTotalPiastres) || lineTotalPiastres > 1_000_000_000) throw new CommerceError('Cart total is too large.');
    subtotalPiastres += lineTotalPiastres;
    if (!Number.isSafeInteger(subtotalPiastres) || subtotalPiastres > 1_000_000_000) throw new CommerceError('Cart total is too large.');
    return { productId: product._id, slug: product.slug, name: product.name, imageKey: product.imageKeys?.[0] || null,
      quantity, unitPricePiastres: product.pricePiastres, lineTotalPiastres };
  });
  return { lines, subtotalPiastres };
}
export function validateCheckout(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['items','customer','paymentMethod','checkoutKey'].includes(k)))
    throw new CommerceError('Invalid checkout request.');
  const items = validateItems(body.items), customer = validateCustomer(body.customer);
  if (!PAYMENT_METHODS.includes(body.paymentMethod)) throw new CommerceError('Choose an available payment method.', 'INVALID_PAYMENT');
  if (typeof body.checkoutKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.checkoutKey))
    throw new CommerceError('Invalid checkout reference.', 'INVALID_CHECKOUT_KEY');
  return { items, customer, paymentMethod: body.paymentMethod, checkoutKey: body.checkoutKey.toLowerCase() };
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function newOrderNumber() { return `QC-${randomBytes(6).toString('hex').toUpperCase()}`; }
export function statusTransition(previous, next) {
  const allowed = {
    received:['confirmed','cancelled'], confirmed:['packing','cancelled'], packing:['shipped','cancelled'],
    shipped:['delivered'], delivered:[], cancelled:[]
  };
  if (!Object.hasOwn(allowed, previous) || !allowed[previous].includes(next)) throw new CommerceError('This order status transition is not allowed.', 'INVALID_STATUS', 409);
  return next;
}
