import useAdminList from '../../hooks/useAdminList.js'
import { useState } from 'react'
import useAsyncAction from '../../hooks/useAsyncAction.js'
import ActionMessage from '../common/ActionMessage.jsx'
import { adminWrite } from '../../services/admin.js'
import { Field,Select,Collection,Record,buttonClass } from './AdminShared.jsx'
export default function CategoryManager(){
  const resource=useAdminList('categories'),action=useAsyncAction();const [edit,setEdit]=useState(null)
  const submit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget));data.active=data.active==='true';action.run(async()=>{await adminWrite(edit?`categories/${edit.id}`:'categories',edit?'PUT':'POST',data);setEdit(null);e.target.reset();resource.retry()},'Categoría guardada.')}
  return <div className="space-y-6"><p className="text-sm text-neo-white/70">Desactivar conserva las relaciones y oculta del catálogo público los productos de esa categoría.</p><form key={edit?.id??'new'} aria-label="Categoría administrativa" onSubmit={submit} className="grid gap-4 rounded-xl border border-neo-violet/30 p-5 sm:grid-cols-2">{!edit&&<Field label="ID único" name="id" required maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*"/>}<Field label="Nombre" name="name" required minLength={2} maxLength={100} defaultValue={edit?.name}/><Select label="Estado" name="active" defaultValue={edit?String(Boolean(edit.active)):'true'}><option value="true">Activa</option><option value="false">Inactiva</option></Select><button disabled={action.loading} className={buttonClass}>Guardar categoría</button>{edit&&<button type="button" className={buttonClass} onClick={()=>setEdit(null)}>Cancelar edición</button>}</form><ActionMessage action={action}/><Collection resource={resource}>{c=><Record key={c.id} title={c.name}><p>{c.id} · {c.active?'Activa':'Inactiva'} · Productos: {c.products}</p><button className={buttonClass} onClick={()=>setEdit(c)}>Editar categoría</button></Record>}</Collection></div>
}
