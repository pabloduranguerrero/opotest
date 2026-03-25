# OpoTest Policía (MVP)

## 1) Concepto completo
Herramienta de academia para opositores de Policía Nacional y Local basada en entrenamiento tipo test. El foco es rendimiento real: practicar, medir errores, repetir lo débil y mejorar nota.

## 2) Flujo de usuario
1. Home: elige modo (tema, aleatorio, simulacro, repaso inteligente)
2. Test: responde preguntas
3. Feedback inmediato (excepto lógica de revisión final en simulacro futuro)
4. Resultado
5. Estadísticas y preguntas más falladas

## 3) Arquitectura simple
- `App.tsx`: navegación y lógica MVP
- `data/questions.json`: banco de preguntas escalable
- `AsyncStorage`: progreso local por pregunta (`answered/correct/wrong`)

Sin backend, sin login, sin APIs.

## 4) Estructura JSON escalable
```json
{
  "questions": [
    {
      "id": "q1",
      "tema": "Constitución",
      "enunciado": "...",
      "opciones": ["A","B","C","D"],
      "correcta": 2,
      "explicacion": "..."
    }
  ]
}
```

## 5) Banco de ejemplo
Incluye **20 preguntas reales de entrenamiento** en temas clave (Constitución, penal, administrativo, seguridad ciudadana, Policía Nacional, Policía Local).

## 6) Sistema de registro de errores
Por cada pregunta se guarda:
- veces respondida
- aciertos
- fallos

Con ello se calcula:
- % global de acierto
- progreso por tema
- ranking de más falladas
- modo repaso inteligente (falladas)

## 7) Código base funcional
Incluido en `App.tsx`.

## 8) Instrucciones de ejecución
```bash
npm install
npm run start
```

Web:
```bash
npx expo install react-dom react-native-web
npm run web
```

Android:
```bash
npm run android
```

## Monetización (MVP)
- Banner simulado en Home
- Interstitial simulado al finalizar test
- Estructura lista para sustituir por AdMob más adelante
