export const mergeDlcsIntoOriginal = async (originalData, selectedDlcs) => {
  // 원본 데이터 깊은 복사
  const result = JSON.parse(JSON.stringify(originalData))
  
  // RisuAI 모듈인지 확인
  const isRisuModule = result.spec === 'risu_module' && result.risuModule
  
  if (isRisuModule) {
    // RisuAI 모듈 처리
    return await mergeRisuModule(result, selectedDlcs)
  }
  
  // RisuAI V3 형식인지 확인
  const isV3Format = result.spec === 'chara_card_v3' && result.data
  const dataRoot = isV3Format ? result.data : result
  
  // character_book 초기화 (없으면 생성)
  if (!dataRoot.character_book) {
    dataRoot.character_book = {
      scan_depth: 7,
      token_budget: 99999,
      recursive_scanning: false,
      extensions: {
        risu_fullWordMatching: false
      },
      entries: []
    }
  }
  
  // assets 배열 초기화 (없으면 생성)
  if (!dataRoot.assets) {
    dataRoot.assets = []
  }
  
  // 섹션별로 DLC 처리
  selectedDlcs.forEach(dlc => {
    switch (dlc.section) {
      case 'lorebook':
        mergeLorebook(dataRoot, dlc)
        break
      case 'asset':
        mergeAsset(dataRoot, dlc, isV3Format)
        break
      case 'slot':
        // 슬롯은 별도로 처리하지 않고 나중에 일괄 처리
        break
    }
  })
  
  // 슬롯 DLC들을 마지막에 일괄 처리
  const slotDlcs = selectedDlcs.filter(dlc => dlc.section === 'slot')
  if (slotDlcs.length > 0) {
    mergeSlots(dataRoot, slotDlcs)
  }
  
  return result
}

// RisuAI 모듈 병합 처리
const mergeRisuModule = async (originalData, selectedDlcs) => {
  const { mergeLorebooks } = await import('./risumHandler.js')
  
  // lorebook DLC들 필터링 및 병합
  const lorebookDlcs = selectedDlcs.filter(dlc => dlc.section === 'lorebook')
  
  // 원본 모듈과 lorebook DLC 병합
  let mergedModule = mergeLorebooks(originalData.risuModule, lorebookDlcs.map(dlc => dlc.data))
  
  // 슬롯 DLC들을 risuModule에 적용
  const slotDlcs = selectedDlcs.filter(dlc => dlc.section === 'slot')
  if (slotDlcs.length > 0) {
    mergeSlots(mergedModule, slotDlcs)
  }
  
  // 병합된 모듈로 결과 업데이트
  const result = JSON.parse(JSON.stringify(originalData))
  result.risuModule = mergedModule
  result.mergedLorebookCount = lorebookDlcs.length
  result.mergedSlotCount = slotDlcs.length

  return result
}

const mergeLorebook = (dataRoot, dlc) => {
  const lorebookEntry = {
    keys: dlc.data.keys || [],
    content: dlc.data.content || '',
    extensions: dlc.data.extensions || {
      risu_case_sensitive: false,
      risu_loreCache: null
    },
    enabled: dlc.data.enabled !== undefined ? dlc.data.enabled : true,
    insertion_order: dlc.data.insertion_order || 10,
    constant: dlc.data.constant !== undefined ? dlc.data.constant : true,
    selective: dlc.data.selective !== undefined ? dlc.data.selective : false,
    name: dlc.data.name || dlc.name,
    comment: dlc.data.comment || '',
    case_sensitive: dlc.data.case_sensitive !== undefined ? dlc.data.case_sensitive : false,
    use_regex: dlc.data.use_regex !== undefined ? dlc.data.use_regex : false
  }
  
  dataRoot.character_book.entries.push(lorebookEntry)
}

const mergeAsset = (dataRoot, dlc, isV3Format = false) => {
  if (dlc.data.content && Array.isArray(dlc.data.content)) {
    dlc.data.content.forEach((assetItem) => {
      const asset = {
        type: 'x-risu-asset',
        uri: `embeded://assets/mod/${assetItem.filename}`,
        name: assetItem.assetname,
        ext: getFileExtension(assetItem.filename)
      }
      
      // V3 형식이면 이미 dataRoot가 data 객체를 가리키므로 dataRoot.assets에 추가
      // 일반 형식이면 dataRoot가 최상위 객체를 가리키므로 dataRoot.assets에 추가
      dataRoot.assets.push(asset)
    })
  }
}

