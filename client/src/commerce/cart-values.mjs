const KEY = 'quantum-coffee-cart-v3';
export const CART_STORAGE_KEY = KEY;
export const MAX_CART_LINES = 20;
export const MAX_LINE_QUANTITY = 20;
export const cartIdentity = (productId, sizeGrams, grindCode) => `${String(productId).toLowerCase()}:${sizeGrams}:${grindCode}`;
export function addLine(items, line) {
  if (!Array.isArray(items) || !line || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_LINE_QUANTITY) return null;
  const id = cartIdentity(line.productId, line.sizeGrams, line.grindCode);
  const index = items.findIndex(item => cartIdentity(item.productId, item.sizeGrams, item.grindCode) === id);
  if (index >= 0) {
    if (items[index].quantity + line.quantity > MAX_LINE_QUANTITY) return null;
    return items.map((item, i) => i === index ? { ...item, quantity: item.quantity + line.quantity } : item);
  }
  if (items.length >= MAX_CART_LINES) return null;
  return [...items, line];
}
