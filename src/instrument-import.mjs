import {q,one,exec,tx,audit} from './db.mjs';
import {rowsToObjects} from './xlsx.mjs';

const yes=v=>['1','si','sí','true','yes','x'].includes(String(v??'').trim().toLowerCase());
const split=v=>String(v??'').split(/[;,]/).map(x=>x.trim()).filter(Boolean);
const splitOptions=v=>String(v??'').split(/[|;]/).map(x=>x.trim()).filter(Boolean);
const n=(v,d=null)=>{const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:d};
const normCE=v=>String(v??'').trim().replace(/^RA(?=\d+\.)/i,'');
const normRA=v=>{v=String(v??'').trim().toUpperCase();if(/^\d+$/.test(v))v='RA'+v;return v};
const safeJSON=(v,fallback={})=>{if(v===null||v===undefined||String(v).trim()==='')return fallback;try{return typeof v==='object'?v:JSON.parse(v)}catch{return fallback}};
const kindMap={PRUEBA:'exam',EXAMEN:'exam',PORTAFOLIO:'portfolio',ABR:'portfolio',PROYECTO:'portfolio',RUBRICA:'portfolio',LISTA_COTEJO:'portfolio'};
const typeMap={TEST:'choice',MULTISELECT:'multi_choice',VERDADERO_FALSO:'true_false',RESPUESTA_CORTA:'short_text',DESARROLLO:'long_text',NUMERICO:'number',TABLA:'table',ASIENTO_CONTABLE:'journal_entry',FILE_UPLOAD:'long_text',PORTFOLIO_ACTIVITY:'long_text',CHECKLIST:'long_text',RUBRIC_TASK:'long_text'};

function rubricMap(rows){
  const item=new Map(),general=new Map();
  for(const r of rows){const rec={dimensionId:r.dimension_id||'',order:n(r.orden_dimension,0),dimension:r.dimension||'',ceCodes:split(r.ce_codigos).map(normCE),weight:n(r.peso_dimension_pct,0),level:r.nivel||'',value:n(r.valor_nivel,0),descriptor:r.descriptor||'',passed:yes(r.nivel_superado)};const key=String(r.item_id||'').trim();const target=key?item:general,k=key||String(r.instrumento_id||'').trim();if(!target.has(k))target.set(k,[]);target.get(k).push(rec)}
  const build=list=>{const dims=new Map();for(const x of list||[]){if(!dims.has(x.dimensionId))dims.set(x.dimensionId,{id:x.dimensionId,order:x.order,name:x.dimension,ceCodes:x.ceCodes,weight:x.weight,levels:[]});dims.get(x.dimensionId).levels.push({name:x.level,value:x.value,descriptor:x.descriptor,passed:x.passed})}return [...dims.values()].sort((a,b)=>a.order-b.order)};
  return {item:new Map([...item].map(([k,v])=>[k,build(v)])),general:new Map([...general].map(([k,v])=>[k,build(v)]))};
}
function itemConfig(r){
  const cfg=safeJSON(r.config_json,{}),opts=splitOptions(r.opciones);if(opts.length)cfg.options=opts;if(r.tolerancia!==''&&r.tolerancia!==undefined)cfg.tolerance=n(r.tolerancia,.01);if(r.archivo_adjunto_ref)cfg.attachmentRef=r.archivo_adjunto_ref;if(r.criterios_correccion_ia)cfg.aiInstructions=r.criterios_correccion_ia;if(r.feedback_correcto)cfg.feedbackCorrect=r.feedback_correcto;if(r.feedback_incorrecto)cfg.feedbackIncorrect=r.feedback_incorrecto;return cfg;
}
function itemSolution(r,type){const raw=String(r.respuesta_correcta??'').trim();if(!raw)return null;if(type==='multi_choice')return{values:splitOptions(raw)};if(type==='true_false'){const v=raw.toLowerCase();return{value:['verdadero','true','1','si','sí'].includes(v)?'true':['falso','false','0','no'].includes(v)?'false':raw}};if(type==='number')return{value:n(raw,raw)};if(type==='journal_entry'||type==='table'){const j=safeJSON(raw,null);return j===null?{value:raw}:j}return{value:raw}}
function criteriaForOutcome(outcomeId,codes){const all=q('SELECT id,code FROM criteria WHERE outcome_id=?',outcomeId),wanted=new Set(codes.map(normCE));return all.filter(c=>wanted.has(c.code))}

