export const validateJsonStructure = (jsonData, isOriginalFile = false) => {
  const errors = []
  
  if (!jsonData || typeof jsonData !== 'object') {
    errors.push('유효한 JSON 객체가 아닙니다')
    return { isValid: false, errors }
  }
  
  // 원본 파일인 경우 (RisuAI 캐릭터 카드)
  if (isOriginalFile) {
    if (jsonData.spec === 'chara_card_v3' && jsonData.data) {
      // RisuAI V3 형식
      if (!jsonData.data.name) {
        errors.push('캐릭터 이름이 필요합니다')
      }
      return { isValid: errors.length === 0, errors }
    } else if (jsonData.name || jsonData.description) {
      // 일반적인 캐릭터 카드 형식
      return { isValid: true, errors: [] }
    } else {
      errors.push('유효한 캐릭터 카드 형식이 아닙니다')
      return { isValid: false, errors }
    }
  }
  
  // DLC 파일인 경우
  if (!jsonData.section) {
    errors.push('section 필드가 필요합니다')
  } else if (!['lorebook', 'asset', 'slot'].includes(jsonData.section)) {
    errors.push('section은 lorebook, asset, slot 중 하나여야 합니다')
  }
  
  if (!jsonData.name || typeof jsonData.name !== 'string') {
    errors.push('name 필드가 필요합니다')
  }
  
  switch (jsonData.section) {
    case 'lorebook':
      if (!jsonData.keys || !Array.isArray(jsonData.keys)) {
        errors.push('로어북 DLC는 keys 배열이 필요합니다')
      }
      if (!jsonData.content || typeof jsonData.content !== 'string') {
        errors.push('로어북 DLC는 content 문자열이 필요합니다')
      }
      break
      
    case 'asset':
      if (!jsonData.content || !Array.isArray(jsonData.content)) {
        errors.push('에셋 DLC는 content 배열이 필요합니다')
      } else {
        jsonData.content.forEach((item, index) => {
          if (!item.filename || !item.assetname) {
            errors.push(`content[${index}]에 filename과 assetname이 필요합니다`)
          }
        })
      }
      break
      
    case 'slot':
      if (!jsonData.slotname || typeof jsonData.slotname !== 'string') {
        errors.push('슬롯 DLC는 slotname이 필요합니다')
      }
      if (!jsonData.content || !Array.isArray(jsonData.content)) {
        errors.push('슬롯 DLC는 content 배열이 필요합니다')
      }
      break
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export const readFileAsJson = async (file, isOriginalFile = false) => {
  // 원본 파일인 경우 .charx 또는 .zip 허용
  if (isOriginalFile) {
    const fileName = file.name.toLowerCase()
    if (!fileName.endsWith('.charx') && !fileName.endsWith('.zip')) {
      return {
        success: false,
        errors: ['원본 파일은 .charx 또는 .zip 형식만 지원합니다'],
        fileName: file.name
      }
    }
    return await readZipFile(file, isOriginalFile)
  }
  
  // DLC 파일인 경우 .charx도 지원하지만 주로 .json
  if (file.name.toLowerCase().endsWith('.charx')) {
    return await readZipFile(file, isOriginalFile)
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result)
        const validation = validateJsonStructure(jsonData, isOriginalFile)
        
        if (validation.isValid) {
          resolve({
            success: true,
            data: jsonData,
            fileName: file.name
          })
        } else {
          resolve({
            success: false,
            errors: validation.errors,
            fileName: file.name
          })
        }
      } catch (error) {
        resolve({
          success: false,
          errors: [`JSON 파싱 오류: ${error.message}`],
          fileName: file.name
        })
      }
    }
    
    reader.onerror = () => {
      reject(new Error(`파일 읽기 오류: ${file.name}`))
    }
    
    reader.readAsText(file)
  })
}

