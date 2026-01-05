// Configuration
let CONFIG = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none'
};

let REGISTER_ADDRESS = 0x400;
let REGISTER_VALUE = 0x100;
let START_ADDRESS = 10;
let END_ADDRESS = 11;
const MAX_REGISTER = 10000;

// Web Serial API
let port = null;
let reader = null;
let writer = null;
let inputRegisters = new Uint16Array(MAX_REGISTER);
let lastRequestAddress = null;

// Initialize registers
function initRegisters() {
    for (let i = 0; i < MAX_REGISTER; i++) {
        inputRegisters[i] = i & 0xFFFF;
    }
    inputRegisters[REGISTER_ADDRESS] = REGISTER_VALUE;
}

// CRC16 calculation for Modbus RTU
function calculateCRC16(data) {
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) {
            if (crc & 0x0001) {
                crc = (crc >> 1) ^ 0xA001;
            } else {
                crc >>= 1;
            }
        }
    }
    return crc;
}

// Log function
function log(message, type = 'info') {
    const logDiv = document.getElementById('log');
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    entry.textContent = `[${time}] ${message}`;
    logDiv.appendChild(entry);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// Update status
function updateStatus(status, portInfo = '') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = status;
    statusEl.className = status === 'Připojeno' ? 'status connected' : 'status';
    document.getElementById('portInfo').textContent = portInfo;
}

// Connect to serial port
async function connect() {
    if (!navigator.serial) {
        alert('Web Serial API není podporováno. Použijte Chrome nebo Edge.');
        return;
    }

    try {
        port = await navigator.serial.requestPort();
        await port.open({
            baudRate: CONFIG.baudRate,
            dataBits: CONFIG.dataBits,
            stopBits: CONFIG.stopBits,
            parity: CONFIG.parity
        });

        const portInfo = port.getInfo();
        updateStatus('Připojeno', `Port připojen (Baud: ${CONFIG.baudRate})`);
        log('Připojeno k sériovému portu', 'success');
        
        document.getElementById('connectBtn').disabled = true;
        document.getElementById('disconnectBtn').disabled = false;

        // Start reading
        reader = port.readable.getReader();
        writer = port.writable.getWriter();
        
        readLoop();
    } catch (error) {
        log(`Chyba připojení: ${error.message}`, 'error');
        updateStatus('Chyba připojení');
    }
}

// Disconnect from serial port
async function disconnect() {
    if (reader) {
        try {
            await reader.cancel();
        } catch (e) {}
        reader.releaseLock();
        reader = null;
    }
    if (writer) {
        writer.releaseLock();
        writer = null;
    }
    if (port) {
        try {
            await port.close();
        } catch (e) {}
        port = null;
    }
    
    updateStatus('Odpojeno');
    log('Odpojeno od sériového portu', 'info');
    
    document.getElementById('connectBtn').disabled = false;
    document.getElementById('disconnectBtn').disabled = true;
}

// Read loop
async function readLoop() {
    const buffer = [];
    let frameTimeout = null;
    
    while (port && port.readable) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            
            // Add received bytes to buffer
            buffer.push(...value);
            
            // Clear existing timeout
            if (frameTimeout) {
                clearTimeout(frameTimeout);
            }
            
            // Wait for frame completion (3.5 character times at current baud rate)
            // For 9600 baud: 3.5 * 11 bits / 9600 = ~4ms, we'll use 10ms for safety
            frameTimeout = setTimeout(() => {
                if (buffer.length > 0) {
                    processReceivedData(new Uint8Array(buffer));
                    buffer.length = 0;
                }
            }, 10);
        } catch (error) {
            log(`Chyba čtení: ${error.message}`, 'error');
            break;
        }
    }
}

// Process received Modbus RTU frame
function processReceivedData(data) {
    if (data.length < 4) return; // Minimum frame size
    
    const address = data[0];
    // Store address for potential use, but we'll use address from request data directly
    const previousAddress = lastRequestAddress;
    lastRequestAddress = address;
    
    const hexString = Array.from(data).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    log(`[PŘÍJEM] Adresa: ${address}, Data: ${hexString}, Délka: ${data.length} bytů`);
    
    if (previousAddress !== null && previousAddress !== address) {
        log(`[INFO] Předchozí adresa byla ${previousAddress}, nová adresa je ${address}`, 'info');
    }
    
    // Check if address is in valid range
    if (address < START_ADDRESS || address > END_ADDRESS) {
        log(`[BLOKOVÁNO] Adresa ${address} není v platném rozsahu (${START_ADDRESS}-${END_ADDRESS}) - požadavek ignorován`, 'warning');
        lastRequestAddress = null; // Reset after blocking
        return;
    }
    
    // Verify CRC
    const receivedCRC = data[data.length - 2] | (data[data.length - 1] << 8);
    const calculatedCRC = calculateCRC16(data.slice(0, -2));
    
    if (receivedCRC !== calculatedCRC) {
        log(`[CHYBA] Neplatný CRC: přijato 0x${receivedCRC.toString(16)}, vypočteno 0x${calculatedCRC.toString(16)}`, 'error');
        lastRequestAddress = null; // Reset after error
        return;
    }
    
    // Process request - pass the data array, address will be extracted from data[0] in the handler
    const functionCode = data[1];
    
    if (functionCode === 0x04) { // Read Input Registers
        processReadInputRegisters(data, address);
    } else {
        log(`[NEPODPOROVÁNO] Function code: 0x${functionCode.toString(16)}`, 'warning');
        lastRequestAddress = null; // Reset after unsupported function
    }
}

