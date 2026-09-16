# Seguridad de FPEvalúa

No publiques credenciales, API keys, bases SQLite reales, copias de seguridad ni entregas del alumnado en GitHub.

## Nunca debe versionarse
- `.env`
- `data/*.sqlite*`
- `uploads/`
- `backups/`
- `scorm/` con materiales privados
- exportaciones con datos personales del alumnado

Las claves de IA se administran desde el panel y se almacenan cifradas. La clave maestra de cifrado permanece en `.env` y debe conservarse fuera del repositorio.

Si detectas una vulnerabilidad, no publiques datos reales ni credenciales en un issue público. Corrige o revoca primero las credenciales afectadas.
