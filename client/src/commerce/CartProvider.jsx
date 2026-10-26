import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { PREPARATIONS } from '../lib/grinds.js';
import { CART_STORAGE_KEY, MAX_CART_LINES, MAX_LINE_QUANTITY, cartIdentity, addLine } from './cart-values.mjs';

const CartContext = createContext(null);
const validCodes = new Set(PREPARATIONS.map(g => g.code));
// Do not guess an old cart line's size or preparation.
function validated(contents) {
  if (!Array.isArray(contents)) return [];
  const seen = new Set();
  return contents.filter(item => {
    if (!item || typeof item.productId !== 'string' || !/^[a-f0-9]{24}$/i.test(item.productId) ||
      !Number.isSafeInteger(item.sizeGrams) || item.sizeGrams < 1 || item.sizeGrams > 50000 || !validCodes.has(item.grindCode) ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_LINE_QUANTITY || seen.has(cartIdentity(item.productId, item.sizeGrams, item.grindCode))) return false;
    seen.add(cartIdentity(item.productId, item.sizeGrams, item.grindCode));
    return true;
  }).slice(0, MAX_CART_LINES).map(item => ({ productId: item.productId.toLowerCase(), sizeGrams: item.sizeGrams, grindCode: item.grindCode, quantity: item.quantity }));
}
function initialCart() { try { return validated(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]')); } catch { return []; } }
export function CartProvider({ children }) {
  const [items, setItems] = useState(initialCart);
  const itemsRef = useRef(items);
  // Ref is updated synchronously, so two fast clicks do not both read stale
  // React render state. No storage writes inside a React state updater.
  const save = useCallback((next) => {
    const result = validated(typeof next === 'function' ? next(itemsRef.current) : next);
    itemsRef.current = result;
    try { localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(result)); } catch { /* Keep current tab usable. */ }
    setItems(result);
    return result;
  }, []);
  useEffect(() => {
    const sync = (event) => {
      if (event.key !== CART_STORAGE_KEY && event.key !== null) return;
      const next = validated(event.newValue ? (() => { try { return JSON.parse(event.newValue); } catch { return []; } })() : []);
      itemsRef.current = next;
      setItems(next);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const add = useCallback((productId, sizeGrams, grindCode, quantity = 1) => {
    if (typeof productId !== 'string' || !/^[a-f0-9]{24}$/i.test(productId) || !Number.isSafeInteger(sizeGrams) || sizeGrams < 1 || sizeGrams > 50000 ||
      !validCodes.has(grindCode) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) return false;
    const result = addLine(itemsRef.current, { productId: productId.toLowerCase(), sizeGrams, grindCode, quantity });
    if (!result) return false;
    save(result);
    return true;
  }, [save]);
  const update = useCallback((productId, sizeGrams, grindCode, quantity) => save(old => old.map(item => cartIdentity(item.productId, item.sizeGrams, item.grindCode) === cartIdentity(productId, sizeGrams, grindCode) ? { ...item, quantity } : item)), [save]);
  const remove = useCallback((productId, sizeGrams, grindCode) => save(old => old.filter(item => cartIdentity(item.productId, item.sizeGrams, item.grindCode) !== cartIdentity(productId, sizeGrams, grindCode))), [save]);
  const clear = useCallback(() => save([]), [save]);
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const value = useMemo(() => ({ items, count, add, update, remove, clear }), [items, count, add, update, remove, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error('CartProvider missing'); return value; }
