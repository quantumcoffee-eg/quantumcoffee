// Grind identifiers are shared with the client. A size's price is independent of preparation.
export const PREPARATION_CODES = Object.freeze([
  'whole_beans', 'espresso', 'moka_pot', 'french_press', 'filter', 'turkish_plain', 'turkish_spiced'
]);
export const DEFAULT_SIZE_GRAMS = 250;
export const MAX_SIZES = 12;
export const MAX_STOCK = 100000;
export function totalVariantStock(sizes) {
  return sizes.reduce((sum, size) => sum + size.grindOptions.reduce((n,g) => n + g.stockQuantity, 0), 0);
}
export function summaryFromSizes(sizes) {
  const ordered = [...sizes].sort((a,b) => a.pricePiastres - b.pricePiastres || a.grams - b.grams);
  const cheapest = ordered[0];
  return {pricePiastres:cheapest?.pricePiastres ?? 0,
    compareAtPiastres:cheapest?.compareAtPiastres ?? null,
    stockQuantity:totalVariantStock(sizes)};
}
// Read-only migration view for any pre-size products; never silently erase old options.
export function currentSizes(product) {
  if (Array.isArray(product?.sizes) && product.sizes.length) return product.sizes;
  if (Array.isArray(product?.grindOptions) && product.grindOptions.length) return [{
    grams:product.packGrams || DEFAULT_SIZE_GRAMS,pricePiastres:product.pricePiastres,
    compareAtPiastres:product.compareAtPiastres ?? null,grindOptions:product.grindOptions
  }];
  return [];
}
