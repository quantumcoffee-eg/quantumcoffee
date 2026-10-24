import mongoose from 'mongoose';
import { PREPARATION_CODES } from '../catalog/grinds.js';
const copy = { en: { type: String, required: true, trim: true }, ar: { type: String, default: '', trim: true } };
const productSchema = new mongoose.Schema({
  name: copy,
  slug: { type: String, required: true, immutable: true },
  description: { en: { type: String, default: '' }, ar: { type: String, default: '' } },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  // Denormalized lowest price and total stock for catalog sorting/filtering.
  pricePiastres: { type:Number,required:true,min:1 },
  compareAtPiastres: { type:Number,default:null,min:1 },
  stockQuantity: { type:Number,required:true,min:0 },
  sizes: { type:[new mongoose.Schema({
    grams:{type:Number,required:true,min:1,max:50000},
    pricePiastres:{type:Number,required:true,min:1},
    compareAtPiastres:{type:Number,default:null,min:1},
    grindOptions:{type:[new mongoose.Schema({
      code:{type:String,enum:PREPARATION_CODES,required:true},
      stockQuantity:{type:Number,required:true,min:0,max:100000},
    },{_id:false,strict:'throw'})],default:[]}
  },{_id:false,strict:'throw'})],default:[] },
  // Legacy read compatibility only, to avoid destroying old 250g drafts on edit.
  packGrams:{type:Number,default:undefined},
  grindOptions:{type:[new mongoose.Schema({
    code:{type:String,enum:PREPARATION_CODES},stockQuantity:{type:Number,min:0}
  },{_id:false})],default:undefined},
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
