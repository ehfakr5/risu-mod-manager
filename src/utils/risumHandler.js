let packerInstance = null

// 브라우저 환경용 RisuPacker 클래스
class BrowserRisuPacker {
  static async create(wasmPath = '/rpack.wasm') {
    const instance = new BrowserRisuPacker()
    await instance.initWasm(wasmPath)
    return instance
  }

  async initWasm(wasmPath) {
    if (this.wasm) return

    const response = await fetch(wasmPath)
    const wasmBytes = await response.arrayBuffer()
    
    const { instance } = await WebAssembly.instantiate(wasmBytes, {
      __wbindgen_placeholder__: {
        __wbindgen_throw: (ptr, len) => {
          const mem = new Uint8Array(this.wasm.memory.buffer)
          const msg = new TextDecoder().decode(mem.subarray(ptr, ptr + len))
          throw new Error(`WASM Error: ${msg}`)
        },
      },
    })
    
    this.wasm = instance.exports
  }

  passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length, 1) >>> 0
    new Uint8Array(this.wasm.memory.buffer).set(arg, ptr)
    return [ptr, arg.length]
  }

  getArrayU8FromWasm0(ptr, len) {
    return new Uint8Array(this.wasm.memory.buffer, ptr, len).slice()
  }

  async runWasm(func, data) {
    const retptr = this.wasm.__wbindgen_add_to_stack_pointer(-16)
    try {
      const [ptr, len] = this.passArray8ToWasm0(data, this.wasm.__wbindgen_malloc)
      func(retptr, ptr, len)
      const dataView = new DataView(this.wasm.memory.buffer)
      const resultPtr = dataView.getInt32(retptr, true)
      const resultLen = dataView.getInt32(retptr + 4, true)
      const result = this.getArrayU8FromWasm0(resultPtr, resultLen)
      this.wasm.__wbindgen_free(resultPtr, resultLen, 1)
      return result
    } finally {
      this.wasm.__wbindgen_add_to_stack_pointer(16)
    }
  }

  async encodeRPack(data) {
    return this.runWasm(this.wasm.encode, data)
  }

  async decodeRPack(data) {
    return this.runWasm(this.wasm.decode, data)
  }

  async unpack(risumBuffer) {
    let pos = 0
    const view = new DataView(risumBuffer.buffer, risumBuffer.byteOffset, risumBuffer.byteLength)
    const textDecoder = new TextDecoder('utf-8')

    const readByte = () => view.getUint8(pos++)
    const readLength = () => { const len = view.getUint32(pos, true); pos += 4; return len }
    const readData = (len) => { const data = risumBuffer.subarray(pos, pos + len); pos += len; return data }

    if (readByte() !== 111) throw new Error('Invalid magic number')
    if (readByte() !== 0) throw new Error('Unsupported version')

    const mainLen = readLength()
    const mainData = readData(mainLen)
    const decodedMainData = await this.decodeRPack(mainData)
    const mainJson = JSON.parse(textDecoder.decode(decodedMainData))

    const assets = []
    while (pos < risumBuffer.length) {
      const mark = readByte()
      if (mark === 0) break
      if (mark !== 1) throw new Error(`Invalid asset marker at pos ${pos - 1}`)

      const assetLen = readLength()
      const assetData = readData(assetLen)
      const decodedAsset = await this.decodeRPack(assetData)
      assets.push(decodedAsset)
    }

    return { module: mainJson.module, assets, rawMainData: decodedMainData }
  }

  async pack({ module, assets = [], rawMainData = null }) {
    const textEncoder = new TextEncoder()
    
    const mainDataToEncode = rawMainData ? rawMainData :
        textEncoder.encode(JSON.stringify({ module, type: 'risuModule' }))

    const encodedMainData = await this.encodeRPack(mainDataToEncode)

    const buffers = []
    const write = (data) => buffers.push(data)
    const writeByte = (byte) => write(new Uint8Array([byte]))
    const writeLength = (len) => {
      const buffer = new ArrayBuffer(4)
      const view = new DataView(buffer)
      view.setUint32(0, len, true)
      write(new Uint8Array(buffer))
    }

    // 헤더 및 메인 데이터 작성
    writeByte(111)
    writeByte(0)
    writeLength(encodedMainData.length)
    write(encodedMainData)

    // 에셋 데이터 작성
    for (const assetData of assets) {
      const encodedAsset = await this.encodeRPack(assetData)
      writeByte(1) // Asset marker
      writeLength(encodedAsset.length)
      write(encodedAsset)
    }

    writeByte(0) // 파일 끝 마커

    // 모든 버퍼를 하나로 합침
    const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const buffer of buffers) {
      result.set(buffer, offset)
      offset += buffer.length
    }

    return result
  }
}

// Electron 환경 감지
const isElectron = () => {
  return typeof window !== 'undefined' && window.process && window.process.type === 'renderer' ||
         typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().indexOf(' electron/') > -1 ||
         typeof process !== 'undefined' && process.versions && process.versions.electron
}

