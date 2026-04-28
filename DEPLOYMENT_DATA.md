# Persistenza dati in deploy

Il sito usa SQLite. In produzione il database deve stare su un volume persistente,
altrimenti utenti, ordini, carrelli, prodotti e indirizzi possono sparire dopo un
redeploy.

## Railway

Configurazione prevista:

- Volume montato su `/app/data`
- Database su `/app/data/app.db`
- Upload immagini su `/app/data/uploads`

Il codice usa automaticamente `RAILWAY_VOLUME_MOUNT_PATH/app.db` quando Railway
espone la variabile del volume. Lo script `RAILWAY_DEPLOY.ps1` imposta anche:

```text
DB_PATH=/app/data/app.db
UPLOADS_DIR=/app/data/uploads
```

Prima di un deploy importante, scarica un backup da admin usando
`/api/admin/backup`. Non eliminare o ricreare il volume Railway se vuoi
conservare i dati.

## Auto-fill indirizzi

L'endpoint `/api/address-autofill` usa:

- Zippopotam.us come provider primario per `country + postalCode`
- Nominatim/OpenStreetMap come fallback, con cache e rate limit

Variabili consigliate in produzione:

```text
ADDRESS_LOOKUP_CONTACT_EMAIL=assistenza@tuodominio.it
ADDRESS_LOOKUP_USER_AGENT=ShopNow/1.0 (address-autofill; assistenza@tuodominio.it)
ADDRESS_LOOKUP_TIMEOUT_MS=8000
ADDRESS_LOOKUP_CACHE_TTL_MS=21600000
```

Nominatim richiede un `User-Agent` identificabile, caching e un limite massimo
di circa una richiesta al secondo. Il backend rispetta questi vincoli lato
server.
