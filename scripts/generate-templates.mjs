import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const OUT=path.join(ROOT,'public','templates');
fs.mkdirSync(OUT,{recursive:true});

function esc(s=''){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function col(n){let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s}
function sheetXml(rows){
  const rs=rows.map((r,ri)=>`<row r="${ri+1}">${r.map((v,ci)=>{
    if(v===null||v===undefined||v==='')return '';
    const ref=`${col(ci+1)}${ri+1}`;
    if(typeof v==='number'&&Number.isFinite(v))return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rs}</sheetData></worksheet>`;
}

const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
function crc32(buf){let c=0xffffffff;for(const b of buf)c=CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b} function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b}
function zip(entries){
  const locals=[],centrals=[];let offset=0;
  for(const [name,data0] of entries){const data=Buffer.isBuffer(data0)?data0:Buffer.from(data0);const nb=Buffer.from(name);const crc=crc32(data);
    const lh=Buffer.concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),nb]);
    locals.push(lh,data);
    const ch=Buffer.concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nb.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nb]);
    centrals.push(ch);offset+=lh.length+data.length;
  }
  const central=Buffer.concat(centrals), local=Buffer.concat(locals);
  const eocd=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(central.length),u32(local.length),u16(0)]);
  return Buffer.concat([local,central,eocd]);
}
function workbook(sheets){
  const names=Object.keys(sheets);
  const ct=`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rootRels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb=`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n,i)=>`<sheet name="${esc(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
  const wbRels=`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}</Relationships>`;
  const entries=[['[Content_Types].xml',ct],['_rels/.rels',rootRels],['xl/workbook.xml',wb],['xl/_rels/workbook.xml.rels',wbRels]];
  names.forEach((n,i)=>entries.push([`xl/worksheets/sheet${i+1}.xml`,sheetXml(sheets[n])]));
  return zip(entries);
}

const instrumentosHeaders=['instrumento_id','modulo_codigo','grupo_codigo','ra_codigos','tipo_instrumento','titulo','descripcion','instrucciones_alumno','modalidad','calificacion_max','nota_minima','peso_instrumento_pct','fecha_apertura','fecha_cierre','duracion_min','intentos','permite_archivos','requiere_validacion_docente','usar_ia','perfil_ia','publicar_feedback','politica_recuperacion','estado','_puntos_items','_control','requiere_seb','seb_modo','seb_versiones'];
const itemsHeaders=['item_id','instrumento_id','orden','tipo_item','enunciado','ce_codigos','puntos_max','obligatorio','opciones','respuesta_correcta','tolerancia','feedback_correcto','feedback_incorrecto','autocorregible','usar_ia','criterios_correccion_ia','archivo_adjunto_ref','config_json','_control','requiere_seb'];
const rubricasHeaders=['rubrica_id','instrumento_id','item_id','dimension_id','orden_dimension','dimension','ce_codigos','peso_dimension_pct','nivel','valor_nivel','descriptor','nivel_superado','_control'];
const abrHeaders=['fase_id','instrumento_id','orden','fase','descripcion','producto_evidencia','ce_codigos','puntos_max','tipo_entrega','modalidad','fecha_limite','requiere_reflexion','usar_ia','indicaciones_correccion','_control','requiere_seb'];
const listas=[['tipo_instrumento','modalidad','si_no','estado','tipo_item','tipo_entrega','feedback','politica_recuperacion','seb_modo'],['PRUEBA','INDIVIDUAL','SI','BORRADOR','TEST','TEXTO','INMEDIATO','MEJOR_NOTA','DETECT'],['EXAMEN','GRUPAL','NO','PUBLICADO','MULTISELECT','ARCHIVO','AL_CIERRE','SUSTITUIR','CONFIG_KEY'],['PORTAFOLIO','MIXTA','','CERRADO','VERDADERO_FALSO','ENLACE','TRAS_VALIDACION_DOCENTE','PROMEDIO','']];
let catalog=[['modulo_codigo','ra_codigo','ce_codigo','criterio_evaluacion','peso_modulo_pct','es_critico']];
try{const tc=JSON.parse(fs.readFileSync(path.join(ROOT,'data','tecnica-contable.json'),'utf8'));for(const ra of tc.outcomes||[])for(const ce of ra.criteria||[])catalog.push([tc.module?.code||'0441',ra.code,ce.code,ce.text,ce.weight,'NO'])}catch{}
const instSheets={
  LEEME:[['FPEvalúa · Plantilla maestra de importación de instrumentos · v2.3'],['OBJETIVO','Preparar pruebas, exámenes, portafolios, ABR, proyectos, rúbricas y listas de cotejo para su importación.'],['FLUJO','Complete INSTRUMENTOS, ITEMS y, cuando corresponda, RUBRICAS o ABR_FASES. Use los códigos del CATALOGO_CE.']],
  LISTAS:listas,
  INSTRUMENTOS:[instrumentosHeaders],ITEMS:[itemsHeaders],RUBRICAS:[rubricasHeaders],ABR_FASES:[abrHeaders],CATALOGO_CE:catalog,
  EJEMPLO_EXAMEN:[['Ejemplo completo · Examen RA1 Técnica Contable'],['INSTRUMENTO','EX_RA1_2026'],['TIPO','EXAMEN'],['CE','1.a;1.e']],
  EJEMPLO_ABR:[['Ejemplo completo · ABR / Portafolio de evidencias'],['INSTRUMENTO','ABR_RA4_EMPRESA'],['TIPO','ABR'],['CE','4.d;4.e;4.f']]
};
const inst=workbook(instSheets);
fs.writeFileSync(path.join(OUT,'Plantilla_Importacion_Instrumentos_FPEvalua_2.3.xlsx'),inst);
fs.writeFileSync(path.join(OUT,'Plantilla_Importacion_Instrumentos_FPEvalua_2.2.xlsx'),inst);

const addSheets={
  LEEME:[['PUENTE ADDITIO ↔ FPEvalúa 2.4'],['Plantilla para intercambio de grupos, currículo RA/CE, instrumentos y calificaciones'],['HOJA','FINALIDAD','CÓMO USARLA'],['GRUPOS','Importar grupos y alumnado','Una fila por alumno'],['CURRICULO','Importar RA y CE','Una fila por criterio'],['INSTRUMENTOS','Importar instrumentos','Una fila por pregunta o actividad'],['CALIFICACIONES','Importar notas','Una fila por alumno y CE']],
  GRUPOS:[['curso_academico','ciclo_codigo','ciclo_nombre','nivel','familia','grupo','curso_numero','nombre','apellidos','email','additio_group_id','additio_student_id'],['2026/2027','GA-GM','CFGM Gestión Administrativa','Grado Medio','Administración y Gestión','1.º GA',1,'Ana','Pérez López','ana@centro.es','','']],
  CURRICULO:[['modulo_codigo','modulo_nombre','horas','ra_codigo','ra_nombre','ra_texto','ra_peso','ce_codigo','ce_texto','ce_peso','critico','grupo_criterios'],['0441','Técnica Contable',96,'RA1','Patrimonio empresarial','Reconoce los elementos que integran el patrimonio.',15,'1.a','Se han identificado las fases del ciclo económico de la actividad empresarial.',2,'NO','RA1 · Patrimonio']],
  INSTRUMENTOS:[['grupo','modulo_codigo','modulo_nombre','ra_codigo','fuente','subtipo','titulo_instrumento','additio_instrument_id','item_titulo','enunciado','tipo_item','ce_codigos','puntos','evidencia_esperada','additio_item_id'],['1.º GA','0441','Técnica Contable','RA1','PRUEBA','EXAMEN','Prueba RA1','','Pregunta 1','Ordena las fases del ciclo económico.','long_text','1.a',10,'Orden correcto y explicación breve','']],
  CALIFICACIONES:[['grupo','modulo_codigo','modulo_nombre','email','alumno','ce_codigo','prueba','portafolio','nota_ce','ra_nota','comentario'],['1.º GA','0441','Técnica Contable','ana@centro.es','Ana Pérez López','1.a',7.5,8,'','','']]
};
fs.writeFileSync(path.join(OUT,'Plantilla_Puente_Additio_FPEvalua_2.4.xlsx'),workbook(addSheets));
console.log('Plantillas XLSX generadas en',OUT);
