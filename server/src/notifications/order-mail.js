import OrderMail from '../models/OrderMail.js';
import {databaseReady} from '../db/connect.js';
import {makeMailTransport} from '../mailer.js';
import {orderMailContent} from './order-mail-content.js';
import {notificationDocuments,orderEmailIssues} from './order-mail-values.js';

const MAX_ATTEMPTS=5;
const MAX_PER_TICK=5;
const TWO_MINUTES=2*60*1000;
const queueEnabled = (env=process.env) => env.ORDER_EMAILS_ENABLED==='true';
export async function queueOrderMail(kind,order,session,{model=OrderMail,env=process.env}={}) {
  if (!queueEnabled(env)) return;
  const docs=notificationDocuments(kind,order,env);
  if (!docs.length) return;
  await model.bulkWrite(docs.map(item=>({updateOne:{filter:{dedupeKey:item.dedupeKey},update:{$setOnInsert:item},upsert:true}})), {ordered:true,...(session?{session}:{})});
}
// Queuing errors are logged, but must not turn a committed payment/fulfillment
// operation into a misleading HTTP error that encourages customers to retry.
export async function queueOrderMailSafely(kind,order) {
  try {await queueOrderMail(kind,order)}
  catch (error) {console.error('Quantum order-email queue error:',error?.code||error?.name||'QUEUE_ERROR')}
}

export async function processOrderMailBatch({env=process.env,sendMail}={}) {
  if (!queueEnabled(env) || !databaseReady()) return {processed:0};
  if (orderEmailIssues(env).length) throw new Error('Order notification settings are incomplete.');
  const sender=sendMail?{sendMail}:makeMailTransport(env);
  let processed=0;
  for(let i=0;i<MAX_PER_TICK;i++){
    const now=new Date();
    const claim=await OrderMail.findOneAndUpdate({$or:[
      {state:'pending',nextAttemptAt:{$lte:now}},
      {state:'sending',lockUntil:{$lt:now}},
    ],attempts:{$lt:MAX_ATTEMPTS}},
    {$set:{state:'sending',lockUntil:new Date(now.getTime()+60_000)},$inc:{attempts:1}},
    {new:true,sort:{createdAt:1}}).lean();
    if(!claim)break;
    processed++;
    try{
      const content=orderMailContent({...claim,siteOrigin:env.PUBLIC_SITE_ORIGIN});
      await sender.sendMail({from:env.MAIL_FROM,replyTo:env.MAIL_REPLY_TO||undefined,to:claim.to,...content,disableFileAccess:true,disableUrlAccess:true});
      await OrderMail.updateOne({_id:claim._id,state:'sending'},{$set:{state:'sent',sentAt:new Date(),lockUntil:null,lastError:'',expiresAt:new Date(Date.now()+90*24*60*60*1000)}});
    }catch(error){
      const tries=claim.attempts;
      const delay=Math.min(60*60*1000,30_000*2**(tries-1));
      await OrderMail.updateOne({_id:claim._id,state:'sending'},{$set:{state:tries>=MAX_ATTEMPTS?'dead':'pending',lockUntil:null,nextAttemptAt:new Date(Date.now()+delay),lastError:String(error?.code||error?.name||'SMTP_ERROR').slice(0,60)}});
    }
  }
  return {processed};
}
export function startOrderMailWorker(env=process.env) {
  if (!queueEnabled(env))return ()=>{};
  if (orderEmailIssues(env).length) throw new Error(orderEmailIssues(env).join(' '));
  let running=false;
  const tick=async()=>{
    if(running)return;
    running=true;
    try{await processOrderMailBatch({env})}catch(error){console.error('Quantum order-email worker:',error?.code||error?.name||'WORKER_ERROR')}
    finally{running=false}
  };
  void tick();
  const timer=setInterval(()=>void tick(),TWO_MINUTES);
  timer.unref?.();
  return ()=>clearInterval(timer);
}