// RisuPacker 인스턴스 초기화
const initPacker = async () => {
  if (!packerInstance) {
    try {
      // WASM 파일 경로 결정
      let wasmPath = '/rpack.wasm'
      
      if (isElectron()) {
        // Electron 환경에서는 public 폴더의 파일 직접 접근
        wasmPath = './rpack.wasm'
      }
      
      console.log('WASM 파일 로딩 시도:', wasmPath)
      console.log('현재 환경:', isElectron() ? 'Electron' : 'Browser')
      
      packerInstance = await BrowserRisuPacker.create(wasmPath)
      console.log('WASM 파일 로딩 성공')
    } catch (error) {
      console.error('RisuPacker 초기화 실패:', error)
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
      throw new Error(`RISUM 패커 초기화에 실패했습니다: ${error.message}`)
    }
  }
  return packerInstance
}

// .risum 파일을 언패킹하여 module.json 추출
export const unpackRisumFile = async (risumBuffer) => {
  try {
    const packer = await initPacker()
    const { module, assets } = await packer.unpack(risumBuffer)
    
    return {
      success: true,
      module,
      assets
    }
  } catch (error) {
    console.error('RISUM 언패킹 실패:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// module.json과 에셋을 .risum 파일로 패킹
export const packToRisum = async (moduleData, assets = []) => {
  try {
    const packer = await initPacker()
    const risumBuffer = await packer.pack({ 
      module: moduleData, 
      assets 
    })
    
    return {
      success: true,
      buffer: risumBuffer
    }
  } catch (error) {
    console.error('RISUM 패킹 실패:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// .charx 파일에서 module.risum을 찾아 언패킹
export const extractModuleFromCharx = async (zipData) => {
  try {
    // module.risum 파일 찾기
    const risumFile = zipData.file('module.risum')
    if (!risumFile) {
      return {
        success: false,
        error: 'module.risum 파일을 찾을 수 없습니다'
      }
    }
    
    // risum 파일을 바이너리로 읽기
    const risumBuffer = await risumFile.async('uint8array')
    
    // risum 파일 언패킹
    const unpackResult = await unpackRisumFile(risumBuffer)
    
    if (!unpackResult.success) {
      return unpackResult
    }
    
    return {
      success: true,
      module: unpackResult.module,
      assets: unpackResult.assets,
      originalRisumBuffer: risumBuffer
    }
  } catch (error) {
    console.error('Charx에서 모듈 추출 실패:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

// lorebook DLC를 module.json의 lorebook 배열에 병합
export const mergeLorebooks = (originalModule, lorebookDlcs) => {
  const mergedModule = JSON.parse(JSON.stringify(originalModule)) // 깊은 복사
  
  if (!mergedModule.lorebook) {
    mergedModule.lorebook = []
  }
  
  lorebookDlcs.forEach(dlc => {
    const lorebookEntry = {
      key: dlc.key || (dlc.keys ? dlc.keys.join(', ') : ''),
      comment: dlc.comment || dlc.name || '',
      content: dlc.content || '',
      mode: dlc.mode || 'normal',
      insertorder: dlc.insertorder || dlc.insertion_order || 10,
      alwaysActive: dlc.alwaysActive !== undefined ? dlc.alwaysActive : (dlc.enabled !== false),
      secondkey: dlc.secondkey || '',
      selective: dlc.selective === true,
      useRegex: dlc.use_regex === true,
      bookVersion: dlc.bookVersion || 2
    }
    
    // folder 필드가 있으면 추가
    if (dlc.folder) {
      lorebookEntry.folder = dlc.folder
    }
    
    mergedModule.lorebook.push(lorebookEntry)
  })
  
  return mergedModule
}

// 병합된 module.json을 .risum으로 패킹하고 .charx에 추가
export const repackCharxWithMergedModule = async (originalZipData, mergedModule, originalAssets = []) => {
  try {
    // 병합된 모듈을 risum으로 패킹
    const packResult = await packToRisum(mergedModule, originalAssets)
    
    if (!packResult.success) {
      return packResult
    }
    
    // 새로운 ZIP 생성 (기존 파일들 복사)
    const JSZip = await import('jszip')
    const newZip = new JSZip.default()
    
    // 기존 파일들 복사 (module.risum 제외)
    const copyPromises = []
    originalZipData.forEach((relativePath, zipEntry) => {
      if (relativePath !== 'module.risum' && !zipEntry.dir) {
        copyPromises.push(
          zipEntry.async('uint8array').then(data => {
            newZip.file(relativePath, data)
          })
        )
      }
    })
    
    await Promise.all(copyPromises)
    
    // 새로운 module.risum 추가
    newZip.file('module.risum', packResult.buffer)
    
    // ZIP 생성
    const newCharxBuffer = await newZip.generateAsync({ type: 'uint8array' })
    
    return {
      success: true,
      buffer: newCharxBuffer
    }
  } catch (error) {
    console.error('Charx 재패킹 실패:', error)
    return {
      success: false,
      error: error.message
    }
  }
}