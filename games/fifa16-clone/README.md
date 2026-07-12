# ⚽ Fútbol Pro 16 — clon de FIFA 16

Un juego de fútbol 11 contra 11 jugable en el navegador, inspirado en FIFA 16.
Hecho con HTML5 Canvas y JavaScript puro: **sin dependencias, sin build, sin servidor**.

> Los equipos y jugadores son ficticios: FIFA es una marca de EA Sports y los
> nombres/likeness reales están licenciados, así que este clon replica la
> *jugabilidad*, no las licencias.

## Cómo jugar

Abre `index.html` en cualquier navegador moderno. Listo.

```bash
# opcional: servirlo en local
cd games/fifa16-clone
python3 -m http.server 8080   # → http://localhost:8080
```

## Controles

| Tecla | Acción |
|---|---|
| **WASD / Flechas** | Mover al jugador |
| **Espacio** | Pase raso (con balón) · Entrada/presión (sin balón) |
| **E** (mantener y soltar) | Disparo con barra de potencia |
| **Q** | Pase largo / globo |
| **Shift** | Sprint |
| **C** | Cambiar de jugador manualmente |
| **↑↓←→ / Enter** | Navegar el menú |

## Características

- **11 vs 11** con formación 4-3-3 que se desplaza en bloque según el balón
- **Cámara con scroll** que sigue el balón por un campo de 105 × 68 m
- **8 equipos ficticios** seleccionables con valoraciones distintas
- **Física del balón** con altura (z), gravedad, botes, fricción y rebote en los postes
- **Porteros con IA**: interceptan la trayectoria, atrapan, palmean tiros fuertes y sacan en largo
- **IA de equipo**: conducción, pases al espacio, tiro según posición, presión y coberturas defensivas
- **Reglas simplificadas**: saques de banda, córners, saques de puerta y de centro
- **Presentación estilo FIFA**: marcador con reloj (90' escalados), radar/minimapa, carteles de gol, descanso y final, barra de potencia de tiro
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
