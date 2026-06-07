# ☀️ Guida Malaga — Erasmus 2026

Guida interattiva per il soggiorno Erasmus a Malaga (**13 luglio – 16 agosto 2026**): musei, ristoranti, pub, gite e planner uscite.

## Funzionalità

- Schede per cultura & teatri, ristoranti, piatti tradizionali, nightlife, shopping e gite fuori porta.
- Pagina **Programma** pubblica con i piani approvati dai tutor (admin).
- Ricerca e filtro **preferiti** per ogni sezione.
- **Planner uscite** personale, salvato localmente sul dispositivo, con esportazione/importazione JSON.
- Accesso admin (tutor) riservato alla gestione del programma ufficiale.
- Grafico budget mensile (Chart.js).
- Mappa interattiva basata su Leaflet con geolocalizzazione dei punti d'interesse.
- **Meteo in tempo reale** tramite Open-Meteo con consigli stagionali e meteorologici.
- **Vocabolario inglese-spagnolo** con terminologia andalusa tipica e **pronuncia audio registrata** madrelingua per ogni frase.
- **Installabile come app (PWA)** su iPhone, iPad e Android (schermo intero, icona sulla Home).

## Installare come app (PWA)

Dopo il deploy su **HTTPS** (es. GitHub Pages):

| Dispositivo | Come installare |
|-------------|-----------------|
| **Android (Chrome)** | Apri il sito → banner «Installa» oppure menu ⋮ → *Installa app* / *Aggiungi a schermata Home* |
| **iPhone / iPad (Safari)** | Condividi → *Aggiungi a Home* (icona ☀️) |

La guida si apre a schermo intero e resta disponibile offline per i contenuti già visitati (cache del service worker).

## Anteprima locale

Il sito carica le sezioni via `fetch`. Apri sempre con un server locale:

```bash
cd GuidaMalaga
npx serve .
```

Poi apri `http://localhost:3000` (o la porta indicata).

## Pubblicare su GitHub Pages (gratuito)

1. Crea un repository su GitHub (es. `GuidaMalaga`) e carica tutti i file.
2. Vai su **Settings → Pages**.
3. **Source**: *Deploy from a branch*.
4. **Branch**: `main` (o `master`) · cartella **`/ (root)`**.
5. Salva. Il sito sarà disponibile su:

   `https://<tuo-username>.github.io/GuidaMalaga/`

> Il file `.nojekyll` evita che Jekyll ignori cartelle o file con trattino basso.

### Deploy automatico (opzionale)

È incluso il workflow `.github/workflows/pages.yml`: dopo ogni push su `main`, GitHub Pages si aggiorna da solo.

## Struttura

```
index.html              # App principale (carica i JSON all'avvio)
assets/main.css         # Stili custom (componenti, header, planner, meteo…)
assets/site.webmanifest # Manifest PWA (nome, colori, icone)
scripts/generate-pwa-icons.swift  # Rigenera PNG con emoji ☀️ (macOS)
sw.js                   # Service worker (cache offline)
pwa.js                  # Registrazione SW + suggerimento installazione
planner.js              # Logica planner + preferiti (localStorage)
planner-ui.js           # Interfaccia planner (agenda, calendario, mini-mappa)
supabase-client.js      # Connessione Supabase per utenti/proposte/voti
group-planning-ui.js    # UI planning di gruppo
map.js                  # Mappa Leaflet + filtri categoria
weather.js              # Previsioni Open-Meteo + consigli stagione
vocabulary.js           # Vocabolario: filtri + riproduzione audio
scripts/generate-vocab-audio.py  # Rigenera MP3 pronuncia (edge-tts, voci en-US / es-ES)
assets/audio/vocab/     # File audio pronuncia (generati dallo script)
data/
  config.json           # Schede navigazione, date Erasmus, elenco file luoghi
  supabase-config.json  # Project URL e anon key pubblica Supabase
  coordinates.json      # Lat/lng per la mappa (chiave = id luogo)
  vocabulary-phrases.json   # Frasi per generare l'audio
  vocabulary-audio.json     # Manifest clip MP3
  places/
    culture.json        # Musei, teatri…
    food.json           # Ristoranti e taverne
    nightlife.json      # Pub & Locali serali
    shopping.json       # Centri commerciali e negozi
    excursions.json     # Gite fuori porta
sections/*.html         # Layout HTML di ogni scheda
database/
  init.sql              # Schema Supabase completo (eseguire una volta)
  create-admin-users.sql # Promuove utenti Authentication a admin
```

## Modificare i luoghi

Apri il file JSON della categoria che ti interessa (es. `data/places/food.json`) e aggiungi o modifica un oggetto:

```json
{
  "id": "food-nuovo",
  "category": "food",
  "title": "Nome locale",
  "desc": "Descrizione…",
  "icon": "🍽️",
  "note": "Etichetta breve",
  "hours": "Mar-Sab 12:00–22:00",
  "url": "https://esempio.es"
}
```

Campi utili per le gite: `transport`, `time`, `cost`. Salva e ricarica la pagina in Live Server.

Per cambiare le date del planner, modifica `erasmus` in `data/config.json`.

Per modificare colori, header, card e componenti custom, edita `assets/main.css`. Layout e spaziature usano classi Tailwind.

## Programma admin con Supabase

Il sito resta statico. Supabase serve solo agli admin (tutor) per creare e approvare il programma ufficiale.
Gli utenti normali non devono fare login: vedono la pagina **Programma** pubblica e usano il **Planner** personale salvato nel browser del dispositivo.

1. Apri Supabase → SQL editor ed esegui tutto `database/init.sql`.
2. In Supabase → Project Settings → API copia la publishable key pubblica.
3. Incollala in `data/supabase-config.json` nel campo `anonKey`.
4. Crea gli account admin (vedi sotto).

### Account admin

Servono solo account `admin` (massimo 3 attivi). Per ciascuno:

1. Supabase → **Authentication** → **Users** → **Add user** (email, password, **Auto Confirm User** attivo).
2. Modifica le email in `database/create-admin-users.sql`.
3. Esegui tutto `database/create-admin-users.sql` nel SQL Editor.

Il file definisce la funzione `ensure_admin_profile(email, nome)` e promuove gli utenti creati in Authentication. Alla fine mostra l'elenco admin attivi.

Per aggiungere un admin in seguito, crea prima l'utente in Authentication poi esegui:

```sql
select public.ensure_admin_profile('nuovo-admin@email.it', 'Nome visualizzato');
```

Regole implementate:

- Solo chi ha un profilo `active` può usare il planning di gruppo.
- I voti sono visibili nel sito solo come conteggi aggregati.
- Ogni modifica importante a una proposta crea una nuova versione.
- Dopo una modifica, i voti precedenti restano nello storico e gli utenti devono votare la versione corrente.
- Solo gli admin possono approvare il planning finale.
- Sono consentiti al massimo 3 admin attivi o invitati.

## Note

- I dati del planner personale restano nel browser (`localStorage`).
- La password del database non deve essere inserita nei file pubblici del sito.
