import { useState } from 'react';
import { api } from '../lib/api.js';

const MAX = 5 * 1024 * 1024;
const TYPES = ['image/jpeg','image/png','image/webp'];
export default function MediaEditor({kind,record,onChange,onRefresh}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const isProduct=kind==='product';
  const keys=isProduct?record.imageKeys||[]:(record.imageKey?[record.imageKey]:[]);
  const urls=isProduct?record.imageUrls||[]:(record.imageUrl?[record.imageUrl]:[]);
  const route=isProduct?`/admin/catalog/products/${record._id}/images`:`/admin/catalog/categories/${record._id}/image`;
  const attach=async(nextKeys)=>{
    const body=isProduct?{revision:record.revision,imageKeys:nextKeys}:{revision:record.revision,imageKey:nextKeys[0]||null};
    const response=await api(route,{method:'PATCH',body});
    const updated=isProduct?response.product:response.category;
    onChange(updated);await onRefresh();
  };
  const upload=async(file)=>{
    if(!file)return;
    if(!TYPES.includes(file.type)||file.size===0||file.size>MAX)throw new Error('Choose JPEG, PNG or WebP under 5 MB.');
    if(isProduct&&keys.length>=24)throw new Error('Maximum 24 product images.');
    const intent=await api('/admin/media/intent',{method:'POST',body:{contentType:file.type,size:file.size}});
    const put=await fetch(intent.url,{method:'PUT',headers:intent.headers,body:file});
    if(!put.ok)throw new Error(`R2 upload failed (${put.status}). Check the bucket CORS configuration.`);
    const confirmed=await api(`/admin/media/${intent.id}/confirm`,{method:'POST'});
    await attach(isProduct?[...keys,confirmed.image.key]:[confirmed.image.key]);
  };
  async function handleFiles(event){const selected=Array.from(event.target.files||[]);event.target.value='';if(!selected.length)return;setBusy(true);setError('');setNotice('');
    try{for(const f of selected)await upload(f);setNotice('Image uploaded and attached.');}
    catch(e){setError(e.message);if(e.message.includes('changed'))await onRefresh()}
    finally{setBusy(false)}
  }
  async function changeGallery(next){setBusy(true);setError('');setNotice('');try{await attach(next);setNotice('Gallery saved.')}catch(e){setError(e.message)}finally{setBusy(false)}}
  const move=(index,offset)=>{const next=[...keys];const other=index+offset;if(other<0||other>=next.length)return;[next[index],next[other]]=[next[other],next[index]];void changeGallery(next)};
  return <div className="qc-admin-media">
    <h4>{isProduct?'Product gallery':'Category image'}</h4>
    <p>Save {isProduct?'the product draft':'the category'} first, then upload images. First product image is the main image.</p>
    <div className="qc-admin-media-grid">{keys.map((key,index)=><div className="qc-admin-media-item" key={key}>
      {urls[index]?<img src={urls[index]} alt={`${kind} ${index+1}`}/>:<div className="qc-admin-media-fallback">Image {index+1}</div>}
      <div className="qc-admin-media-actions">{isProduct&&<><button disabled={busy||index===0} type="button" onClick={()=>move(index,-1)} aria-label="Move image earlier">←</button><button disabled={busy||index===keys.length-1} type="button" onClick={()=>move(index,1)} aria-label="Move image later">→</button></>}
        <button disabled={busy} type="button" onClick={()=>changeGallery(keys.filter((_,i)=>i!==index))}>Remove</button></div>
    </div>)}</div>
    <label className="qc-admin-upload-label">{busy?'Uploading…':`Upload ${isProduct?'images':'image'}`}
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple={false} disabled={busy} onChange={handleFiles}/>
    </label>
    {error&&<p className="qc-admin-error" role="alert">{error}</p>}{notice&&<p role="status" className="qc-admin-notice">{notice}</p>}
  </div>;
}
