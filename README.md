# AeroSim — Flight Test 01

Prototipo web de simulador de vuelo 3D inspirado en simuladores de vuelo, con código propio.

## Probarlo con GitHub y Vercel (sin instalar programas)

1. Crea un repositorio nuevo en GitHub llamado `aerosim-flight`.
2. En el repositorio, pulsa **Add file → Upload files** y sube `index.html`.
3. Pulsa **Commit changes**.
4. Entra en Vercel y elige **Add New → Project**.
5. Importa el repositorio `aerosim-flight`. No hace falta configurar build command ni output directory.
6. Pulsa **Deploy** y abre la URL que Vercel genere.

## Controles
- W / S: cabeceo
- A / D: alabeo
- Flechas arriba/abajo: potencia
- G: tren de aterrizaje
- R: reiniciar
- C: cambiar cámara

## Estado del prototipo
Incluye escena 3D, avión construido con geometría básica, pista, controles, cámara de seguimiento, modelo de vuelo simplificado, aviso de baja velocidad y daños iniciales por aterrizaje brusco.

**Importante:** las físicas son aproximadas y sirven como base jugable, no como simulación aeronáutica validada. La deformación estructural realista, daños por componentes, motor, superficies de control y fallos mecánicos se implementarán en iteraciones posteriores.
