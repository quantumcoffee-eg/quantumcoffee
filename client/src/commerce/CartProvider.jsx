import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { PREPARATIONS } from '../lib/grinds.js';

const CartContext=createContext(null);
// Do not guess preparation for old product-only cart entries.
// No guessing the size of entries from the older one-size cart.
const KEY='quantum-coffee-cart-v3';
const maxItems=20;
const validCodes=new Set(PREPARATIONS.map(g=>g.code));
const keyOf=(productId,sizeGrams,grindCode)=>`${productId.toLowerCase()}:${sizeGrams}:${grindCode}`;
function validated(contents){
  if(!Array.isArray(contents))return [];
  const seen=new Set();
  return contents.filter(item=>{
    if(!item||typeof item.productId!=='string'||!/^[a-f0-9]{24}$/i.test(item.productId)||
      !Number.isSafeInteger(item.sizeGrams)||item.sizeGrams<1||item.sizeGrams>50000||!validCodes.has(item.grindCode)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20||seen.has(keyOf(item.productId,item.sizeGrams,item.grindCode)))return false;
    seen.add(keyOf(item.productId,item.sizeGrams,item.grindCode));return true;
  }).slice(0,maxItems).map(item=>({productId:item.productId.toLowerCase(),sizeGrams:item.sizeGrams,grindCode:item.grindCode,quantity:item.quantity}));
}
function initialCart(){try{return validated(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{return []}}
export function CartProvider({children}){
  const [items,setItems]=useState(initialCart);
  const save=useCallback(next=>{setItems(old=>{const result=validated(typeof next==='function'?next(old):next);try{localStorage.setItem(KEY,JSON.stringify(result))}catch{/* Keep current tab usable. */}return result})},[]);
  const add=useCallback((productId,sizeGrams,grindCode,quantity=1)=>{
    if(typeof productId!=='string'||!/^[a-f0-9]{24}$/i.test(productId)||!Number.isSafeInteger(sizeGrams)||sizeGrams<1||sizeGrams>50000||!validCodes.has(grindCode)||!Number.isInteger(quantity)||quantity<1||quantity>20)return false;
    const id=keyOf(productId,sizeGrams,grindCode),existing=items.find(p=>keyOf(p.productId,p.sizeGrams,p.grindCode)===id);
    if ((!existing&&items.length>=maxItems)||(existing&&existing.quantity+quantity>20))return false;
    save(old=>{const previous=old.find(p=>keyOf(p.productId,p.sizeGrams,p.grindCode)===id);if(previous)return old.map(p=>keyOf(p.productId,p.sizeGrams,p.grindCode)===id?{...p,quantity:p.quantity+quantity}:p);return old.length>=maxItems?old:[...old,{productId:productId.toLowerCase(),sizeGrams,grindCode,quantity}]});return true;
  },[save,items]);
  const update=useCallback((productId,sizeGrams,grindCode,quantity)=>save(old=>old.map(p=>keyOf(p.productId,p.sizeGrams,p.grindCode)===keyOf(productId,sizeGrams,grindCode)?{...p,quantity}:p)),[save]);
  const remove=useCallback((productId,sizeGrams,grindCode)=>save(old=>old.filter(p=>keyOf(p.productId,p.sizeGrams,p.grindCode)!==keyOf(productId,sizeGrams,grindCode))),[save]);
  const clear=useCallback(()=>save([]),[save]);
  const count=items.reduce((total,item)=>total+item.quantity,0);
  const value=useMemo(()=>({items,count,add,update,remove,clear}),[items,count,add,update,remove,clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart(){const value=useContext(CartContext);if(!value)throw new Error('CartProvider missing');return value}
