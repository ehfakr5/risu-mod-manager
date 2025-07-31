import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// --- WebAssembly 로더 (rpack) --- //

let wasm;

async function initWasm(wasmPath) {
    if (wasm) return;
    const wasmBytes = await fs.readFile(wasmPath);
    const { instance } = await WebAssembly.instantiate(wasmBytes, {
        __wbindgen_placeholder__: {
            __wbindgen_throw: (ptr, len) => {
                const mem = new Uint8Array(wasm.memory.buffer);
                const msg = new TextDecoder().decode(mem.subarray(ptr, ptr + len));
                throw new Error(`WASM Error: ${msg}`);
            },
        },
    });
    wasm = instance.exports;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length, 1) >>> 0;
    new Uint8Array(wasm.memory.buffer).set(arg, ptr);
    return [ptr, arg.length];
}

function getArrayU8FromWasm0(ptr, len) {
    return new Uint8Array(wasm.memory.buffer, ptr, len).slice();
}

async function runWasm(func, data) {
    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
    try {
        const [ptr, len] = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
        func(retptr, ptr, len);
        const dataView = new DataView(wasm.memory.buffer);
        const resultPtr = dataView.getInt32(retptr, true);
        const resultLen = dataView.getInt32(retptr + 4, true);
        const result = getArrayU8FromWasm0(resultPtr, resultLen);
        wasm.__wbindgen_free(resultPtr, resultLen, 1);
        return result;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

const encodeRPack = (data) => runWasm(wasm.encode, data);
const decodeRPack = (data) => runWasm(wasm.decode, data);


// --- 라이브러리 클래스 --- //

export default class RisuPacker {
    
    static async create(wasmPath = 'rpack.wasm') {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const absoluteWasmPath = path.resolve(__dirname, wasmPath);
        await initWasm(absoluteWasmPath);
        return new RisuPacker();
    }

    /**
     * .risum 파일을 언패킹하여 module.json과 에셋 데이터를 추출합니다.
     * @param {Uint8Array} risumBuffer - .risum 파일의 바이너리 데이터
     * @returns {Promise<{module: object, assets: Uint8Array[]}>}
     */
    async unpack(risumBuffer) {
        let pos = 0;
        const view = new DataView(risumBuffer.buffer, risumBuffer.byteOffset, risumBuffer.byteLength);
        const textDecoder = new TextDecoder('utf-8');

        const readByte = () => view.getUint8(pos++);
        const readLength = () => { const len = view.getUint32(pos, true); pos += 4; return len; };
        const readData = (len) => { const data = risumBuffer.subarray(pos, pos + len); pos += len; return data; };

        if (readByte() !== 111) throw new Error('Invalid magic number');
        if (readByte() !== 0) throw new Error('Unsupported version');

        const mainLen = readLength();
        const mainData = readData(mainLen);
        const decodedMainData = await decodeRPack(mainData);
        const mainJson = JSON.parse(textDecoder.decode(decodedMainData));

        const assets = [];
        while (pos < risumBuffer.length) {
            const mark = readByte();
            if (mark === 0) break;
            if (mark !== 1) throw new Error(`Invalid asset marker at pos ${pos - 1}`);

            const assetLen = readLength();
            const assetData = readData(assetLen);
            const decodedAsset = await decodeRPack(assetData);
            assets.push(decodedAsset);
        }

        return { module: mainJson.module, assets, rawMainData: decodedMainData };
    }

    /**
     * module.json과 에셋 데이터를 .risum 파일로 패킹합니다.
     * @param {{module?: object, assets?: Uint8Array[], rawMainData?: Uint8Array}} data - 패킹할 데이터
     * @returns {Promise<Uint8Array>} - 생성된 .risum 파일 바이너리 데이터
     */
    async pack({ module, assets = [], rawMainData = null }) {
        const textEncoder = new TextEncoder();
        
        const mainDataToEncode = rawMainData ? rawMainData :
            textEncoder.encode(JSON.stringify({ module, type: 'risuModule' }));

        const encodedMainData = await encodeRPack(mainDataToEncode);

        const buffers = [];
        const write = (data) => buffers.push(data);
        const writeByte = (byte) => write(new Uint8Array([byte]));
        const writeLength = (len) => {
            const buffer = new ArrayBuffer(4);
            const view = new DataView(buffer);
            view.setUint32(0, len, true);
            write(new Uint8Array(buffer));
        };

        // 헤더 및 메인 데이터 작성
        writeByte(111);
        writeByte(0);
        writeLength(encodedMainData.length);
        write(encodedMainData);

        // 에셋 데이터 작성
        for (const assetData of assets) {
            const encodedAsset = await encodeRPack(assetData);
            writeByte(1); // Asset marker
            writeLength(encodedAsset.length);
            write(encodedAsset);
        }

        writeByte(0); // 파일 끝 마커

        // 모든 버퍼를 하나로 합침
        const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const buffer of buffers) {
            result.set(buffer, offset);
            offset += buffer.length;
        }

        return result;
    }
}