import nodemailer from 'nodemailer';
// Transport factory only: mail sending is NOT enabled during scaffold phase.
export function makeMailTransport(env=process.env){
 if(!env.SMTP_HOST||!env.SMTP_USER||!env.SMTP_PASSWORD||!env.MAIL_FROM) return null;
 const port=Number(env.SMTP_PORT||587);
 if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid SMTP port');
 return nodemailer.createTransport({host:env.SMTP_HOST,port,secure:env.SMTP_SECURE==='true'||port===465,auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}});
}
