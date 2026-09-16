import {one,q,exec} from './db.mjs';
import {encryptSecret,decryptSecret,maskedSecret} from './secrets.mjs';

function settingsRow(){return one('SELECT * FROM ai_settings WHERE id=1')}
export function initAISettings(){
  let row=settingsRow();if(row)return;
  const envKey=process.env.OPENAI_API_KEY||'';
  const enabled=(process.env.AI_ENABLED??(envKey?'true':'false'))==='true';
  const model=process.env.OPENAI_MODEL||'gpt-5-mini';
  exec(`INSERT INTO ai_settings(id,enabled,provider,api_key_enc,model,fallback_model,monthly_budget,input_cost_per_million,output_cost_per_million,confidence_review_threshold,confidence_block_threshold,data_minimization)
    VALUES(1,?,?,?,?,?,?,?,?,?,?,?)`,enabled?1:0,'openai',envKey?encryptSecret(envKey):null,model,process.env.OPENAI_FALLBACK_MODEL||'',0,0,0,.85,.65,1);
}
export function currentMonthUsage(){
  const row=one(`SELECT COALESCE(SUM(estimated_cost),0) cost,COALESCE(SUM(input_tokens),0) inputTokens,COALESCE(SUM(output_tokens),0) outputTokens,COUNT(*) calls
    FROM ai_usage WHERE strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`);
  return {cost:Number(row?.cost||0),inputTokens:Number(row?.inputTokens||0),outputTokens:Number(row?.outputTokens||0),calls:Number(row?.calls||0)};
}
export function getAIStatus(){
  const r=settingsRow();
  if(!r)return{enabled:false,provider:'openai',model:'gpt-5-mini',hasApiKey:false,keyHint:'',connected:false,usage:currentMonthUsage()};
  let key='';try{key=r.api_key_enc?decryptSecret(r.api_key_enc):''}catch{}
  const usage=currentMonthUsage();
  return{
    enabled:!!r.enabled,provider:r.provider||'openai',model:r.model||'gpt-5-mini',fallbackModel:r.fallback_model||'',hasApiKey:!!key,keyHint:key?maskedSecret(key):'',
    connected:!!r.enabled&&!!key&&r.last_test_status==='ok',lastTestAt:r.last_test_at||null,lastTestStatus:r.last_test_status||null,lastTestMessage:r.last_test_message||null,
    monthlyBudget:Number(r.monthly_budget||0),inputCostPerMillion:Number(r.input_cost_per_million||0),outputCostPerMillion:Number(r.output_cost_per_million||0),
    confidenceReviewThreshold:Number(r.confidence_review_threshold??.85),confidenceBlockThreshold:Number(r.confidence_block_threshold??.65),dataMinimization:!!r.data_minimization,
    autoAcceptHighConfidence:!!r.auto_accept_high_confidence,usage,budgetExceeded:Number(r.monthly_budget||0)>0&&usage.cost>=Number(r.monthly_budget||0)
  };
}
export function updateAISettings(input,userId){
  const r=settingsRow()||{};let enc=r.api_key_enc||null;
  if(input.clearApiKey)enc=null;else if(typeof input.apiKey==='string'&&input.apiKey.trim())enc=encryptSecret(input.apiKey.trim());
  const provider=(input.provider||r.provider||'openai').trim();
  if(provider!=='openai')throw Object.assign(new Error('El proveedor soportado en esta versión es OpenAI'),{status:400});
  const model=(input.model||r.model||'gpt-5-mini').trim();if(!model)throw Object.assign(new Error('Debe indicar un modelo'),{status:400});
  const enabled=input.enabled===undefined?!!r.enabled:!!input.enabled;if(enabled&&!enc)throw Object.assign(new Error('Configure una API key antes de activar la IA'),{status:400});
  const vals={
    fallbackModel:input.fallbackModel??r.fallback_model??'',monthlyBudget:Number(input.monthlyBudget??r.monthly_budget??0),inputCost:Number(input.inputCostPerMillion??r.input_cost_per_million??0),outputCost:Number(input.outputCostPerMillion??r.output_cost_per_million??0),
    review:Number(input.confidenceReviewThreshold??r.confidence_review_threshold??.85),block:Number(input.confidenceBlockThreshold??r.confidence_block_threshold??.65),minimize:input.dataMinimization===undefined?!!r.data_minimization:!!input.dataMinimization,autoAccept:input.autoAcceptHighConfidence===undefined?!!r.auto_accept_high_confidence:!!input.autoAcceptHighConfidence
  };
  if(vals.block<0||vals.block>1||vals.review<0||vals.review>1||vals.block>vals.review)throw Object.assign(new Error('Los umbrales de confianza no son válidos'),{status:400});
  exec(`INSERT INTO ai_settings(id,enabled,provider,api_key_enc,model,fallback_model,monthly_budget,input_cost_per_million,output_cost_per_million,confidence_review_threshold,confidence_block_threshold,data_minimization,auto_accept_high_confidence,updated_at,updated_by)
    VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)
    ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,provider=excluded.provider,api_key_enc=excluded.api_key_enc,model=excluded.model,fallback_model=excluded.fallback_model,monthly_budget=excluded.monthly_budget,input_cost_per_million=excluded.input_cost_per_million,output_cost_per_million=excluded.output_cost_per_million,confidence_review_threshold=excluded.confidence_review_threshold,confidence_block_threshold=excluded.confidence_block_threshold,data_minimization=excluded.data_minimization,auto_accept_high_confidence=excluded.auto_accept_high_confidence,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by`,
      enabled?1:0,provider,enc,model,vals.fallbackModel,vals.monthlyBudget,vals.inputCost,vals.outputCost,vals.review,vals.block,vals.minimize?1:0,vals.autoAccept?1:0,userId||null);
  return getAIStatus();
}
function activeConfig({requireEnabled=true,moduleId=null}={}){
  const r=settingsRow();if(!r)throw Object.assign(new Error('Configuración de IA no inicializada'),{status:503});
  if(requireEnabled&&!r.enabled)throw Object.assign(new Error('La IA está desconectada desde el panel de administración'),{status:503});
  let key='';try{key=r.api_key_enc?decryptSecret(r.api_key_enc):''}catch{throw Object.assign(new Error('No se puede descifrar la API key. Revise AI_ENCRYPTION_KEY.'),{status:503})}
  if(!key)throw Object.assign(new Error('API key de OpenAI no configurada'),{status:503});
  const usage=currentMonthUsage(),budget=Number(r.monthly_budget||0);if(requireEnabled&&budget>0&&usage.cost>=budget)throw Object.assign(new Error('Se ha alcanzado el presupuesto mensual configurado para IA'),{status:429});
  const profile=moduleId?one('SELECT * FROM module_ai_profiles WHERE module_id=?',moduleId):null;
  if(requireEnabled&&profile&&profile.enabled===0)throw Object.assign(new Error('La IA está desactivada para este módulo'),{status:503});
  return{key,model:profile?.model_override||r.model||'gpt-5-mini',fallbackModel:r.fallback_model||'',provider:r.provider||'openai',settings:r,profile};
}
export async function testAIConnection(){
  const {key,model}=activeConfig({requireEnabled:false});let ok=false,message='';
  try{const res=await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`,{headers:{Authorization:`Bearer ${key}`}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data?.error?.message||`OpenAI respondió ${res.status}`);ok=true;message=`Conexión correcta. Modelo accesible: ${data?.id||model}`}
  catch(e){message=e.message||String(e)}
  exec('UPDATE ai_settings SET last_test_at=CURRENT_TIMESTAMP,last_test_status=?,last_test_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=1',ok?'ok':'error',message);
  if(!ok){const e=new Error(message);e.status=502;throw e}return getAIStatus();
}
export function getModuleAIProfile(moduleId){
  const m=one('SELECT id,name,code FROM modules WHERE id=?',moduleId);if(!m)return null;
  const p=one('SELECT * FROM module_ai_profiles WHERE module_id=?',moduleId)||{};
  return{module:m,enabled:p.enabled!==0,instructions:p.instructions||'',levelDescription:p.level_description||'1.º de CFGM',feedbackStyle:p.feedback_style||'claro y didáctico',modelOverride:p.model_override||'',confidenceReview:Number(p.confidence_review??.85),confidenceBlock:Number(p.confidence_block??.65)};
}
export function updateModuleAIProfile(moduleId,input,userId){
  exec(`INSERT INTO module_ai_profiles(module_id,enabled,instructions,level_description,feedback_style,model_override,confidence_review,confidence_block,updated_by)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(module_id) DO UPDATE SET enabled=excluded.enabled,instructions=excluded.instructions,level_description=excluded.level_description,feedback_style=excluded.feedback_style,model_override=excluded.model_override,confidence_review=excluded.confidence_review,confidence_block=excluded.confidence_block,updated_at=CURRENT_TIMESTAMP,updated_by=excluded.updated_by`,
    moduleId,input.enabled===false?0:1,input.instructions||'',input.levelDescription||'1.º de CFGM',input.feedbackStyle||'claro y didáctico',input.modelOverride||'',Number(input.confidenceReview??.85),Number(input.confidenceBlock??.65),userId||null);
  return getModuleAIProfile(moduleId);
}
function anonymize(text){
  return String(text??'')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[EMAIL]')
    .replace(/\b(?:\+34\s*)?(?:6|7|8|9)\d{8}\b/g,'[TELÉFONO]')
    .replace(/\b\d{8}[A-Z]\b/gi,'[DOCUMENTO]');
}
function estimateCost(usage,settings){return ((Number(usage?.input_tokens||0)/1_000_000)*Number(settings.input_cost_per_million||0))+((Number(usage?.output_tokens||0)/1_000_000)*Number(settings.output_cost_per_million||0))}
function outputText(data){
  if(data.output_text)return data.output_text;
  for(const out of data.output||[])for(const c of out.content||[])if(c.type==='output_text'&&c.text)return c.text;
  return'';
}
async function responseRequest({key,model,payload,fallbackModel}){
  const call=async chosen=>{const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({...payload,model:chosen})});const data=await res.json().catch(()=>({}));if(!res.ok)throw Object.assign(new Error(data?.error?.message||`OpenAI respondió ${res.status}`),{status:502,apiStatus:res.status});return{data,model:chosen}};
  try{return await call(model)}catch(e){if(fallbackModel&&fallbackModel!==model)return await call(fallbackModel);throw e}
}
function recordUsage({userId,moduleId,submissionId,model,data,settings}){
  const usage=data.usage||{},cost=estimateCost(usage,settings);
  exec('INSERT INTO ai_usage(user_id,module_id,submission_id,model,input_tokens,output_tokens,estimated_cost)VALUES(?,?,?,?,?,?,?)',userId||null,moduleId||null,submissionId||null,model,Number(usage.input_tokens||0),Number(usage.output_tokens||0),cost);
  return{...usage,estimatedCost:cost};
}
export async function correctCriteria(criteria,{moduleId=null,submissionId=null,userId=null,studentLabel='ALUMNO'}={}){
  const {key,model,fallbackModel,settings,profile}=activeConfig({moduleId});
  const schema={type:'object',additionalProperties:false,required:['results'],properties:{results:{type:'array',items:{type:'object',additionalProperties:false,required:['criterionCode','score','confidence','feedback','evidence','errors','priorityAction'],properties:{criterionCode:{type:'string'},score:{type:'number',minimum:0,maximum:10},confidence:{type:'number',minimum:0,maximum:1},feedback:{type:'string'},evidence:{type:'array',items:{type:'string'}},errors:{type:'array',items:{type:'string'}},priorityAction:{type:'string'}}}}}};
  const minimize=!!settings.data_minimization;
  const safeCriteria=criteria.map(c=>({...c,answers:(c.answers||[]).map(a=>({...a,answer:minimize?anonymize(a.answer):a.answer}))}));
  const system=`Eres un asistente de corrección para Formación Profesional en España. Tu función es proponer evidencias y puntuaciones por criterio; la calificación definitiva la valida el profesorado. Nivel del alumnado: ${profile?.level_description||'CFGM'}. Estilo del feedback: ${profile?.feedback_style||'claro y didáctico'}. La retroalimentación de CADA criterio es obligatoria y debe incluir, de forma breve: un acierto concreto si existe, el error o carencia principal, cómo corregirlo y una acción clara para mejorar. Evita comentarios genéricos como 'bien' o 'debes mejorar'. ${profile?.instructions||''}`;
  const payload={input:[{role:'system',content:[{type:'input_text',text:system}]},{role:'user',content:[{type:'input_text',text:JSON.stringify({student:studentLabel,rules:['Evalúa exclusivamente lo demostrado para cada criterio.','Puntúa de 0 a 10.','Si faltan evidencias o la respuesta es ambigua, reduce la confianza.','No decidas si el RA está superado.','Devuelve feedback específico y comprensible para el alumnado: acierto, error o carencia, explicación correctiva y siguiente paso.'],criteria:safeCriteria})}]}],text:{format:{type:'json_schema',name:'criterion_correction',strict:true,schema}}};
  const {data,model:used}=await responseRequest({key,model,payload,fallbackModel});const text=outputText(data);if(!text)throw Object.assign(new Error('La IA no devolvió una respuesta estructurada'),{status:502});
  const usage=recordUsage({userId,moduleId,submissionId,model:used,data,settings});return{model:used,usage,...JSON.parse(text)};
}
export async function generateRecoveryActivities(criteria,{moduleId=null,userId=null}={}){
  const {key,model,fallbackModel,settings,profile}=activeConfig({moduleId});
  const schema={type:'object',additionalProperties:false,required:['activities'],properties:{activities:{type:'array',items:{type:'object',additionalProperties:false,required:['criterionCode','title','prompt','expectedEvidence'],properties:{criterionCode:{type:'string'},title:{type:'string'},prompt:{type:'string'},expectedEvidence:{type:'string'}}}}}};
  const payload={input:[{role:'system',content:[{type:'input_text',text:`Diseña actividades breves y graduadas de recuperación para alumnado de ${profile?.level_description||'CFGM'}. ${profile?.instructions||''} No incluyas la solución en el enunciado.`}]},{role:'user',content:[{type:'input_text',text:JSON.stringify({criteria,requirement:'Una actividad específica por criterio, clara y viable para entrega individual.'})}]}],text:{format:{type:'json_schema',name:'recovery_activities',strict:true,schema}}};
  const {data,model:used}=await responseRequest({key,model,payload,fallbackModel});const text=outputText(data);if(!text)throw new Error('La IA no devolvió actividades');const usage=recordUsage({userId,moduleId,submissionId:null,model:used,data,settings});return{model:used,usage,...JSON.parse(text)};
}
