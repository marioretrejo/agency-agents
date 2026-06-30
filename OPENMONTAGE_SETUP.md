# OpenMontage - Estudio de Vídeo para Claude Code

## ✓ Instalación Completada

OpenMontage ha sido instalado y configurado completamente en tu proyecto. Este es un estudio de vídeo automatizado que funciona directamente dentro de Claude Code.

## Verificación de Dependencias

Todas las dependencias necesarias han sido verificadas e instaladas:

- **Python 3.11.15** ✓ (requerido: 3.10+)
- **Node.js v22.22.2** ✓ (requerido: 18+)
- **FFmpeg 6.1.1** ✓
- **OpenMontage** ✓ (completamente instalado)

## Estructura del Proyecto

```
OpenMontage/
├── .env                          # Variables de entorno (claves API opcionales)
├── .env.example                  # Plantilla de variables
├── .claude/                       # Configuración para Claude Code
├── .cursor/                       # Configuración para Cursor
├── .agents/                       # Agentes y skills del sistema
├── remotion-composer/            # Motor de composición de videos
├── requirements.txt              # Dependencias Python
├── Makefile                       # Automatización
├── AGENT_GUIDE.md               # Guía detallada de agentes
└── PROJECT_CONTEXT.md           # Contexto del proyecto
```

## Cómo Usar OpenMontage

### 1. Abre el Proyecto en Claude Code

```bash
cd OpenMontage
# Luego abre este directorio en Claude Code
```

### 2. Pide Videos

Usa prompts como estos:

**Explainer de 60 segundos:**
```
Hazme un explainer de 60 segundos sobre [tu tema]
```

**Video educativo:**
```
Crea un vídeo de 45 segundos sobre por qué el cielo es azul, con voz y música
```

**Montaje con metraje real:**
```
Monta un montaje de 75 segundos con metraje real, sin narración, tono elegante y con música
```

### 3. Antes de Generar

Claude te mostrará un plan con el coste estimado antes de empezar. Puedes:
- Ver qué recursos usará (metraje, voces, música, efectos)
- Entender el coste si usas API keys opcionales
- Ajustar el prompt si es necesario

## Capacidades Disponibles

### Sin Claves API (Completamente Gratis)
✓ Narración de voz local (Piper TTS)
✓ Metraje de Archive.org
✓ Metraje de Wikimedia Commons
✓ Imágenes de Pexels y Unsplash
✓ Composición de videos con Remotion
✓ Post-producción con FFmpeg
✓ Edición completamente local

### Con Claves API (Opcional)
- **FAL_KEY** - FLUX (imágenes), Google Veo (video), Kling, MiniMax, Recraft
- **GOOGLE_API_KEY** - Google Imagen, Google Cloud TTS (700+ voces)
- **OPENAI_API_KEY** - OpenAI TTS, DALL-E
- **ELEVENLABS_API_KEY** - Voces premium de ElevenLabs
- **XAI_API_KEY** - Generación de imágenes/video con Grok
- **SUNO_API_KEY** - Generación de música

## Agregar Claves API

Si deseas usar servicios premium, edita el archivo `.env`:

```bash
nano OpenMontage/.env
```

Luego agrega las claves necesarias. Por ejemplo:
```env
FAL_KEY=tu_clave_aqui
GOOGLE_API_KEY=tu_clave_aqui
OPENAI_API_KEY=tu_clave_aqui
```

## Características Especiales

### Voz Local
Usa Piper TTS para narración sin costo - soporta múltiples idiomas e idiomas locales.

### Metraje de NASA
Acceso a metraje espacial de la NASA a través de Archive.org.

### Edición Completamente Local
Todos los videos se editan localmente sin depender de servicios en la nube.

### Soporte Premium Opcional
Si necesitas más calidad, simplemente agrega claves API a `.env` - el sistema automáticamente usará los mejores modelos disponibles.

## Límites y Costos

- **Uso local gratis:** Sin límite de vídeos ni costos (salvo el costo de CPU/GPU)
- **Claves premium:** Por defecto tienen un límite de gasto de $10 USD con confirmación para acciones > $0.50

## Solución de Problemas

Si algo no funciona:

1. Verifica que Python, Node y FFmpeg están instalados:
   ```bash
   python3 --version
   node --version
   ffmpeg -version
   ```

2. Verifica que el archivo .env existe:
   ```bash
   ls -la OpenMontage/.env
   ```

3. Consulta los logs en la carpeta `OpenMontage/`

## Documentación Adicional

- **AGENT_GUIDE.md** - Guía completa de agentes y capabilities
- **PROJECT_CONTEXT.md** - Contexto técnico del proyecto
- **Makefile** - Comandos disponibles (ejecuta `make help`)

## Próximos Pasos

1. ✓ OpenMontage está instalado
2. → Abre el directorio en Claude Code
3. → Pide un video de prueba
4. → Ajusta las claves API si necesitas más calidad
5. → ¡Crea videos increíbles!

---

**Última actualización:** 2026-06-30
**Estado:** ✓ Completamente instalado y listo para usar
