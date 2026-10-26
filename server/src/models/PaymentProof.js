import mongoose from 'mongoose';
const schema=new mongoose.Schema({
  orderId:{type:mongoose.Schema.Types.ObjectId,required:true,ref:'Order',immutable:true},
  key:{type:String,required:true,unique:true,immutable:true},
  verifiedKey:{type:String,default:null},
  contentType:{type:String,required:true,enum:['image/jpeg','image/png','image/webp'],immutable:true},
  size:{type:Number,required:true,min:1,max:5*1024*1024,immutable:true},
  state:{type:String,enum:['pending','submitted','approved','rejected'],default:'pending'},
  expiresAt:{type:Date,required:true,immutable:true},
  submittedAt:{type:Date,default:null},
  reviewedAt:{type:Date,default:null},
  reviewedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},
  reason:{type:String,default:'',maxlength:300},
  freezeCandidateKey:{type:String,default:null},
  freezeAttempts:{type:[new mongoose.Schema({key:{type:String,required:true},startedAt:{type:Date,required:true},copiedAt:{type:Date,default:null}},{_id:false,strict:'throw'})],default:[]}
},{timestamps:true,strict:'throw'});
schema.index({orderId:1,createdAt:-1});
schema.index({state:1,expiresAt:1});
export default mongoose.model('PaymentProof',schema);
