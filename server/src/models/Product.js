import mongoose from 'mongoose';
const copy = { en: { type: String, required: true, trim: true }, ar: { type: String, default: '', trim: true } };
const productSchema = new mongoose.Schema({
  name: copy,
  slug: { type: String, required: true, immutable: true },
  description: { en: { type: String, default: '' }, ar: { type: String, default: '' } },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  pricePiastres: { type: Number, required: true, min: 1 },
  compareAtPiastres: { type: Number, default: null, min: 1 },
  stockQuantity: { type: Number, required: true, min: 0 },
  featured: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  // R2 references can only be set by a future verified media upload service.
  imageKeys: { type: [String], default: [] },
  revision: { type: Number, default: 0 },
}, { timestamps: true, strict: 'throw' });
productSchema.index({ slug: 1 }, { unique: true });
productSchema.index({ status: 1, categoryId: 1, createdAt: -1 });
productSchema.index({ status: 1, featured: 1, createdAt: -1 });
productSchema.path('compareAtPiastres').validate(function (price) { return price == null || price > this.pricePiastres; }, 'Compare-at price must exceed selling price.');
export default mongoose.model('Product', productSchema);
