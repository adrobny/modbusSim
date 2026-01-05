const Modbus = require('jsmodbus');
const SerialPort = require('serialport');

// Configuration
const CONFIG = {
    port: process.env.COM_PORT || 'COM12', // Default COM port
    baudRate: 9600, // Standard Modbus RTU baud rate
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
};

// Modbus register configuration
const REGISTER_ADDRESS = 0x400; // Register 0x400 (1024 decimal)
const REGISTER_VALUE = 0x100;   // Value 0x100 (256 decimal)
const START_ADDRESS = parseInt(process.env.START_ADDRESS) || 10;       // Start Modbus address
const END_ADDRESS = parseInt(process.env.END_ADDRESS) || 10;         // End Modbus address

// Create input registers buffer (function code 04) - big enough for our register + next one for 2-word response
const inputRegisters = Buffer.alloc((REGISTER_ADDRESS + 2) * 2, 0);
// Set our register value at address 0x400
inputRegisters.writeUInt16BE(REGISTER_VALUE, REGISTER_ADDRESS * 2);
// Set next register to 0x0000 for 2-word response capability
inputRegisters.writeUInt16BE(0x0000, (REGISTER_ADDRESS + 1) * 2);

console.log('Modbus RTU Simulator');
console.log(`COM Port: ${CONFIG.port}`);
console.log(`Baud Rate: ${CONFIG.baudRate}`);
console.log(`Responding to addresses: ${START_ADDRESS}-${END_ADDRESS}`);
console.log(`Register ${REGISTER_ADDRESS.toString(16).toUpperCase()} (decimal ${REGISTER_ADDRESS}): 0x${REGISTER_VALUE.toString(16).toUpperCase()} (decimal ${REGISTER_VALUE})`);
console.log('Starting server...');

// Create serial port
const serialPort = new SerialPort.SerialPort({
    path: CONFIG.port,
    baudRate: CONFIG.baudRate,
    dataBits: CONFIG.dataBits,
    stopBits: CONFIG.stopBits,
    parity: CONFIG.parity
});

// Track last request address globally
let lastRequestAddress = null;

// Intercept serial port write to log and filter responses
const originalSerialWrite = serialPort.write.bind(serialPort);
serialPort.write = function(data, callback) {
    // Block empty buffers only for invalid addresses
    if (!data || data.length === 0) {
        // Only block if we have a tracked address that is invalid
        if (lastRequestAddress !== null && (lastRequestAddress < START_ADDRESS || lastRequestAddress > END_ADDRESS)) {
            console.log(`[BLOKOVÁNO ODESLÁNÍ] Prázdný buffer pro neplatnou adresu ${lastRequestAddress} - odpověď zablokována`);
            lastRequestAddress = null;
            if (callback) callback();
            return true; // Pretend we wrote it, but don't actually write
        }
        // For valid addresses, ignore empty buffer (shouldn't happen, but if it does, just ignore it)
        if (callback) callback();
        return true; // Pretend we wrote it, but don't actually write
    }
    
    const hexString = data.toString('hex').toUpperCase().match(/.{1,2}/g).join(' ');
    
    // Parse Modbus RTU response to show details
    if (data.length >= 3) {
        const responseAddress = data[0];
        const functionCode = data[1];
        const byteCount = data[2];
        const dataBytes = data.length - 4; // Subtract address, function code, byte count, and CRC (2 bytes)
        
        // ALWAYS check if response address is in valid range - block if not
        if (responseAddress < START_ADDRESS || responseAddress > END_ADDRESS) {
            console.log(`[BLOKOVÁNO ODESLÁNÍ] Adresa v odpovědi ${responseAddress} není v platném rozsahu (${START_ADDRESS}-${END_ADDRESS}), Data: ${hexString}, Délka: ${data.length} bytů - odpověď zablokována`);
            lastRequestAddress = null;
            if (callback) callback();
            return true; // Pretend we wrote it, but don't actually write
        }
        
        // Address is valid - log and send
        console.log(`[ODESLÁNO] Adresa: ${responseAddress}, FC: ${functionCode}, Byte count: ${byteCount}, Data bytes: ${dataBytes}, Celkem: ${data.length} bytů`);
        console.log(`[ODESLÁNO HEX] ${hexString}`);
        lastRequestAddress = null; // Reset after valid response
    } else {
        // For non-Modbus data, check lastRequestAddress if available
        if (lastRequestAddress !== null && (lastRequestAddress < START_ADDRESS || lastRequestAddress > END_ADDRESS)) {
            console.log(`[BLOKOVÁNO ODESLÁNÍ] Adresa: ${lastRequestAddress}, Data: ${hexString}, Délka: ${data.length} bytů - odpověď zablokována`);
            lastRequestAddress = null;
            if (callback) callback();
            return true;
        }
        console.log(`[ODESLÁNO] Data: ${hexString}, Délka: ${data.length} bytů`);
    }
    return originalSerialWrite(data, callback);
};

