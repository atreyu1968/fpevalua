import {loadEnv} from '../src/config.mjs';loadEnv();
const {initSchema,seed}=await import('../src/db.mjs');initSchema();const r=seed();
console.log('FPEvalúa inicializado:',r);
console.log('Usuarios de demostración (deben cambiarse o eliminarse en producción):');
console.log('admin@fpevalua.local /',process.env.SEED_ADMIN_PASSWORD||'Admin123!');
console.log('profesor@fpevalua.local /',process.env.SEED_TEACHER_PASSWORD||'Profesor123!');
console.log('alumno@fpevalua.local /',process.env.SEED_STUDENT_PASSWORD||'Alumno123!');
