# Modbus RTU Simulator

Tento Node.js aplikace simuluje Modbus RTU zařízení, které vrací hodnotu 0x100 na registru 0x400 pro Modbus adresy 10-50.

## Instalace

```bash
npm install
```

## Použití

### Spuštění s výchozím COM portem (COM3)

```bash
npm start
```

### Spuštění s vlastním COM portem

```bash
COM_PORT=COM4 npm start
```

nebo na Linux/Mac:

```bash
COM_PORT=/dev/ttyUSB0 npm start
```

## Konfigurace

- **COM Port**: Nastavte pomocí proměnné prostředí `COM_PORT` (výchozí: COM3)
- **Baud Rate**: 9600 (standard pro Modbus RTU)
- **Data Bits**: 8
- **Stop Bits**: 1
- **Parity**: none

## Modbus konfigurace

- **Adresy**: 10-50
- **Registr**: 0x400 (1024 decimal)
- **Hodnota**: 0x100 (256 decimal)

Aplikace odpovídá pouze na čtení holding registrů (function code 3) a vrací hodnotu 0x100 pouze pro registr 0x400 u adres 10-50. Pro ostatní registry vrací 0.

## Testování

Pro testování můžete použít jakýkoliv Modbus RTU klient nebo nástroj jako:
- Modbus Poll
- QModBus
- nebo vlastní aplikaci s modbus-serial knihovnou

## Ukončení

Pro ukončení aplikace stiskněte Ctrl+C.</contents>
</xai:function_call name="todo_write">
<parameter name="merge">true
