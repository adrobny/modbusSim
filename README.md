# Modbus RTU Simulator

Modbus RTU simulátor dostupný ve dvou verzích:
- **Node.js verze** - pro spuštění na serveru nebo lokálně
- **Web verze** - frontend aplikace s Web Serial API pro nasazení na Cloudflare Pages

Aplikace simuluje Modbus RTU zařízení, které vrací hodnotu 0x100 na registru 0x400 pro konfigurovatelné Modbus adresy. Pro ostatní registry vrací hodnotu stejnou jako adresa registru.

## Instalace

```bash
npm install
```

## Použití

### Node.js verze

#### Spuštění s výchozím COM portem (COM12)

```bash
npm start
```

#### Spuštění s vlastním COM portem

```bash
COM_PORT=COM4 npm start
```

nebo na Linux/Mac:

```bash
COM_PORT=/dev/ttyUSB0 npm start
```

#### Konfigurace pomocí proměnných prostředí

```bash
START_ADDRESS=10 END_ADDRESS=11 npm start
```

### Web verze

#### Lokální vývoj

```bash
npm run web
```

Aplikace bude dostupná na `http://localhost:3000`

#### Nasazení na Cloudflare Pages

1. Vytvořte GitHub repository s projektem
2. V Cloudflare Dashboard → Pages → Create a project
3. Připojte GitHub repository
4. Build settings:
   - Build command: (prázdné)
   - Build output directory: `web`
5. Deploy

**Poznámka:** Web Serial API funguje pouze v Chrome a Edge prohlížečích.

## Konfigurace

### Node.js verze

- **COM Port**: Nastavte pomocí proměnné prostředí `COM_PORT` (výchozí: COM12)
- **Baud Rate**: 9600 (standard pro Modbus RTU)
- **Data Bits**: 8
- **Stop Bits**: 1
- **Parity**: none
- **Start Address**: `START_ADDRESS` (výchozí: 10)
- **End Address**: `END_ADDRESS` (výchozí: 11)

### Web verze

Konfigurace se provádí přímo v webovém rozhraní:
- Baud Rate: výběr z dropdown menu
- Start/End Address: číselné vstupy
- Registr a hodnota: hexadecimální vstupy

## Modbus konfigurace

- **Registr**: 0x400 (1024 decimal) - speciální registr s hodnotou 0x100
- **Hodnota na 0x400**: 0x100 (256 decimal)
- **Ostatní registry**: hodnota = adresa registru

Aplikace odpovídá na čtení input registrů (function code 04) a vrací:
- Pro registr 0x400: hodnotu 0x100
- Pro ostatní registry: hodnotu stejnou jako adresa registru

## Funkce

- ✅ Konfigurovatelné Modbus adresy (start-end range)
- ✅ Filtrování požadavků podle adresy
- ✅ Podpora pro různé registry s dynamickými hodnotami
- ✅ Detailní logování všech příjmů a odesílání
- ✅ Web verze s moderním UI
- ✅ Node.js verze pro produkční nasazení

## Testování

Pro testování můžete použít jakýkoliv Modbus RTU klient nebo nástroj jako:
- Modbus Poll
- QModBus
- nebo vlastní aplikaci s modbus-serial knihovnou

## Ukončení

### Node.js verze
Pro ukončení aplikace stiskněte Ctrl+C.

### Web verze
Klikněte na tlačítko "Odpojit" v webovém rozhraní.</contents>
</xai:function_call name="todo_write">
<parameter name="merge">true
