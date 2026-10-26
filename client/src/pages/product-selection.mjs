export function initialSelection(product) {
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  const available = sizes.find(size => size.grindOptions?.some(grind => grind.stockQuantity > 0));
  const size = available || sizes[0];
  const grind = size?.grindOptions?.find(option => option.stockQuantity > 0) || size?.grindOptions?.[0];
  return { sizeGrams: size?.grams || 0, grindCode: grind?.code || '' };
}
export function selectedStock(product, sizeGrams, grindCode) {
  return product?.sizes?.find(size => size.grams === sizeGrams)?.grindOptions?.find(grind => grind.code === grindCode)?.stockQuantity || 0;
}