const mergeSlots = (dataRoot, slotDlcs) => {
  // 같은 slotname끼리 그룹화
  const slotGroups = {}
  const separatorMap = {}
  const conflictingSeparators = []
  
  // 슬롯 DLC들을 그룹화하고 separator 검증
  slotDlcs.forEach(dlc => {
    const slotname = dlc.data.slotname
    const separator = dlc.data.separator || ''
    
    if (!slotGroups[slotname]) {
      slotGroups[slotname] = []
      separatorMap[slotname] = separator
    } else if (separatorMap[slotname] !== separator) {
      // separator가 다른 경우 충돌 목록에 추가
      if (!conflictingSeparators.find(conflict => 
        conflict.slotname === slotname)) {
        conflictingSeparators.push({
          slotname,
          separators: [separatorMap[slotname], separator],
          dlcNames: []
        })
      }
      const conflict = conflictingSeparators.find(c => c.slotname === slotname)
      if (!conflict.separators.includes(separator)) {
        conflict.separators.push(separator)
      }
    }
    
    slotGroups[slotname].push(dlc)
  })
  
  // separator 충돌이 있는 경우 오류 발생
  if (conflictingSeparators.length > 0) {
    const errorDetails = conflictingSeparators.map(conflict => {
      const dlcNames = slotGroups[conflict.slotname].map(dlc => dlc.data.name || dlc.name)
      return `슬롯 '${conflict.slotname}': separator 충돌 (${conflict.separators.map(s => `'${s}'`).join(', ')}) - DLC: ${dlcNames.join(', ')}`
    })
    throw new Error(`슬롯 DLC separator 충돌:\n${errorDetails.join('\n')}`)
  }
  
  // 각 슬롯 그룹별로 content를 join하고 원본 JSON에서 대치
  Object.entries(slotGroups).forEach(([slotname, dlcs]) => {
    const separator = separatorMap[slotname]
    const allContent = []
    
    // 모든 DLC의 content를 수집
    dlcs.forEach(dlc => {
      if (dlc.data.content && Array.isArray(dlc.data.content)) {
        allContent.push(...dlc.data.content)
      }
    })
    
    // separator로 join
    const joinedContent = allContent.join(separator)
    
    // 원본 JSON에서 slotname과 일치하는 텍스트를 joinedContent로 대치
    replaceSlotInJsonMutating(dataRoot, slotname, joinedContent)
  })
}

const replaceSlotInJsonMutating = (obj, slotname, replacement) => {
  // 정규식 특수 문자 이스케이프 ([, ], |, 기타 메타문자 포함)
  const escapedSlotname = slotname.replace(/[.*+?^${}()|\\[\]]/g, '\\$&')
  
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (typeof obj[i] === 'string') {
        obj[i] = obj[i].replace(new RegExp(escapedSlotname, 'g'), replacement)
      } else if (obj[i] && typeof obj[i] === 'object') {
        replaceSlotInJsonMutating(obj[i], slotname, replacement)
      }
    }
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        obj[key] = value.replace(new RegExp(escapedSlotname, 'g'), replacement)
      } else if (value && typeof value === 'object') {
        replaceSlotInJsonMutating(value, slotname, replacement)
      }
    }
  }
}

const getFileExtension = (filename) => {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : 'png'
}

// backgroundHTML 필드가 포함된 객체를 안전하게 JSON 문자열로 변환하는 함수
const createJSONStringWithPreservedHTML = (data) => {
  // backgroundHTML 필드를 임시로 제거하고 나머지를 JSON.stringify
  const backgroundHTMLs = new Map()
  const dataWithoutHTML = removeBackgroundHTML(data, backgroundHTMLs)
  
  // 먼저 backgroundHTML이 없는 상태로 JSON 문자열 생성
  let jsonString = JSON.stringify(dataWithoutHTML, null, 2)
  
  // backgroundHTML 필드들을 다시 삽입
  backgroundHTMLs.forEach((htmlContent, path) => {
    const escapedPath = path.replace(/\./g, '\\.')
    const regex = new RegExp(`("${escapedPath.split('.').pop()}": )"__PLACEHOLDER__"`, 'g')
    jsonString = jsonString.replace(regex, `$1${JSON.stringify(htmlContent)}`)
  })
  
  return jsonString
}

