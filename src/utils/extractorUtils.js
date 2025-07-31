export const extractAndDownloadDlc = async (originalJson, selectedItemIds, filename) => {
  try {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    
    const isV3Format = originalJson.data.spec === 'chara_card_v3' && originalJson.data.data
    const dataRoot = isV3Format ? originalJson.data.data : originalJson.data
    
    let lorebookEntries = []
    let assetEntries = []
    
    // 선택된 항목들을 분류하고 추출
    selectedItemIds.forEach(itemId => {
      const [type, index] = itemId.split('-')
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
    })
    
    // 로어북 DLC들을 개별로 생성 (배열 형식)
    if (lorebookEntries.length > 0) {
      const lorebookDlcs = lorebookEntries.map(({ entry, originalIndex }) => ({
        name: entry.name || `로어북 엔트리 ${originalIndex + 1}`,
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
        comment: entry.comment || `원본에서 추출된 로어북 엔트리`,
        case_sensitive: entry.case_sensitive !== undefined ? entry.case_sensitive : false,
        use_regex: entry.use_regex !== undefined ? entry.use_regex : false
      }))
      
      zip.file('lorebook.json', JSON.stringify(lorebookDlcs, null, 2))
    }
    
    // 에셋 DLC들을 개별로 생성 (배열 형식)
    if (assetEntries.length > 0) {
      // assets 폴더 생성
      const assetsFolder = zip.folder('assets')
      
      const assetDlcs = assetEntries.map(({ asset, originalIndex }) => {
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
      
      zip.file('asset.json', JSON.stringify(assetDlcs, null, 2))
    }
    
    // 에셋이 없는 경우에도 빈 asset.json을 생성 (dlcpack 표준 구조)
    if (assetEntries.length === 0) {
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
      error: `DLC 추출 오류: ${error.message}` 
    }
  }
}