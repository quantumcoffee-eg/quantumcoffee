import { CommerceError } from './checkout.js';
import { MAX_STOCK } from '../catalog/grinds.js';

// Shared with the existing admin editor: a stale stock form must never replace
// a reservation/restock committed since that form's revision was read.
export function saveProductAtRevision(Product, { id, revision, values }) {
  const fields = ['name','description','categoryId','pricePiastres','compareAtPiastres','stockQuantity','sizes','featured','status'];
  return Product.findOneAndUpdate({ _id: id, revision }, { $set: Object.fromEntries(fields.map(key => [key, values[key]])), $unset: { packGrams: '', grindOptions: '' }, $inc: { revision: 1 } }, { new: true, runValidators: true });
}

export async function loadCartLines(items, { Product, Category }, session = null) {
  const products = await Product.find({ _id: { $in: items.map(item => item.productId) } }).session(session).lean();
  const categories = await Category.find({ _id: { $in: products.map(product => product.categoryId) }, active: true }).select('_id').session(session).lean();
  const allowed = new Set(categories.map(category => String(category._id)));
  const lookup = new Map(products.filter(product => allowed.has(String(product.categoryId))).map(product => [String(product._id), product]));
  return items.map(item => ({ product: lookup.get(item.productId), quantity: item.quantity, grindCode: item.grindCode, sizeGrams: item.sizeGrams }));
}

function inventoryVariant(product, line) {
  const identities = new Set();
  let total = 0, target = null;
  for (const size of product?.sizes || []) for (const variant of size.grindOptions || []) {
    const identity = `${size.grams}:${variant.code}`;
    if (identities.has(identity) || !Number.isSafeInteger(variant.stockQuantity) || variant.stockQuantity < 0 || variant.stockQuantity > MAX_STOCK) throw new CommerceError('Inventory requires review before this operation can continue.', 'INVENTORY_INCONSISTENT', 409);
    identities.add(identity); total += variant.stockQuantity;
    if (size.grams === line.packGrams && variant.code === line.grindCode) target = variant;
  }
  if (!target || !Number.isSafeInteger(total) || total !== product.stockQuantity || !Number.isSafeInteger(product.revision)) throw new CommerceError('Inventory requires review before this operation can continue.', 'INVENTORY_INCONSISTENT', 409);
  return target;
}

export async function adjustInventory(lines, direction, Product, session) {
  if (![1, -1].includes(direction) || !Array.isArray(lines) || !lines.length || lines.length > 20) throw new CommerceError('Order inventory requires manual review.', 'RESTOCK_FAILED', 409);
  const identities = new Set();
  // Stable acquisition order reduces conflicts on multi-product carts.
  const ordered = [...lines].sort((a, b) => `${a.productId}:${a.packGrams}:${a.grindCode}`.localeCompare(`${b.productId}:${b.packGrams}:${b.grindCode}`));
  for (const line of ordered) {
    const identity = `${line.productId}:${line.packGrams}:${line.grindCode}`;
    if (identities.has(identity) || !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) throw new CommerceError('Order inventory requires manual review.', 'RESTOCK_FAILED', 409);
    identities.add(identity);
    const product = await Product.findById(line.productId).session(session).lean();
    if (!product) throw new CommerceError('The original product is unavailable for inventory reconciliation.', 'RESTOCK_FAILED', 409);
    const variant = inventoryVariant(product, line);
    const reserving = direction === -1;
    if (reserving && (product.status !== 'published' || variant.stockQuantity < line.quantity)) throw new CommerceError('Stock changed. Refresh your cart.', 'OUT_OF_STOCK', 409);
    if (!reserving && variant.stockQuantity > MAX_STOCK - line.quantity) throw new CommerceError('Restocking would exceed the inventory limit. Review the product first.', 'RESTOCK_FAILED', 409);
    const bounds = reserving ? { $gte: line.quantity } : { $lte: MAX_STOCK - line.quantity };
    const changed = await Product.updateOne({ _id: product._id, revision: product.revision,
      ...(reserving ? { status: 'published', stockQuantity: { $gte: line.quantity } } : {}),
      sizes: { $elemMatch: { grams: line.packGrams, grindOptions: { $elemMatch: { code: line.grindCode, stockQuantity: bounds } } } },
    }, { $inc: { stockQuantity: direction * line.quantity, 'sizes.$[s].grindOptions.$[g].stockQuantity': direction * line.quantity, revision: 1 } },
    { session, arrayFilters: [{ 's.grams': line.packGrams }, { 'g.code': line.grindCode, 'g.stockQuantity': bounds }] });
    if (changed.modifiedCount !== 1) throw new CommerceError('Inventory changed. Refresh before trying again.', 'INVENTORY_CONFLICT', 409);
  }
}
