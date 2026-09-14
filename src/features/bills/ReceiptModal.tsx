import { useRef, useState } from 'react'
import { Download, FilePlus2, Paperclip, Trash2 } from 'lucide-react'
import Modal from '@/components/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { BillInstallment } from '@/types'

export default function ReceiptModal({installment,open,onClose,onChanged}:{installment:BillInstallment|null;open:boolean;onClose:()=>void;onChanged:()=>void}){
  const {user}=useAuth();const input=useRef<HTMLInputElement>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('')
  if(!installment)return null
  async function upload(file:File){if(!user)return;setBusy(true);setError('');const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${user.id}/${installment!.id}/${crypto.randomUUID()}-${safe}`;const up=await supabase.storage.from('receipts').upload(path,file,{upsert:false});if(up.error){setError(up.error.message);setBusy(false);return}const ins=await supabase.from('attachments').insert({installment_id:installment!.id,file_name:file.name,file_path:path,mime_type:file.type||null,size_bytes:file.size});if(ins.error)setError(ins.error.message);else onChanged();setBusy(false)}
  async function openFile(path:string){const {data,error:e}=await supabase.storage.from('receipts').createSignedUrl(path,60);if(e)setError(e.message);else window.open(data.signedUrl,'_blank','noopener,noreferrer')}
  async function remove(id:string,path:string){if(!confirm('Remover este comprovante?'))return;await supabase.storage.from('receipts').remove([path]);const {error:e}=await supabase.from('attachments').delete().eq('id',id);if(e)setError(e.message);else onChanged()}
  return <Modal open={open} onClose={onClose} title="Comprovantes">
    <div className="grid gap-4">
      <input ref={input} type="file" className="hidden" accept="image/*,.pdf" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);e.currentTarget.value=''}}/>
      <button className="secondary-button w-full" onClick={()=>input.current?.click()} disabled={busy}><FilePlus2 size={17}/>{busy?'Enviando…':'Anexar comprovante'}</button>
      <div className="grid gap-2">{(installment.attachments??[]).length===0?<div className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted"><Paperclip className="mx-auto mb-2" size={22}/>Nenhum comprovante anexado.</div>:(installment.attachments??[]).map(a=><div key={a.id} className="flex items-center gap-3 rounded-2xl border border-line p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-ink">{a.file_name}</p><p className="text-xs text-muted">{a.size_bytes?`${(a.size_bytes/1024).toFixed(0)} KB`:'Arquivo'}</p></div><button className="icon-button" onClick={()=>void openFile(a.file_path)} title="Abrir"><Download size={16}/></button><button className="icon-button text-danger" onClick={()=>void remove(a.id,a.file_path)} title="Excluir"><Trash2 size={16}/></button></div>)}</div>
      {error&&<p className="rounded-xl bg-[#fff2f2] px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  </Modal>
}