// backgroundHTML 필드를 임시로 제거하고 경로를 기록하는 함수
const removeBackgroundHTML = (obj, backgroundHTMLs, path = '') => {
  if (Array.isArray(obj)) {
    return obj.map((item, index) => 
      removeBackgroundHTML(item, backgroundHTMLs, `${path}[${index}]`)
    )
  } else if (obj && typeof obj === 'object') {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key
      
      if (key === 'backgroundHTML' && typeof value === 'string') {
        // backgroundHTML 필드를 임시 플레이스홀더로 대체하고 경로 기록
        backgroundHTMLs.set(currentPath, value)
        result[key] = '__PLACEHOLDER__'
      } else {
        result[key] = removeBackgroundHTML(value, backgroundHTMLs, currentPath)
      }
    }
    return result
  }
  return obj
}

export const validateMergeResult = (mergedData) => {
  const errors = []
  
  try {
    // JSON 직렬화 가능한지 확인
    JSON.stringify(mergedData)
  } catch (error) {
    errors.push(`JSON 직렬화 오류: ${error.message}`)
  }
  
  // 기본 구조 확인
  const isV3Format = mergedData.spec === 'chara_card_v3' && mergedData.data
  const dataRoot = isV3Format ? mergedData.data : mergedData
  
  if (!dataRoot.name) {
    errors.push('캐릭터 이름이 누락되었습니다')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export const downloadCharxFile = async (data, filename, selectedDlcs = [], originalZipData = null, originalRisumBuffer = null, risumAssets = []) => {
  try {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    
    // RisuAI 모듈인지 확인
    const isRisuModule = data.spec === 'risu_module' && data.risuModule
    
    if (isRisuModule) {
      // RisuAI 모듈의 경우 risum + card.json 형식으로 처리
      const { repackCharxWithMergedModule } = await import('./risumHandler.js')
      const JSZip = await import('jszip')
      const newZip = new JSZip.default()
      
      console.log('RisuAI 모듈 다운로드 처리 중...')
      
      // 1. 기존 파일들 복사 (card.json 제외)
      const copyPromises = []
      originalZipData.forEach((relativePath, zipEntry) => {
        if (!zipEntry.dir && relativePath !== 'card.json' && relativePath !== 'module.risum') {
          copyPromises.push(
            zipEntry.async('uint8array').then(fileData => {
              newZip.file(relativePath, fileData)
            })
          )
        }
      })
      await Promise.all(copyPromises)
      
      // 2. card.json 처리 - 에셋 DLC 병합
      let cardJsonData = {}
      const cardJsonFile = originalZipData.file('card.json')
      if (cardJsonFile) {
        const cardJsonContent = await cardJsonFile.async('text')
        cardJsonData = JSON.parse(cardJsonContent)
      }
      
      // card.json V3 형식 확인 및 assets 배열 초기화
      const isCardV3Format = cardJsonData.spec === 'chara_card_v3' && cardJsonData.data
      const cardDataRoot = isCardV3Format ? cardJsonData.data : cardJsonData
      
      if (!cardDataRoot.assets) {
        cardDataRoot.assets = []
      }
      
      // 에셋 DLC들을 card.json에 병합
      const assetDlcs = selectedDlcs.filter(dlc => dlc.section === 'asset')
      assetDlcs.forEach(dlc => {
        if (dlc.data.content && Array.isArray(dlc.data.content)) {
          dlc.data.content.forEach((assetItem) => {
            const asset = {
              type: 'x-risu-asset',
              uri: `embeded://assets/mod/${assetItem.filename}`,
              name: assetItem.assetname,
              ext: getFileExtension(assetItem.filename)
            }
            cardDataRoot.assets.push(asset)
          })
        }
      })
      
      // 슬롯 DLC들을 card.json에 적용
      const slotDlcs = selectedDlcs.filter(dlc => dlc.section === 'slot')
      if (slotDlcs.length > 0) {
        mergeSlots(cardDataRoot, slotDlcs)
      }
      
      // 업데이트된 card.json 저장
      const cardJsonString = createJSONStringWithPreservedHTML(cardJsonData)
      newZip.file('card.json', cardJsonString)
      
      // 3. 에셋 파일들을 assets/mod/에 추가
      for (const assetDlc of assetDlcs) {
        if (assetDlc.assetFiles && assetDlc.zipData) {
          for (const assetFile of assetDlc.assetFiles) {
            try {
              const imageData = await assetDlc.zipData.file(assetFile.path).async('uint8array')
              const filename = assetFile.path.replace('assets/', '') // assets/ 제거
              newZip.file(`assets/mod/${filename}`, imageData)
            } catch (error) {
              console.warn(`에셋 파일 ${assetFile.path} 추가 실패:`, error)
            }
          }
        }
      }
      
      // 4. module.risum 재패킹
      const repackResult = await repackCharxWithMergedModule(
        newZip,
        data.risuModule,
        risumAssets
      )
      
      if (!repackResult.success) {
        throw new Error(repackResult.error)
      }
      
      const charxFilename = filename.endsWith('.charx') ? filename : filename.replace(/\.json$/, '.charx')
      const url = URL.createObjectURL(new Blob([repackResult.buffer], { type: 'application/zip' }))

      const link = document.createElement('a')
      link.href = url
      link.download = charxFilename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // 별도의 module.risum 파일 다운로드 (content 제거)
      const { packEmptyContentRisum } = await import('./risumHandler.js')
      const emptyRisumResult = await packEmptyContentRisum(data.risuModule)

      if (emptyRisumResult.success) {
        const risumFilename = charxFilename.replace(/\.charx$/, '') + '_module.risum'
        const risumUrl = URL.createObjectURL(new Blob([emptyRisumResult.buffer], { type: 'application/octet-stream' }))

        const risumLink = document.createElement('a')
        risumLink.href = risumUrl
        risumLink.download = risumFilename
        document.body.appendChild(risumLink)
        risumLink.click()
        document.body.removeChild(risumLink)
        URL.revokeObjectURL(risumUrl)
      } else {
        console.warn('별도 risum 파일 생성 실패:', emptyRisumResult.error)
      }

      return { success: true }
    }
    
    // 일반 캐릭터 카드 처리
    // card.json 파일을 ZIP에 추가 (backgroundHTML 필드 보존)
    const jsonString = createJSONStringWithPreservedHTML(data)
    zip.file('card.json', jsonString)
    
    // 원본 파일의 기존 assets 디렉토리 복사
    if (originalZipData) {
      originalZipData.forEach((relativePath, zipEntry) => {
        // assets 디렉토리의 파일들 (mod 폴더 제외)
        if (!zipEntry.dir && relativePath.startsWith('assets/') && 
            !relativePath.startsWith('assets/mod/') && 
            relativePath !== 'assets/' &&
            /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(relativePath)) {
          try {
            const fileData = zipEntry.async('blob')
            zip.file(relativePath, fileData)
          } catch (error) {
            console.warn(`원본 에셋 파일 ${relativePath} 추가 실패:`, error)
          }
        }
      })
    }
    
    // 에셋 DLC들의 이미지 파일들을 assets/mod/ 디렉토리에 추가
    for (const dlc of selectedDlcs) {
      if (dlc.section === 'asset' && dlc.assetFiles && dlc.zipData) {
        for (const assetFile of dlc.assetFiles) {
          try {
            const imageData = await dlc.zipData.file(assetFile.path).async('blob')
            const filename = assetFile.path.replace('assets/', '') // assets/ 제거
            zip.file(`assets/mod/${filename}`, imageData)
          } catch (error) {
            console.warn(`에셋 파일 ${assetFile.path} 추가 실패:`, error)
          }
        }
      }
    }
    
    // ZIP 파일 생성
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    
    // 파일명이 .charx로 끝나지 않으면 추가
    const charxFilename = filename.endsWith('.charx') ? filename : filename.replace(/\.json$/, '.charx')
    
    const url = URL.createObjectURL(zipBlob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = charxFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    
    return { success: true }
  } catch (error) {
    return { 
      success: false, 
      error: `CHARX 다운로드 오류: ${error.message}` 
    }
  }
}

// 하위 호환성을 위해 기존 함수도 유지하되 내부적으로 charx 사용
export const downloadJsonFile = async (data, filename) => {
  return await downloadCharxFile(data, filename)
}