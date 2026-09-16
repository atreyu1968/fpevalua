# FPEvalúa 2.4

Plataforma Node.js + SQLite para evaluación por resultados de aprendizaje y criterios de evaluación en Formación Profesional.

## Instalación desde cero en Ubuntu

La instalación recomendada usa **Ubuntu Server + Node.js 24 + Git + Nginx + Cloudflare Tunnel**. FPEvalúa no necesita Docker ni `npm install`.

### 1. Actualizar Ubuntu

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt autoremove -y
```

Si el sistema indica que es necesario reiniciar:

```bash
sudo reboot
```

### 2. Instalar utilidades básicas

```bash
sudo apt update
sudo apt install -y curl git ca-certificates unzip nginx
```

Comprueba Git y curl:

```bash
git --version
curl --version
```

### 3. Instalar Node.js 24

Para un servidor se recomienda fijar la rama mayor 24:

```bash
cd /tmp
curl -fsSL https://deb.nodesource.com/setup_24.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt install -y nodejs
```

Comprueba la versión:

```bash
node -v
npm -v
```

FPEvalúa requiere Node.js 24 o superior.

### 4. Clonar FPEvalúa desde GitHub

```bash
cd /opt
sudo git clone https://github.com/atreyu1968/fpevalua.git
sudo chown -R "$USER":"$USER" /opt/fpevalua
cd /opt/fpevalua
```

### 5. Instalar FPEvalúa

```bash
sudo bash deploy/install-ubuntu.sh
```

El instalador:

- crea `/opt/fpevalua/.env` si no existe;
- genera secretos aleatorios para sesión y cifrado de la IA;
- crea las carpetas persistentes;
- instala el servicio `systemd`;
- configura Nginx;
- conserva SQLite, `.env`, adjuntos y SCORM durante las actualizaciones.

## Acceso mediante Cloudflare Tunnel

La configuración recomendada es:

```text
Internet
   ↓
Cloudflare
   ↓
Cloudflare Tunnel
   ↓
127.0.0.1:8080  (Nginx)
   ↓
127.0.0.1:3000  (FPEvalúa / Node.js)
```

Nginx queda ligado únicamente a la interfaz local. No es necesario abrir los puertos 80, 443 o 3000 al exterior ni realizar redirecciones NAT en el router.

### 6. Instalar cloudflared en Ubuntu

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt update
sudo apt install -y cloudflared
```

Comprueba la instalación:

```bash
cloudflared --version
```

### 7. Crear o utilizar el túnel

La opción más sencilla es crear el túnel desde el panel de Cloudflare:

**Cloudflare → Networking → Tunnels → Create Tunnel**

Instala el conector en el servidor utilizando el comando/token que proporciona Cloudflare.

Después crea un **Public Hostname**, por ejemplo:

```text
Hostname: evaluacion.tudominio.es
Service:  http://127.0.0.1:8080
```

Si ya dispones de un túnel en ese servidor, solo tienes que añadir un nuevo hostname que apunte a:

```text
http://127.0.0.1:8080
```

No apuntes el túnel directamente a SQLite ni a ninguna carpeta de datos.

### 8. Comprobar servicios

```bash
sudo systemctl status fpevalua
sudo systemctl status nginx
sudo systemctl status cloudflared
```

Prueba localmente Nginx:

```bash
curl -I http://127.0.0.1:8080
```

Y Node directamente, solo para diagnóstico:

```bash
curl -I http://127.0.0.1:3000
```

Cuando el túnel esté conectado, abre en el navegador el hostname configurado en Cloudflare.

### 9. Firewall

Con Cloudflare Tunnel no debes publicar FPEvalúa mediante puertos entrantes. Si utilizas UFW, una configuración básica puede ser:

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

No es necesario añadir reglas públicas para 80, 443, 3000 o 8080 si todo el acceso web se realiza exclusivamente por Cloudflare Tunnel.

## Actualización desde GitHub

Cuando FPEvalúa ya esté instalado desde Git:

```bash
cd /opt/fpevalua
sudo bash deploy/update-from-github.sh
```

El actualizador:

1. crea una copia preventiva de SQLite y `.env`;
2. detiene temporalmente FPEvalúa;
3. ejecuta `git fetch` y `git pull --ff-only`;
4. aplica las migraciones al arrancar;
5. conserva base de datos, adjuntos, SCORM y configuración local;
6. reinicia el servicio.

También puedes comprobar antes si existen cambios:

```bash
cd /opt/fpevalua
git fetch origin
git status
```

> Nunca subas `.env`, bases SQLite, copias de seguridad ni entregas del alumnado al repositorio. El `.gitignore` los excluye.

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

## Seguridad

- Node escucha únicamente en `127.0.0.1:3000`.
- Nginx escucha únicamente en `127.0.0.1:8080` cuando se usa la configuración incluida.
- Cloudflare Tunnel es el único punto de publicación web recomendado.
- `.env`, SQLite, adjuntos, copias y SCORM privados quedan fuera de Git.
- Configura la API de IA desde el panel de administración.
- Cambia las contraseñas iniciales en el primer acceso.
- Activa 2FA para administradores y profesorado.
- Conserva una copia segura de `.env`; contiene la clave utilizada para descifrar configuraciones sensibles.
