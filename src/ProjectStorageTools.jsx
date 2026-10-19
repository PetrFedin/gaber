import React,{useRef,useState} from 'react';
import {exportProjectBackup,lastRecoveryBackup,prepareProjectImport,prepareProjectRecovery,applyProjectRecovery,IMPORT_MAX_BYTES} from './storage.js';

export default function ProjectStorageTools({projects,onSaved,onDownload}){
 const [preview,setPreview]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef(0);
 // A preview is valid only for the list that was inspected.
 const currentPreview=preview?.source===projects?preview:null;
 function fail(error){setPreview(null);setMessage(error instanceof Error?error.message:'Операция не выполнена.');}
 function exportAll(){try{onDownload('gaber-projects-backup.json',exportProjectBackup());setMessage('Резервная копия подготовлена для скачивания.');}catch(error){fail(error);}}
 function exportLast(){try{const backup=lastRecoveryBackup();if(!backup)throw Error('Резервных копий восстановления пока нет.');onDownload('gaber-before-recovery.json',backup);setMessage('Копия перед последним восстановлением подготовлена для скачивания.');}catch(error){fail(error);}}
 function inspectRepair(){request.current++;setBusy(false);try{setPreview({source:projects,plan:prepareProjectRecovery(projects)});setMessage('Проверьте результат перед применением.');}catch(error){fail(error);}}
 async function inspectFile(event){
  const file=event.currentTarget.files?.[0];event.currentTarget.value='';if(!file)return;
  const ticket=++request.current;setBusy(true);setPreview(null);setMessage('Проверка файла…');
  try{
   if(file.size>IMPORT_MAX_BYTES)throw Error('Размер файла превышает 10 МБ.');
   const input=await file.text();if(ticket!==request.current)return;
   const plan=prepareProjectImport(input,projects);setPreview({source:projects,plan});setMessage('Файл проверен. Существующие проекты не будут заменены.');
  }catch(error){if(ticket===request.current)fail(error);}finally{if(ticket===request.current)setBusy(false);}
 }
 function cancel(){request.current++;setPreview(null);setBusy(false);setMessage('Изменения не применены.');}
 function apply(){
  if(!currentPreview)return;
  try{const saved=applyProjectRecovery(currentPreview.plan,projects);setPreview(null);onSaved(saved);setMessage('Список сохранён. Исходные данные оставлены в резервной копии.');}catch(error){fail(error);}
 }
 return <section className="project-storage" aria-label="Резервные копии и восстановление">
  <div><h2>Резервные копии проектов</h2><p>JSON-копия переносит проекты между браузерами. Импорт добавляет варианты без замены существующих ID.</p></div>
  <div className="project-storage-actions">
   <button className="button outline" onClick={exportAll}>Скачать все проекты</button>
   <label className="project-import-label">Импорт JSON<input type="file" accept="application/json,.json" aria-label="Импорт проектов из JSON" disabled={busy} onChange={inspectFile}/></label>
   <button className="text-button" disabled={busy} onClick={inspectRepair}>Проверить восстановление</button>
   <button className="text-button" onClick={exportLast}>Скачать копию до восстановления</button>
  </div>
  {message&&<p role="status">{message}</p>}
  {currentPreview&&<div className="project-recovery-preview">
   <h3>{currentPreview.plan.kind==='repair'?'Восстановление списка':'Проверка импорта'}</h3>
   <p>Сохранятся текущие проекты: {currentPreview.plan.retained}. Добавятся: {currentPreview.plan.added}. Итого: {currentPreview.plan.total}.</p>
   {currentPreview.plan.kind==='repair'&&<p>{currentPreview.plan.rejected===null?'Исходный список не читается; рабочий список будет пустым.':`Из рабочего списка будут исключены записи: ${currentPreview.plan.rejected}.`} Их исходные данные останутся в резервной копии.</p>}
   <p>Перед применением приложение сохранит отдельную копию исходных данных в этом браузере. Рекомендуем также скачать её файлом.</p>
   <div className="project-storage-actions"><button className="button dark" onClick={apply}>Применить с резервной копией</button><button className="button outline" onClick={cancel}>Отмена</button></div>
  </div>}
 </section>;
}
