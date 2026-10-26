import mongoose from 'mongoose';
import { defaultStoreSettings } from '../store/settings-values.js';
const storeSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'quantum-storefront' },
  revision: { type: Number, default: 0 },
  // Persist a fully validated business settings object, not SMTP/R2/secrets.
  ...Object.fromEntries(Object.entries(defaultStoreSettings()).map(([key]) => [key, {type:mongoose.Schema.Types.Mixed, required:true}])),
}, { timestamps:true, strict:'throw', minimize:false });
export default mongoose.model('StoreSettings', storeSettingsSchema);