// Process Read Input Registers request
function processReadInputRegisters(request, address) {
    const startRegister = (request[2] << 8) | request[3];
    const quantity = (request[4] << 8) | request[5];
    
    // Ensure we use the correct address from the request
    const requestAddress = request[0]; // Get address directly from request data
    if (requestAddress !== address) {
        log(`[VAROVÁNÍ] Adresa z parametru ${address} se liší od adresy v requestu ${requestAddress} - používám adresu z requestu`, 'warning');
    }
    const correctAddress = requestAddress; // Use address from request data
    
    log(`[POŽADAVEK] Adresa: ${correctAddress}, Registr: ${startRegister} (0x${startRegister.toString(16).toUpperCase()}), Počet: ${quantity}`);
    
    // Update buffer values
    for (let i = 0; i < quantity; i++) {
        const registerAddr = startRegister + i;
        if (registerAddr >= MAX_REGISTER) continue;
        
        if (registerAddr === REGISTER_ADDRESS) {
            inputRegisters[registerAddr] = REGISTER_VALUE;
            log(`[BUFFER] Registr ${registerAddr} (0x${registerAddr.toString(16).toUpperCase()}): hodnota 0x${REGISTER_VALUE.toString(16).toUpperCase()} (speciální)`);
        } else {
            inputRegisters[registerAddr] = registerAddr & 0xFFFF;
            log(`[BUFFER] Registr ${registerAddr} (0x${registerAddr.toString(16).toUpperCase()}): hodnota 0x${registerAddr.toString(16).toUpperCase()} (stejná jako adresa)`);
        }
    }
    
    // Build response - use correct address from request
    const response = new Uint8Array(3 + quantity * 2 + 2);
    response[0] = correctAddress; // Use address from request, not parameter
    response[1] = 0x04; // Function code
    response[2] = quantity * 2; // Byte count
    
    // Add register values
    for (let i = 0; i < quantity; i++) {
        const regValue = inputRegisters[startRegister + i];
        response[3 + i * 2] = (regValue >> 8) & 0xFF;
        response[3 + i * 2 + 1] = regValue & 0xFF;
    }
    
    // Calculate and add CRC
    const crc = calculateCRC16(response.slice(0, -2));
    response[response.length - 2] = crc & 0xFF;
    response[response.length - 1] = (crc >> 8) & 0xFF;
    
    const hexString = Array.from(response).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    log(`[ODESLÁNO] Adresa: ${correctAddress}, FC: 0x04, Byte count: ${quantity * 2}, Data bytes: ${quantity * 2}, Celkem: ${response.length} bytů`);
    log(`[ODESLÁNO HEX] ${hexString}`);
    
    // Send response
    sendResponse(response);
}

// Send response
async function sendResponse(data) {
    if (!writer) return;
    
    try {
        await writer.write(data);
    } catch (error) {
        log(`Chyba odesílání: ${error.message}`, 'error');
    }
}

// Event listeners
document.getElementById('connectBtn').addEventListener('click', connect);
document.getElementById('disconnectBtn').addEventListener('click', disconnect);
document.getElementById('clearLogBtn').addEventListener('click', () => {
    document.getElementById('log').innerHTML = '';
});

// Update config from UI
document.getElementById('baudRate').addEventListener('change', (e) => {
    CONFIG.baudRate = parseInt(e.target.value);
    log(`Baud rate nastaven na: ${CONFIG.baudRate}`);
});

document.getElementById('startAddress').addEventListener('change', (e) => {
    START_ADDRESS = parseInt(e.target.value);
    log(`Start adresa nastavena na: ${START_ADDRESS}`);
});

document.getElementById('endAddress').addEventListener('change', (e) => {
    END_ADDRESS = parseInt(e.target.value);
    log(`End adresa nastavena na: ${END_ADDRESS}`);
});

document.getElementById('registerAddress').addEventListener('change', (e) => {
    REGISTER_ADDRESS = parseInt(e.target.value, 16);
    inputRegisters[REGISTER_ADDRESS] = REGISTER_VALUE;
    log(`Registr nastaven na: 0x${REGISTER_ADDRESS.toString(16).toUpperCase()}`);
});

document.getElementById('registerValue').addEventListener('change', (e) => {
    REGISTER_VALUE = parseInt(e.target.value, 16);
    inputRegisters[REGISTER_ADDRESS] = REGISTER_VALUE;
    log(`Hodnota registru nastavena na: 0x${REGISTER_VALUE.toString(16).toUpperCase()}`);
});

// Initialize
initRegisters();
log('Modbus RTU Simulator inicializován', 'success');
log('Použijte Chrome nebo Edge pro Web Serial API podporu', 'info');


