import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const CartContext=createContext(null);
const KEY='quantum-coffee-cart-v1';
const maxItems=20;
function validated(contents){
  if(!Array.isArray(contents))return [];
  const seen=new Set();
  return contents.filter(item=>{
    if(!item||typeof item.productId!=='string'||!/^[a-f0-9]{24}$/i.test(item.productId)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>20||seen.has(item.productId.toLowerCase()))return false;
    seen.add(item.productId.toLowerCase());return true;
  }).slice(0,maxItems).map(item=>({productId:item.productId.toLowerCase(),quantity:item.quantity}));
}
function initialCart(){try{return validated(JSON.parse(localStorage.getItem(KEY)||'[]'))}catch{return []}}
export function CartProvider({children}){
  const [items,setItems]=useState(initialCart);
  const save=useCallback(next=>{setItems(old=>{const result=validated(typeof next==='function'?next(old):next);try{localStorage.setItem(KEY,JSON.stringify(result))}catch{/* Browser storage unavailable. Keep current tab usable. */}return result})},[]);
  const add=useCallback((productId,quantity=1)=>{
    if(typeof productId!=='string'||!/^[a-f0-9]{24}$/i.test(productId)||!Number.isInteger(quantity)||quantity<1||quantity>20)return false;
    const existing=items.find(p=>p.productId===productId.toLowerCase());
    if ((!existing&&items.length>=maxItems)||(existing&&existing.quantity>=20))return false;
    save(old=>{const previous=old.find(p=>p.productId===productId.toLowerCase());if(previous)return old.map(p=>p.productId===previous.productId?{...p,quantity:Math.min(20,p.quantity+quantity)}:p);return old.length>=maxItems?old:[...old,{productId:productId.toLowerCase(),quantity}]});return true;
  },[save,items]);
  const update=useCallback((id,quantity)=>save(old=>old.map(p=>p.productId===id?{...p,quantity}:p)),[save]);
  const remove=useCallback(id=>save(old=>old.filter(p=>p.productId!==id)),[save]);
  const clear=useCallback(()=>save([]),[save]);
  const count=items.reduce((total,item)=>total+item.quantity,0);
  const value=useMemo(()=>({items,count,add,update,remove,clear}),[items,count,add,update,remove,clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart(){const value=useContext(CartContext);if(!value)throw new Error('CartProvider missing');return value}