const readZipFile = async (file, isOriginalFile = false) => {
  try {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    
    const arrayBuffer = await file.arrayBuffer()
    const zipData = await zip.loadAsync(arrayBuffer)
    
    // module.risum 파일이 있는지 확인 (RisuAI 형식)
    const risumFile = zipData.file('module.risum')
    if (risumFile && isOriginalFile) {
      // risum 파일 처리
      const { extractModuleFromCharx } = await import('./risumHandler.js')
      const extractResult = await extractModuleFromCharx(zipData)
      
      if (extractResult.success) {
        return {
          success: true,
          data: {
            // RisuAI 모듈을 캐릭터 카드 형식으로 변환
            name: extractResult.module.name || 'RisuAI Module',
            description: extractResult.module.description || 'RisuAI Module',
            spec: 'risu_module',
            risuModule: extractResult.module
          },
          fileName: file.name,
          zipData: zipData,
          isRisuModule: true,
          originalRisumBuffer: extractResult.originalRisumBuffer,
          risumAssets: extractResult.assets
        }
      }
    }
    
    // card.json 파일 찾기 (일반적인 캐릭터 카드)
    const cardJsonFile = zipData.file('card.json')
    if (!cardJsonFile) {
      return {
        success: false,
        errors: ['card.json 또는 module.risum 파일을 찾을 수 없습니다'],
        fileName: file.name
      }
    }
    
    // card.json 내용 읽기
    const cardJsonContent = await cardJsonFile.async('text')
    const jsonData = JSON.parse(cardJsonContent)
    
    const validation = validateJsonStructure(jsonData, isOriginalFile)
    
    if (validation.isValid) {
      const result = {
        success: true,
        data: jsonData,
        fileName: file.name
      }
      
      // 원본 파일인 경우 ZIP 데이터도 보존
      if (isOriginalFile) {
        result.zipData = zipData
      }
      
      return result
    } else {
      return {
        success: false,
        errors: validation.errors,
        fileName: file.name
      }
    }
  } catch (error) {
    return {
      success: false,
      errors: [`ZIP 파일 처리 오류: ${error.message}`],
      fileName: file.name
    }
  }
}

