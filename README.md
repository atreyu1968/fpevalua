# FPEvalúa 2.4

Plataforma Node.js + SQLite para evaluación por resultados de aprendizaje y criterios de evaluación en Formación Profesional.

## Instalación desde GitHub

Requisitos: Ubuntu, acceso sudo y Node.js 24 o superior.

### Instalación nueva

```bash
git clone https://github.com/atreyu1968/fpevalua.git
cd fpevalua
sudo bash deploy/install-ubuntu.sh
```

También puedes usar el instalador Git-aware incluido en el proyecto:

```bash
sudo bash deploy/install-from-github.sh
```

### Actualización desde GitHub

Si `/opt/fpevalua` es una instalación Git:

```bash
cd /opt/fpevalua
sudo bash deploy/update-from-github.sh
```

El actualizador crea una copia preventiva de SQLite y `.env`, hace `git pull --ff-only` y reinicia el servicio conservando los datos locales.

> Nunca subas `.env`, bases SQLite, copias de seguridad ni entregas del alumnado al repositorio. El `.gitignore` ya los excluye.

## Integración Additio

FPEvalúa 2.4 incorpora un conector por archivos para usar Additio como cuaderno externo y FPEvalúa como motor especializado de RA/CE, evidencias, recuperación y evaluación autenticada.

### Importar desde Additio
1. Entra como Administrador o Coordinación.
2. Abre **Additio** en el menú lateral.
3. Descarga `Plantilla_Puente_Additio_FPEvalua_2.4.xlsx`.
4. Rellena las hojas necesarias:
   - `GRUPOS`: grupos y alumnado.
   - `CURRICULO`: RA y CE.
   - `INSTRUMENTOS`: prueba, examen, portafolio, ABR, proyecto, rúbrica o lista de cotejo.
   - `CALIFICACIONES`: notas por CE, prueba y portafolio.
5. Sube el libro en la misma pantalla y marca qué bloques quieres importar.

### Importar notas de un Excel ya exportado por Additio
1. Abre el módulo/grupo en FPEvalúa.
2. Pestaña **Additio**.
3. Selecciona el XLSX exportado de Additio.
4. Pulsa **Leer columnas**.
5. Elige la columna que identifica al alumno (correo o nombre completo).
6. Para cada columna de notas, selecciona su destino: `Prueba → CE`, `Portafolio → CE` o `Nota CE externa → CE`.
7. Importa.

### Exportar hacia Additio
Desde la pestaña **Additio** de cada módulo se generan:
- alumnado del grupo;
- RA y CE;
- instrumentos e ítems;
- calificaciones CE, RA y nota de módulo.

Los ficheros se generan en CSV separado por punto y coma para abrirlos directamente en Excel/LibreOffice y trasladarlos a Additio mediante sus herramientas de importación/copia de datos.

## Sincronización API
La estructura interna ya conserva IDs externos de Additio. La sincronización directa se activará cuando se disponga de credenciales y documentación técnica oficial de la API de Additio.

## Actualización desde 2.3
Haz primero una copia desde **Sistema → Copias de seguridad**, descomprime la 2.4 y ejecuta:

```bash
sudo bash deploy/install-ubuntu.sh
```

Las migraciones crean automáticamente las tablas de integración sin eliminar datos anteriores.
