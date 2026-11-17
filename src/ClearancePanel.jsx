import React,{useEffect,useMemo,useState} from 'react';
import {registeredClearanceRefs,inspectRegisteredClearance} from './registeredClearance.js';
import './clearancePanel.css';

export default function ClearancePanel({config,manufacturing}) {
  const refs=useMemo(()=>registeredClearanceRefs(manufacturing),[manufacturing]);
  const [moving,setMoving]=useState(''),[fixed,setFixed]=useState('');
  const [margin,setMargin]=useState(5),[result,setResult]=useState(null);
  useEffect(()=>{setResult(null);},[config,moving,fixed,margin]);
  const inspect=()=>{
    try {setResult({value:inspectRegisteredClearance(config,moving,fixed,margin)});}
    catch(error){setResult({error:error instanceof Error?error.message:'CLEARANCE_CHECK_FAILED'});}
  };
  return <details className="clearance-review">
    <summary>Геометрический контроль зазора между узлами</summary>
    <p className="helper">Используются непосредственно 3D-оболочки каркаса, опор и наполнения из производственного реестра. Это проверка двух элементов в текущей статической позе, а не испытание механизма.</p>
    <div className="clearance-review-grid">
      <label>Первый узел<select aria-label="Первый узел для контроля зазора" value={moving} onChange={e=>setMoving(e.target.value)}><option value="">Выбрать узел</option>{refs.map(ref=><option value={ref} key={ref}>{ref}</option>)}</select></label>
      <label>Второй узел<select aria-label="Второй узел для контроля зазора" value={fixed} onChange={e=>setFixed(e.target.value)}><option value="">Выбрать узел</option>{refs.map(ref=><option value={ref} key={ref}>{ref}</option>)}</select></label>
      <label>Контрольная зона, мм<input type="number" min="0" max="100" step="1" aria-label="Контрольная зона в миллиметрах" value={margin} onChange={e=>setMargin(Number(e.target.value))}/></label>
      <button type="button" className="button outline" disabled={!moving||!fixed||moving===fixed} onClick={inspect}>Проверить оболочки</button>
    </div>
    {result?.error&&<p role="alert" className="inline-warning">Проверка заблокирована: {result.error}</p>}
    {result?.value&&<div className="clearance-review-result" role="status">
      <strong>{result.value.status==='sample-clear'?'Пересечение двух оболочек не обнаружено':'Обнаружено пересечение или недостаточная зона зазора'}</strong>
      <p>{result.value.movingRef} ↔ {result.value.stationaryRef} · {result.value.inspectedPairs} пара · {result.value.issues.map(x=>x.status==='overlap'?'пересечение':'пограничная зона').join(', ')||'без замечаний на выбранной позе'}.</p>
      <p>Выпуск в производство: заблокирован. Контакт элементов может быть предусмотрен сборкой; механизм движения, непрерывные столкновения, допуски и нагрузки не проверены.</p>
    </div>}
  </details>;
}
