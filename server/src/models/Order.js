import mongoose from 'mongoose';

const lineSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  slug: { type: String, required: true },
  name: { en: { type: String, required: true }, ar: { type: String, default: '' } },
  imageKey: { type: String, default: null },
  grindCode: { type: String, required: true, immutable: true },
  packGrams: { type: Number, required: true, min: 1, max: 50000, immutable: true },
  quantity: { type: Number, required: true, min: 1, max: 20 },
  unitPricePiastres: { type: Number, required: true, min: 1 },
  lineTotalPiastres: { type: Number, required: true, min: 1 },
}, { _id:false, strict:'throw' });
const historySchema = new mongoose.Schema({ status: {type:String,required:true}, at:{type:Date,required:true}, by:{type:mongoose.Schema.Types.ObjectId,default:null} }, { _id:false });
const orderSchema = new mongoose.Schema({
  orderNumber: { type:String, required:true, unique:true, immutable:true },
  checkoutKey: { type:String, required:true, unique:true, immutable:true },
  requestFingerprint: { type:String, required:true, immutable:true },
  userId: { type:mongoose.Schema.Types.ObjectId, ref:'User', default:null, immutable:true },
  customer: {
    name:{type:String,required:true},phone:{type:String,required:true},email:{type:String,default:''},
    governorate:{type:String,required:true},city:{type:String,required:true},street:{type:String,required:true},details:{type:String,default:''}
  },
  lines: { type:[lineSchema], required:true },
  subtotalPiastres: { type:Number, required:true, min:1 },
  shippingPiastres: { type:Number, required:true, min:0 },
  totalPiastres: { type:Number, required:true, min:1 },
  paymentMethod: { type:String, enum:['cod','instapay','vodafone_cash'], required:true, immutable:true },
  paymentState: { type:String, enum:['unpaid','awaiting_transfer','awaiting_verification','paid','rejected','refunded'], required:true },
  fulfillmentState: { type:String, enum:['received','confirmed','packing','shipped','delivered','cancelled'], default:'received' },
  history: { type:[historySchema], default:[] },
  paymentProofId: { type: mongoose.Schema.Types.ObjectId, ref:'PaymentProof', default:null },
  paymentHistory: { type:[new mongoose.Schema({state:{type:String,required:true},at:{type:Date,required:true},by:{type:mongoose.Schema.Types.ObjectId,default:null},reason:{type:String,default:''},eventId:{type:mongoose.Schema.Types.ObjectId}},{_id:false})], default:[] },
  revision:{type:Number,default:0},
}, {timestamps:true,strict:'throw'});
orderSchema.index({userId:1,createdAt:-1});
orderSchema.index({'customer.phone':1,orderNumber:1});
orderSchema.index({createdAt:-1,_id:-1});
export default mongoose.model('Order',orderSchema);
