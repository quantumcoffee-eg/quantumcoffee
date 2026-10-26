import mongoose from 'mongoose';

const orderMailSchema = new mongoose.Schema({
  dedupeKey: {type:String,required:true,unique:true,immutable:true},
  to: {type:String,required:true,immutable:true},
  audience: {type:String,enum:['customer','admin'],required:true,immutable:true},
  kind: {type:String,enum:['placed','fulfillment','proof_submitted','payment','refund_recorded'],required:true,immutable:true},
  orderNumber: {type:String,required:true,immutable:true},
  fulfillmentState: {type:String,required:true,immutable:true},
  paymentState: {type:String,required:true,immutable:true},
  totalPiastres: {type:Number,required:true,immutable:true},
  monetaryEventId: {type:mongoose.Schema.Types.ObjectId,immutable:true},
  monetaryAmountPiastres: {type:Number,min:1,max:1000000000,validate:Number.isSafeInteger,immutable:true},
  state: {type:String,enum:['pending','sending','sent','dead'],default:'pending'},
  attempts: {type:Number,default:0},
  nextAttemptAt: {type:Date,default:Date.now},
  lockUntil: {type:Date,default:null},
  sentAt: {type:Date,default:null},
  lastError: {type:String,default:''},
  expiresAt: {type:Date,default:null},
}, {timestamps:true,strict:'throw'});
orderMailSchema.index({state:1,nextAttemptAt:1});
orderMailSchema.index({expiresAt:1},{expireAfterSeconds:0});
export default mongoose.model('OrderMail',orderMailSchema);