// Log all raw data from serial port
serialPort.on('data', (data) => {
    if (data && data.length > 0) {
        const hexString = data.toString('hex').toUpperCase().match(/.{1,2}/g).join(' ');
        // First byte is the Modbus unit ID (address)
        const address = data[0];
        lastRequestAddress = address;
        console.log(`[RAW PŘÍJEM] Adresa: ${address}, Data: ${hexString}, Délka: ${data.length} bytů`);
    }
});

// Create Modbus RTU server WITH input buffer
// We'll use preReadInputRegisters to filter by address
const server = new Modbus.server.RTU(serialPort, {
    holding: Buffer.alloc(1024, 0),
    coils: Buffer.alloc(1024, 0),
    discrete: Buffer.alloc(1024, 0),
    input: inputRegisters
});

// Pre-handler to filter requests by address BEFORE processing
server.on('preReadInputRegisters', (request, reply) => {
    const address = request.unitId;
    console.log(`[PRE-CHECK] Adresa: ${address}`);
    
    // Check if address is in valid range
    if (address < START_ADDRESS || address > END_ADDRESS) {
        console.log(`[BLOKOVÁNO PRE] Adresa ${address} není v platném rozsahu (${START_ADDRESS}-${END_ADDRESS}) - blokuji zpracování`);
        // Call reply with empty buffer - this prevents default handler from processing
        // Serial port write override will block the actual write
        reply(null, Buffer.alloc(0));
        return;
    }
    
    // Address is valid - ensure buffer has correct values and let it proceed
    console.log(`[POVOLENO PRE] Adresa ${address} je platná, nastavuji hodnoty v bufferu`);
    inputRegisters.writeUInt16BE(REGISTER_VALUE, REGISTER_ADDRESS * 2);
    inputRegisters.writeUInt16BE(0x0000, (REGISTER_ADDRESS + 1) * 2);
    
    // Log what will be returned
    const reg1 = inputRegisters.readUInt16BE(REGISTER_ADDRESS * 2);
    const reg2 = inputRegisters.readUInt16BE((REGISTER_ADDRESS + 1) * 2);
    console.log(`[PŘIPRAVENO] Buffer nastaven: Registr ${REGISTER_ADDRESS}: 0x${reg1.toString(16).toUpperCase()} (${reg1}), Registr ${REGISTER_ADDRESS + 1}: 0x${reg2.toString(16).toUpperCase()} (${reg2})`);
    
    reply(null); // null means continue with normal processing (default handler will use buffer)
});

// Handle connection - filter requests at client level
server.on('connection', (client) => {
    console.log('Client connected');
    
    // Intercept client's socket data handler to filter by address
    const socket = client.socket;
    const originalEmit = socket.emit.bind(socket);
    
    // Override socket.emit to filter 'data' events and track address
    socket.emit = function(event, ...args) {
        if (event === 'data' && args.length > 0) {
            const buffer = args[0];
            if (buffer && buffer.length > 0) {
                // First byte is the Modbus unit ID (address)
                const address = buffer[0];
                lastRequestAddress = address;
                
                // Log received data in hex format
                const hexString = buffer.toString('hex').toUpperCase().match(/.{1,2}/g).join(' ');
                console.log(`[PŘÍJEM] Adresa: ${address} (0x${address.toString(16).toUpperCase()}), Data: ${hexString}, Délka: ${buffer.length} bytů`);
                
                // Check if address is in valid range
                if (address < START_ADDRESS || address > END_ADDRESS) {
                    // Address is not valid - don't emit the data event
                    console.log(`[BLOKOVÁNO] Adresa ${address} není v platném rozsahu (${START_ADDRESS}-${END_ADDRESS}) - požadavek ignorován`);
                    lastRequestAddress = null; // Reset so we don't block response
                    return false; // Don't emit the event
                }
                
                console.log(`[POVOLENO] Adresa ${address} je platná, zpracovávám požadavek`);
            }
        }
        return originalEmit(event, ...args);
    };
});

// Handle close
server.on('close', () => {
    console.log('Client disconnected');
});

// Start the server (serial port is already opened)
console.log(`Modbus RTU server started on ${CONFIG.port}`);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    serialPort.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\nShutting down server...');
    serialPort.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});