export function importInstrumentWorkbook(groupModuleId,workbook,{replace=true,userId=null}={}){
  const gm=one(`SELECT gm.id,m.id module_id,m.code module_code FROM group_modules gm JOIN modules m ON m.id=gm.module_id WHERE gm.id=?`,groupModuleId);if(!gm)throw new Error('Módulo/grupo no encontrado');
  const instruments=rowsToObjects(workbook.INSTRUMENTOS),items=rowsToObjects(workbook.ITEMS),rubrics=rowsToObjects(workbook.RUBRICAS),phases=rowsToObjects(workbook.ABR_FASES);
  if(!instruments.length)throw new Error('La hoja INSTRUMENTOS no contiene filas para importar');
  const outcomes=q('SELECT id,code,name FROM learning_outcomes WHERE module_id=? ORDER BY sort_order',gm.module_id),outByCode=new Map(outcomes.map(o=>[o.code.toUpperCase(),o]));
  const rub=rubricMap(rubrics),created=[],warnings=[],instrumentTargets=new Map(),itemTargets=new Map();
  tx(()=>{
    for(const r of instruments){
      const ext=String(r.instrumento_id||'').trim();if(!ext){warnings.push('Fila de instrumento sin instrumento_id; omitida.');continue}
      const kind=String(r.tipo_instrumento||'').trim().toUpperCase(),base=kindMap[kind];if(!base){warnings.push(`${ext}: tipo_instrumento no reconocido (${kind}).`);continue}
      const raCodes=split(r.ra_codigos).map(normRA);if(!raCodes.length){warnings.push(`${ext}: falta ra_codigos.`);continue}
      if(r.modulo_codigo&&String(r.modulo_codigo).trim()&&String(r.modulo_codigo).trim()!==String(gm.module_code||''))warnings.push(`${ext}: modulo_codigo ${r.modulo_codigo} no coincide con ${gm.module_code}; se importa en el módulo seleccionado.`);
      for(const rac of raCodes){
        const o=outByCode.get(rac);if(!o){warnings.push(`${ext}: ${rac} no existe en el módulo.`);continue}
        let ins=one('SELECT * FROM instruments WHERE group_module_id=? AND outcome_id=? AND type=?',groupModuleId,o.id,base);if(!ins)throw new Error(`No se encontró el instrumento base ${base} de ${rac}`);
        if(replace)exec('DELETE FROM instrument_items WHERE instrument_id=?',ins.id);
        const cfg={description:r.descripcion||'',modality:r.modalidad||'INDIVIDUAL',maxGrade:n(r.calificacion_max,10),minGrade:n(r.nota_minima,5),weightPct:n(r.peso_instrumento_pct,null),openAt:r.fecha_apertura||null,durationMin:n(r.duracion_min,null),allowFiles:yes(r.permite_archivos),requireTeacherValidation:yes(r.requiere_validacion_docente),useAI:yes(r.usar_ia),aiProfile:r.perfil_ia||'',recoveryPolicy:r.politica_recuperacion||'',requireSeb:yes(r.requiere_seb),sebMode:String(r.seb_modo||'detect').trim().toLowerCase(),sebAllowedVersions:r.seb_versiones||'',source:'xlsx-import-v2.2',externalId:ext,kind};
        exec(`UPDATE instruments SET title=?,instructions=?,published=?,due_at=?,max_attempts=?,feedback_release=?,external_id=?,kind=?,config_json=?,seb_required=?,seb_verification_mode=?,seb_allowed_versions=? WHERE id=?`,r.titulo||`${kind} · ${rac}`,r.instrucciones_alumno||'',String(r.estado||'BORRADOR').toUpperCase()==='PUBLICADO'?1:0,r.fecha_cierre||null,Math.max(1,n(r.intentos,1)),String(r.publicar_feedback||'TRAS_VALIDACION_DOCENTE').toLowerCase(),ext,kind,JSON.stringify({...cfg,rubric:rub.general.get(ext)||[]}),cfg.requireSeb?1:0,['detect','config_key'].includes(cfg.sebMode)?cfg.sebMode:'detect',String(cfg.sebAllowedVersions||''),ins.id);
        const key=`${ext}|${rac}`;instrumentTargets.set(key,{instrumentId:ins.id,outcomeId:o.id,raCode:rac,base,kind});created.push({externalId:ext,raCode:rac,instrumentId:ins.id,kind});
      }
    }
    for(const r of items){
      const extIns=String(r.instrumento_id||'').trim(),extItem=String(r.item_id||'').trim();if(!extIns||!extItem){warnings.push('Ítem sin instrumento_id o item_id; omitido.');continue}
      const matching=[...instrumentTargets.entries()].filter(([k])=>k.startsWith(extIns+'|'));
      if(!matching.length){warnings.push(`${extItem}: instrumento ${extIns} no importado.`);continue}
      const ceCodes=split(r.ce_codigos).map(normCE),itype=typeMap[String(r.tipo_item||'DESARROLLO').toUpperCase()]||'long_text';
      for(const [,t] of matching){const cands=criteriaForOutcome(t.outcomeId,ceCodes);if(ceCodes.length&&!cands.length)continue;const cfg=itemConfig(r);if(['FILE_UPLOAD','PORTFOLIO_ACTIVITY','CHECKLIST','RUBRIC_TASK'].includes(String(r.tipo_item||'').toUpperCase()))cfg.kind=String(r.tipo_item).toUpperCase();const rubric=rub.item.get(extItem)||[];const rr=exec(`INSERT INTO instrument_items(instrument_id,title,prompt,expected_evidence,points,sort_order,item_type,config_json,solution_json,rubric_json,required,auto_correct,seb_required,external_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,t.instrumentId,`${r.orden||''}${r.orden?'. ':''}${String(r.enunciado||'Actividad').slice(0,100)}`,r.enunciado||'',r.criterios_correccion_ia||'',n(r.puntos_max,null),n(r.orden,0),itype,JSON.stringify(cfg),JSON.stringify(itemSolution(r,itype)),rubric.length?JSON.stringify(rubric):null,String(r.obligatorio??'').trim()===''?1:(yes(r.obligatorio)?1:0),yes(r.autocorregible)?1:0,yes(r.requiere_seb)?1:0,extItem);const iid=Number(rr.lastInsertRowid);for(const c of cands)exec('INSERT OR IGNORE INTO item_criteria(item_id,criterion_id)VALUES(?,?)',iid,c.id);itemTargets.set(`${extItem}|${t.raCode}`,iid)}
    }
    for(const r of phases){
      const extIns=String(r.instrumento_id||'').trim(),phase=String(r.fase_id||'').trim();if(!extIns||!phase)continue;const matching=[...instrumentTargets.entries()].filter(([k])=>k.startsWith(extIns+'|'));const ceCodes=split(r.ce_codigos).map(normCE);
      for(const [,t] of matching){if(t.base!=='portfolio')continue;const cands=criteriaForOutcome(t.outcomeId,ceCodes);if(ceCodes.length&&!cands.length)continue;const cfg={kind:'ABR_PHASE',productEvidence:r.producto_evidencia||'',deliveryType:r.tipo_entrega||'MIXTA',modality:r.modalidad||'GRUPAL',deadline:r.fecha_limite||null,reflectionRequired:yes(r.requiere_reflexion),useAI:yes(r.usar_ia),correctionNotes:r.indicaciones_correccion||''};const phaseRubric=rub.item.get(phase)||[];const rr=exec(`INSERT INTO instrument_items(instrument_id,title,prompt,expected_evidence,points,sort_order,item_type,config_json,rubric_json,required,auto_correct,seb_required,external_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,t.instrumentId,`${r.orden||''}${r.orden?'. ':''}${r.fase||'Fase ABR'}`,r.descripcion||'',r.producto_evidencia||'',n(r.puntos_max,null),n(r.orden,0)+1000,'long_text',JSON.stringify(cfg),phaseRubric.length?JSON.stringify(phaseRubric):null,1,0,yes(r.requiere_seb)?1:0,phase);const iid=Number(rr.lastInsertRowid);for(const c of cands)exec('INSERT OR IGNORE INTO item_criteria(item_id,criterion_id)VALUES(?,?)',iid,c.id)}
    }
    if(userId)audit(userId,'import_instruments_xlsx','group_module',groupModuleId,{instruments:created.length,items:items.length,phases:phases.length,warnings:warnings.length});
  });
  return{ok:true,created,warnings,summary:{instrumentTargets:created.length,itemRows:items.length,rubricRows:rubrics.length,abrPhaseRows:phases.length}};
}
