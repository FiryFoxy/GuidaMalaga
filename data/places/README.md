# Luoghi — file JSON per categoria

Ogni file contiene un **array** di luoghi. Dopo la modifica, ricarica la pagina.

| Campo | Obbligatorio | Uso |
|-------|--------------|-----|
| `id` | sì | Identificativo univoco (es. `food-nuovo`) |
| `category` | sì | Deve coincidere con il file: `culture`, `food`, `nightlife`, `shopping`, `excursions` |
| `title` | sì | Nome del luogo |
| `desc` | sì | Descrizione |
| `icon` | sì | Emoji |
| `url` | no | Link sito ufficiale |
| `hours` | consigliato | Orari di apertura (mostrati su ogni scheda) |
| `location` | no | Quartiere (cultura) |
| `note` | no | Etichetta breve (food, shopping) |
| `highlight` | no | Etichetta breve (pub) |
| `transport` | no | Come arrivarci (gite) |
| `time` | no | Durata viaggio (gite) |
| `cost` | no | Costo indicativo (gite) |

Per una **nuova categoria**, aggiungi il file qui e il nome in `data/config.json` → `placeFiles`.

## Coordinate mappa

Aggiungi le coordinate in `data/coordinates.json` (stesso `id` del luogo):

```json
"food-nuovo": { "lat": 51.898, "lng": -8.473 }
```

Senza coordinate il luogo non compare sulla mappa.