const processDlcZipFile = async (file, index) => {
  const results = []
  const errors = []
  
  try {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    
    const arrayBuffer = await file.arrayBuffer()
    const zipData = await zip.loadAsync(arrayBuffer)
    
    // 최상위 디렉토리의 JSON 파일들 찾기
    const jsonFiles = []
    const assetFiles = []
    
    zipData.forEach((relativePath, zipEntry) => {
      // 최상위 디렉토리의 JSON 파일만
      if (!zipEntry.dir && relativePath.endsWith('.json') && !relativePath.includes('/')) {
        jsonFiles.push({ path: relativePath, entry: zipEntry })
      }
      // assets 디렉토리의 이미지 파일들
      else if (!zipEntry.dir && relativePath.startsWith('assets/') && 
               /\.(png|jpg|jpeg|gif|webp)$/i.test(relativePath)) {
        assetFiles.push({ path: relativePath, entry: zipEntry })
      }
    })
    
    // JSON 파일들 처리
    for (const jsonFile of jsonFiles) {
      try {
        const jsonContent = await jsonFile.entry.async('text')
        const jsonData = JSON.parse(jsonContent)
        
        // 배열 형식인지 확인
        const dlcArray = Array.isArray(jsonData) ? jsonData : [jsonData]
        
        // lorebook_export.json인 경우 RisuAI 내보내기 형식으로 처리
        if (jsonFile.path.toLowerCase() === 'lorebook_export.json') {
          try {
            const risuDlcs = parseRisuExport(jsonData)
            risuDlcs.forEach((risuDlc, risuIndex) => {
              const dlcItemObj = {
                id: `dlc-${Date.now()}-${index}-${jsonFile.path}-risu-${risuIndex}`,
                name: `${file.name}/${risuDlc.name || `항목 ${risuIndex + 1}`}`,
                section: risuDlc.section,
                data: {
                  ...risuDlc,
                  name: `${file.name}/${risuDlc.name || `항목 ${risuIndex + 1}`}`
                },
                selected: false
              }
              results.push(dlcItemObj)
            })
          } catch (error) {
            errors.push(`${file.name}/${jsonFile.path}: RisuAI 형식 파싱 오류 - ${error.message}`)
          }
        } else {
          // 일반 DLC 형식 처리
          dlcArray.forEach((dlcItem, dlcIndex) => {
            const validation = validateJsonStructure(dlcItem, false)
            
            if (validation.isValid) {
              const dlcItemObj = {
                id: `dlc-${Date.now()}-${index}-${jsonFile.path}-${dlcIndex}`,
                name: `${file.name}/${dlcItem.name || jsonFile.path}${dlcArray.length > 1 ? `[${dlcIndex}]` : ''}`,
                section: dlcItem.section,
                data: {
                  ...dlcItem,
                  name: `${file.name}/${dlcItem.name || jsonFile.path}${dlcArray.length > 1 ? `[${dlcIndex}]` : ''}`
                },
                selected: false
              }
              
              // 에셋 DLC인 경우 이미지 파일들도 포함
              if (dlcItem.section === 'asset') {
                dlcItemObj.assetFiles = assetFiles
                dlcItemObj.zipData = zipData // ZIP 데이터 보존
              }
              
              results.push(dlcItemObj)
            } else {
              errors.push(`${file.name}/${jsonFile.path}[${dlcIndex}]: ${validation.errors.join(', ')}`)
            }
          })
        }
      } catch (error) {
        errors.push(`${file.name}/${jsonFile.path}: JSON 파싱 오류 - ${error.message}`)
      }
    }
    
    // asset.json이 없지만 assets 폴더에 이미지가 있는 경우 자동 생성
    const hasAssetJson = jsonFiles.some(jsonFile => jsonFile.path.toLowerCase().includes('asset'))
    if (!hasAssetJson && assetFiles.length > 0) {
      try {
        const autoAssetDlc = {
          name: `${file.name}/에셋 팩`,
          section: "asset", 
          content: assetFiles.map((assetFile) => {
            // 파일명에서 확장자 제거하여 에셋명 생성
            const filename = assetFile.path.split('/').pop()
            const assetname = filename.replace(/\.[^/.]+$/, '')
            
            return {
              filename: filename,
              assetname: assetname
            }
          })
        }
        
        const dlcItemObj = {
          id: `dlc-${Date.now()}-${index}-auto-asset`,
          name: autoAssetDlc.name,
          section: autoAssetDlc.section,
          data: autoAssetDlc,
          selected: false,
          assetFiles: assetFiles,
          zipData: zipData
        }
        
        results.push(dlcItemObj)
      } catch (error) {
        errors.push(`${file.name}: 자동 에셋 DLC 생성 오류 - ${error.message}`)
      }
    }
    
    // 처리 결과 확인
    if (results.length === 0 && jsonFiles.length === 0 && assetFiles.length === 0) {
      errors.push(`${file.name}: 사용 가능한 DLC 파일이나 에셋 파일이 없습니다`)
    }
    
  } catch (error) {
    errors.push(`${file.name}: ZIP 파일 읽기 오류 - ${error.message}`)
  }
  
  return { results, errors }
}

