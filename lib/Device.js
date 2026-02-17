const EventEmitter = require('events');

class ModbusDevice extends EventEmitter {
    constructor(config) {
        super();
        this.name = config.name;
        this.description = config.description;
        this.registers = config.registers || [];

        // Initialize memory buffers
        // We'll use a max size for simplicity, or we could be dynamic. 
        // For now, let's use 65536 words (128KB) for each block to support full range
        this.memory = {
            coils: Buffer.alloc(65536, 0),          // 1 bit per coil, but mapped to bytes for simplicity? No, Modbus uses bits.
            // jsmodbus usually expects a Buffer where each byte is 8 coils. 
            // Let's stick to simple byte arrays for now and abstract access.
            // Actually, jsmodbus server handles the bit packing if we give it a buffer.
            discrete: Buffer.alloc(65536 / 8, 0),   // 8 inputs per byte
            holding: Buffer.alloc(65536 * 2, 0),    // 2 bytes per register
            input: Buffer.alloc(65536 * 2, 0)       // 2 bytes per register
        };

        // Initialize values from config
        this.initializeValues();

        // Build address maps for quick validation
        this.addressMaps = {
            'Coil': new Set(),
            'DiscreteInput': new Set(),
            'HoldingRegister': new Set(),
            'InputRegister': new Set()
        };

        this.registers.forEach(reg => {
            if (this.addressMaps[reg.type]) {
                const count = this.getRegisterCount(reg.dataType);
                for (let i = 0; i < count; i++) {
                    this.addressMaps[reg.type].add(reg.address + i);
                }
            }
        });
    }

    getRegisterCount(dataType) {
        switch (dataType.toLowerCase()) {
            case 'float32':
            case 'uint32':
            case 'int32':
                return 2;
            case 'float64':
                return 4;
            default:
                return 1; // uint16, int16, boolean (coils)
        }
    }

    initializeValues() {
        this.registers.forEach(reg => {
            try {
                this.writeRegister(reg.type, reg.address, reg.dataType, reg.value);
            } catch (e) {
                console.error(`Error initializing register ${reg.name} (${reg.address}): ${e.message}`);
            }
        });
    }

    isValidAddress(type, address, count = 1) {
        if (!this.addressMaps[type]) return false;

        for (let i = 0; i < count; i++) {
            if (!this.addressMaps[type].has(address + i)) {
                return false;
            }
        }
        return true;
    }

    getOffset(address, type) {
        if (type === 'HoldingRegister' || type === 'InputRegister') {
            return address * 2;
        }
        // For Coils / Discrete, jsmodbus maps buffer bytes to coils.
        // Byte 0: Coils 0-7, Byte 1: Coils 8-15
        return Math.floor(address / 8);
    }

    writeRegister(type, address, dataType, value) {
        const buffer = this.getBuffer(type);
        const offset = this.getOffset(address, type);

        if (offset >= buffer.length) {
            throw new Error(`Address ${address} out of bounds`);
        }

        switch (type) {
            case 'Coil':
            case 'DiscreteInput':
                this.writeBit(buffer, address, value);
                break;
            case 'HoldingRegister':
            case 'InputRegister':
                this.writeWord(buffer, offset, dataType, value);
                break;
            default:
                throw new Error(`Unknown register type: ${type}`);
        }
    }

    getBuffer(type) {
        switch (type) {
            case 'Coil': return this.memory.coils;
            case 'DiscreteInput': return this.memory.discrete;
            case 'HoldingRegister': return this.memory.holding;
            case 'InputRegister': return this.memory.input;
            default: throw new Error(`Unknown memory type: ${type}`);
        }
    }

    writeBit(buffer, address, value) {
        const byteIndex = Math.floor(address / 8);
        const bitIndex = address % 8;
        let byte = buffer[byteIndex];

        if (value) {
            byte |= (1 << bitIndex);
        } else {
            byte &= ~(1 << bitIndex);
        }

        buffer[byteIndex] = byte;
    }

    writeWord(buffer, offset, dataType, value) {
        switch (dataType.toLowerCase()) {
            case 'uint16':
                buffer.writeUInt16BE(value, offset);
                break;
            case 'int16':
                buffer.writeInt16BE(value, offset);
                break;
            case 'uint32':
                buffer.writeUInt32BE(value, offset);
                break;
            case 'int32':
                buffer.writeInt32BE(value, offset);
                break;
            case 'float32':
                buffer.writeFloatBE(value, offset);
                break;
            case 'float64':
                buffer.writeDoubleBE(value, offset);
                break;
            default: // Default to uint16
                buffer.writeUInt16BE(value, offset);
        }
    }

    getMemory() {
        return this.memory;
    }
}

module.exports = ModbusDevice;
