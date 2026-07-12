# ⚽ Fútbol Pro 26 — clon estilo EA FC 26

Un juego de fútbol 11 contra 11 jugable en el navegador, inspirado en la saga
FIFA / EA FC (temporada 2026), con **vista 3D de retransmisión**: cámara en
perspectiva, estadio con gradas y vallas publicitarias, y jugadores animados.
Hecho con HTML5 Canvas y JavaScript puro: **sin dependencias, sin build, sin
servidor**. La simulación es 2D top-down; el render la proyecta a 3D.

> Los equipos y jugadores son ficticios (Leo Mesta, Kili Bapé, Erlin Halan…):
> FIFA/EA FC son marcas de EA Sports y los nombres y caras reales están
> licenciados, así que este clon replica la *jugabilidad*, no las licencias.

## Cómo jugar

Abre `index.html` en cualquier navegador moderno. Listo.

```bash
# opcional: servirlo en local
cd games/fifa16-clone
python3 -m http.server 8080   # → http://localhost:8080
```

## Controles

### 1 jugador (vs CPU)

| Tecla | Acción |
|---|---|
| **WASD / Flechas** | Mover al jugador |
| **Espacio** | Pase raso (con balón) · Entrada/presión (sin balón) |
| **E** (mantener y soltar) | Disparo con barra de potencia |
| **Q** | Pase largo / globo |
| **Shift** | Sprint |
| **C** | Cambiar de jugador manualmente |
| **↑↓←→ / Enter** | Navegar el menú |

### 2 jugadores (mismo teclado)

| Acción | Jugador 1 | Jugador 2 |
|---|---|---|
| Mover | WASD | Flechas |
| Pase / entrada | Espacio | L |
| Disparo (mantener) | E | P |
| Globo | Q | O |
| Sprint | Shift | K |
| Cambiar jugador | C | M |

### Móvil / táctil

En pantallas táctiles aparecen controles en pantalla automáticamente:

- **Joystick virtual** (mitad izquierda, flotante): tócala y arrastra para mover;
  llévalo al tope para **esprintar**
- **PASE** — pase raso (o entrada/presión al defender)
- **TIRO** — mantén pulsado para cargar potencia (anillo alrededor del botón) y suelta
- **GLOBO** — pase largo
- **CAM** — cambiar de jugador
- El menú se maneja tocando las filas (mitad izquierda ◄ / mitad derecha ►)
- En los penaltis, apunta con el joystick (arriba/abajo) y usa TIRO

El modo 2 jugadores requiere teclado; en táctil juega el J1.

### Penaltis

Apunta con **arriba/abajo** (la mirilla amarilla marca el punto de la portería)
y mantén el botón de **disparo** para cargar potencia. Cuidado: a máxima
potencia el tiro pierde precisión y puede irse fuera.

## Características

- **Vista 3D de retransmisión**: proyección en perspectiva real (cámara elevada
  tras la banda), estadio nocturno con público, focos y vallas con marcas ficticias
- **Cartas de jugador estrella** estilo FC 26 en el menú (media, posiciones y
  PAC/SHO/PAS/DRI/DEF/PHY) — cada club tiene su estrella
- **11 vs 11** con formación 4-3-3 que se desplaza en bloque según el balón
- **Jugable en móvil**: joystick virtual flotante y botones táctiles
  (con multi-touch: mueve y dispara a la vez), menú por toques
- **Modo 2 jugadores** en el mismo teclado (además del modo vs CPU)
- **Faltas y tarjetas**: las entradas duras se pitan; amarillas acumulables y
  rojas con expulsión (el equipo se queda con 10)
- **Penaltis**: las faltas dentro del área se lanzan desde los 11 metros, con
  mirilla para apuntar y barra de potencia (la CPU también los lanza)
- **Cámara que panea** siguiendo el balón por un campo a escala de 105 × 68 m
- **8 equipos ficticios** seleccionables con valoraciones distintas
- **Física del balón** con altura (z), gravedad, botes, fricción y rebote en los postes
- **Porteros con IA**: interceptan la trayectoria, atrapan, palmean tiros fuertes y sacan en largo
- **IA de equipo**: conducción, pases al espacio, tiro según posición, presión y coberturas defensivas
- **Reglas simplificadas**: saques de banda, córners, saques de puerta y de centro
- **Presentación estilo EA FC**: marcador con reloj (90' escalados), radar/minimapa, carteles de gol, descanso y final, barra de potencia de tiro
- **Cambio automático de jugador** al más cercano al balón (o manual con C)
- **Efectos de sonido** generados con WebAudio (silbato, pases, goles…)
- Partidos de duración configurable: 2:30, 4:00 o 6:00 minutos reales

## Estructura

```
games/fifa16-clone/
├── index.html   # página y estilos
├── game.js      # todo el motor: física, IA, estados, render
└── README.md
```