export const processDlcFiles = async (files) => {
  const results = []
  const errors = []
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    
    if (file.name.toLowerCase().endsWith('.zip')) {
      // ZIP 파일 처리
      try {
        const zipResults = await processDlcZipFile(file, i)
        results.push(...zipResults.results)
        errors.push(...zipResults.errors)
      } catch (error) {
        errors.push(`${file.name}: ZIP 처리 오류 - ${error.message}`)
      }
    } else if (file.name.endsWith('.json')) {
      // 기존 JSON 파일 처리 - 배열 지원
      try {
        const reader = new FileReader()
        const fileContent = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target.result)
          reader.onerror = () => reject(new Error(`파일 읽기 오류: ${file.name}`))
          reader.readAsText(file)
        })
        
        const jsonData = JSON.parse(fileContent)
        
        // lorebook_export.json인 경우 RisuAI 내보내기 형식으로 처리
        if (file.name.toLowerCase() === 'lorebook_export.json') {
          try {
            const risuDlcs = parseRisuExport(jsonData)
            risuDlcs.forEach((risuDlc, risuIndex) => {
              results.push({
                id: `dlc-${Date.now()}-${i}-risu-${risuIndex}`,
                name: `${file.name}/${risuDlc.name || `항목 ${risuIndex + 1}`}`,
                section: risuDlc.section,
                data: {
                  ...risuDlc,
                  name: `${file.name}/${risuDlc.name || `항목 ${risuIndex + 1}`}`
                },
                selected: false
              })
            })
          } catch (error) {
            errors.push(`${file.name}: RisuAI 형식 파싱 오류 - ${error.message}`)
          }
        } else {
          // 일반 DLC 형식 처리
          const dlcArray = Array.isArray(jsonData) ? jsonData : [jsonData]
          
          dlcArray.forEach((dlcItem, dlcIndex) => {
            const validation = validateJsonStructure(dlcItem, false)
            
            if (validation.isValid) {
              results.push({
                id: `dlc-${Date.now()}-${i}-${dlcIndex}`,
                name: `${file.name}/${dlcItem.name || `항목 ${dlcIndex + 1}`}`,
                section: dlcItem.section,
                data: {
                  ...dlcItem,
                  name: `${file.name}/${dlcItem.name || `항목 ${dlcIndex + 1}`}`
                },
                selected: false
              })
            } else {
              errors.push(`${file.name}[${dlcIndex}]: ${validation.errors.join(', ')}`)
            }
          })
        }
      } catch (error) {
        errors.push(`${file.name}: ${error.message}`)
      }
    } else {
      errors.push(`${file.name}: 지원하지 않는 파일 형식입니다`)
    }
  }
  
  return { results, errors }
}

export const getSectionDisplayName = (section) => {
  const sectionNames = {
    'lorebook': '로어북',
    'asset': '에셋',  
    'slot': '슬롯',
    'unknown': '알 수 없음'
  }
  return sectionNames[section] || section
}

export const getSectionIcon = (section) => {
  const icons = {
    'lorebook': '📚',
    'asset': '🎨',
    'slot': '🔧',
    'unknown': '❓'
  }
  return icons[section] || '📄'
}

// RisuAI 내보내기 형식을 일반 DLC 형식으로 변환
export const parseRisuExport = (risuExportData) => {
  const results = []
  
  if (!risuExportData || risuExportData.type !== 'risu' || !risuExportData.data) {
    throw new Error('유효한 RisuAI 내보내기 형식이 아닙니다')
  }
  
  const entries = risuExportData.data.filter(entry => 
    entry.mode && (entry.mode === 'normal' || entry.mode === 'folder')
  )
  
  entries.forEach((entry, index) => {
    // 키 파싱 - 쉼표로 구분된 키들 처리
    const parseKeys = (keyString) => {
      if (!keyString) return []
      return keyString.split(',').map(key => key.trim()).filter(key => key.length > 0)
    }
    
    const primaryKeys = parseKeys(entry.key)
    const secondaryKeys = parseKeys(entry.secondkey)
    const allKeys = [...primaryKeys, ...secondaryKeys]
    
    // RisuAI 엔트리를 표준 로어북 DLC로 변환
    const dlcItem = {
      name: entry.comment || (allKeys.length > 0 ? allKeys[0] : '') || `로어북 엔트리 ${index + 1}`,
      section: "lorebook",
      keys: allKeys,
      content: entry.content || "",
      extensions: {
        risu_case_sensitive: entry.useRegex === true,
        risu_loreCache: null
      },
      enabled: entry.alwaysActive !== false,
      insertion_order: entry.insertorder || 10,
      constant: entry.alwaysActive !== false,
      selective: entry.selective === true,
      comment: entry.comment || "",
      case_sensitive: entry.useRegex === true,
      use_regex: entry.useRegex === true,
      // RisuAI 원본 필드들도 보존
      key: entry.key || '',
      mode: entry.mode,
      insertorder: entry.insertorder,
      alwaysActive: entry.alwaysActive,
      secondkey: entry.secondkey || '',
      bookVersion: entry.bookVersion || 2
    }
    
    // folder 필드가 있으면 추가
    if (entry.folder) {
      dlcItem.folder = entry.folder
    }
    
    results.push(dlcItem)
  })
  
  return results
}