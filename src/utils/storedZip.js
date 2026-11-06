// ZIP32 store records. Keep file data as Blob parts and stream only the CRC calculation.
// https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
const maxZipSize = 0xffffffff
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let crc = index
    for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    return crc
})

async function crc32(blob) {
    const reader = blob.stream().getReader()
    let crc = 0xffffffff
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            for (let i = 0; i < value.length; i++) {
                crc = (crc >>> 8) ^ crcTable[(crc ^ value[i]) & 0xff]
            }
        }
    } finally {
        reader.releaseLock()
    }
    return (crc ^ 0xffffffff) >>> 0
}

function createRecord(length, signature) {
    const record = new DataView(new ArrayBuffer(length))
    record.setUint32(0, signature, true)
    return record
}

export async function createStoredZip(files) {
    const usedNames = new Set()
    const encoder = new TextEncoder()
    const entries = files.map(({ filename, blob }) => {
        const safeName = filename.replace(/[<>:"/\\|?*]/g, '_')
        const stem = safeName.replace(/\.risum$/i, '')
        let name = safeName
        let suffix = 2
        while (usedNames.has(name.normalize().toLowerCase())) {
            name = `${stem}-${suffix++}.risum`
        }
        usedNames.add(name.normalize().toLowerCase())
        return { name: encoder.encode(name), blob }
    })
    const size = entries.reduce((total, { name, blob }) => total + blob.size + 76 + name.length * 2, 22)
    if (size >= maxZipSize || entries.length >= 0xffff || entries.some(({ name }) => name.length > 0xffff)) {
        throw new Error('ZIP 한도를 넘었어요. 모듈 수를 줄이거나 개별 다운로드를 이용해 주세요.')
    }

    const parts = []
    const directory = []
    let offset = 0
    let directorySize = 0
    for (const { name, blob } of entries) {
        const local = createRecord(30, 0x04034b50)
        local.setUint16(4, 20, true)
        local.setUint16(6, 0x0800, true) // UTF-8 filenames.
        local.setUint16(12, 0x0021, true) // DOS date 1980-01-01.
        local.setUint32(14, await crc32(blob), true)
        local.setUint32(18, blob.size, true)
        local.setUint32(22, blob.size, true)
        local.setUint16(26, name.length, true)

        const central = createRecord(46, 0x02014b50)
        central.setUint16(4, 20, true)
        new Uint8Array(central.buffer).set(new Uint8Array(local.buffer, 4), 6)
        central.setUint32(42, offset, true)

        parts.push(local.buffer, name, blob)
        directory.push(central.buffer, name)
        offset += local.byteLength + name.length + blob.size
        directorySize += central.byteLength + name.length
    }

    const end = createRecord(22, 0x06054b50)
    end.setUint16(8, entries.length, true)
    end.setUint16(10, entries.length, true)
    end.setUint32(12, directorySize, true)
    end.setUint32(16, offset, true)
    return new Blob([...parts, ...directory, end.buffer], { type: 'application/zip' })
}
