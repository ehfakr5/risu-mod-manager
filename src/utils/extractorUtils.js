export const extractAndDownloadMod = async (originalJson, selectedItemIds, filename) => {
  try {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()

    const isRisuModule = originalJson.isRisuModule
    const isV3Format = originalJson.data.spec === 'chara_card_v3' && originalJson.data.data
    const dataRoot = isV3Format ? originalJson.data.data : originalJson.data

    let lorebookEntries = []
    let assetEntries = []
    let regexEntries = []

    // 선택된 항목들을 분류하고 추출
    selectedItemIds.forEach(itemId => {
      const parts = itemId.split('-')

      if (isRisuModule) {
        // RisuAI 모듈 처리
        if (parts[0] === 'risu' && parts[1] === 'lorebook') {
          const idx = parseInt(parts[2])
          if (originalJson.data.risuModule?.lorebook?.[idx]) {
            lorebookEntries.push({
              entry: originalJson.data.risuModule.lorebook[idx],
              originalIndex: idx
            })
          }
        } else if (parts[0] === 'risu' && parts[1] === 'regex') {
          const idx = parseInt(parts[2])
          if (originalJson.data.risuModule?.regex?.[idx]) {
            regexEntries.push({
              entry: originalJson.data.risuModule.regex[idx],
              originalIndex: idx
            })
          }
        }
      } else {
        // 일반 캐릭터 카드 처리
        const [type, index] = parts
        const idx = parseInt(index)

        if (type === 'lorebook' && dataRoot.character_book?.entries?.[idx]) {
          const entry = dataRoot.character_book.entries[idx]
          lorebookEntries.push({
            entry,
            originalIndex: idx
          })
        } else if (type === 'asset' && dataRoot.assets) {
          const assets = dataRoot.assets.filter(asset => asset.type === 'x-risu-asset')
          if (assets[idx]) {
            assetEntries.push({
              asset: assets[idx],
              originalIndex: idx
            })
          }
        }
      }
    })
    
    // 로어북 mod들을 개별로 생성 (배열 형식)
    if (lorebookEntries.length > 0) {
      const lorebookMods = lorebookEntries.map(({ entry, originalIndex }) => ({
        name: entry.comment || entry.name || `로어북 엔트리 ${originalIndex + 1}`,
        section: "lorebook",
        keys: entry.keys || [],
        content: entry.content || "",
        extensions: entry.extensions || {
          risu_case_sensitive: false,
          risu_loreCache: null
        },
        enabled: entry.enabled !== undefined ? entry.enabled : true,
        insertion_order: entry.insertion_order || 10,
        constant: entry.constant !== undefined ? entry.constant : true,
        selective: entry.selective !== undefined ? entry.selective : false,
        comment: entry.comment || entry.name || `원본에서 추출된 로어북 엔트리`,
        case_sensitive: entry.case_sensitive !== undefined ? entry.case_sensitive : false,
        use_regex: entry.use_regex !== undefined ? entry.use_regex : false
      }))

      zip.file('lorebook.json', JSON.stringify(lorebookMods, null, 2))
    }
    
    // 에셋 mod들을 개별로 생성 (배열 형식)
    if (assetEntries.length > 0) {
      // assets 폴더 생성
      const assetsFolder = zip.folder('assets')

      const assetMods = assetEntries.map(({ asset, originalIndex }) => {
        // 파일명에서 확장자 추출
        const originalUri = asset.uri || ''
        const extension = asset.ext || 'png'
        const filename = `extracted_asset_${originalIndex + 1}.${extension}`
        
        // 원본 ZIP에서 에셋 파일 찾아서 복사
        if (originalJson.zipData && originalUri.includes('embeded://')) {
          const assetPath = originalUri.replace('embeded://', '')
          const originalAssetFile = originalJson.zipData.file(assetPath)
          
          if (originalAssetFile) {
            assetsFolder.file(filename, originalAssetFile.async('blob'))
          } else {
            // 에셋 파일을 찾을 수 없는 경우 더미 이미지 생성
            console.warn(`에셋 파일을 찾을 수 없음: ${assetPath}`)
            // 1x1 투명 PNG 더미 이미지
            const dummyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77ggAAAABJRU5ErkJggg=='
            assetsFolder.file(filename, dummyPng, { base64: true })
          }
        }
        
        return {
          name: asset.name || `추출된 에셋 ${originalIndex + 1}`,
          section: "asset",
          content: [{
            filename: filename,
            assetname: asset.name || `추출된 에셋 ${originalIndex + 1}`
          }]
        }
      })

      zip.file('asset.json', JSON.stringify(assetMods, null, 2))
    }
    
    // Regex mod 생성
    if (regexEntries.length > 0) {
      const regexMod = {
        type: "regex",
        data: regexEntries.map(({ entry, originalIndex }) => ({
          comment: entry.comment || `원본에서 추출된 정규식 ${originalIndex + 1}`,
          in: entry.in || "",
          out: entry.out || "",
          type: entry.type || "normal",
          ableFlag: entry.ableFlag !== undefined ? entry.ableFlag : true
        }))
      }

      zip.file('regex.json', JSON.stringify(regexMod, null, 2))
    }

    // 에셋이 없는 경우에도 빈 asset.json을 생성 (modpack 표준 구조)
    if (assetEntries.length === 0 && !isRisuModule) {
      zip.file('asset.json', JSON.stringify([], null, 2))
    }

    // ZIP 파일 생성 및 다운로드
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    
    const url = URL.createObjectURL(zipBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: `mod 추출 오류: ${error.message}`
    }
  }
}