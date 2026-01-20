// 파일명에서 확장자 제거
const removeFileExtension = (filename) => {
  if (!filename) return filename
  return filename.replace(/\.(zip|json)$/i, '')
}

// [[슬롯명]] 형식을 <<슬롯명>> 형식으로 변환
const normalizeSlotFormat = (slotname) => {
  if (!slotname || typeof slotname !== 'string') return slotname
  // [[...]] → <<...>>
  return slotname.replace(/^\[\[(.+)\]\]$/, '<<$1>>')
}

// mod ID 생성 헬퍼 함수
const generateModId = (...parts) => {
  return `mod-${Date.now()}-${parts.join('-')}`
}

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

  // mod 파일인 경우
  // regex mod 타입 체크
  if (jsonData.type === 'regex') {
    if (!jsonData.data || !Array.isArray(jsonData.data)) {
      errors.push('regex mod는 data 배열이 필요합니다')
    } else {
      jsonData.data.forEach((item, index) => {
        if (!item.hasOwnProperty('comment') || !item.hasOwnProperty('in') ||
            !item.hasOwnProperty('out') || !item.hasOwnProperty('type') ||
            !item.hasOwnProperty('ableFlag')) {
          errors.push(`data[${index}]에 comment, in, out, type, ableFlag 필드가 필요합니다`)
        }
      })
    }
    return {
      isValid: errors.length === 0,
      errors
    }
  }

  if (!jsonData.section) {
    errors.push('section 필드가 필요합니다')
  } else if (!['asset', 'slot'].includes(jsonData.section)) {
    errors.push('section은 asset, slot 중 하나여야 합니다')
  }

  if (!jsonData.name || typeof jsonData.name !== 'string') {
    errors.push('name 필드가 필요합니다')
  }

  switch (jsonData.section) {
    case 'asset':
      if (!jsonData.content || !Array.isArray(jsonData.content)) {
        errors.push('에셋 mod는 content 배열이 필요합니다')
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
        errors.push('슬롯 mod는 slotname이 필요합니다')
      }
      if (!jsonData.content || !Array.isArray(jsonData.content)) {
        errors.push('슬롯 mod는 content 배열이 필요합니다')
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

  // mod 파일인 경우 .charx도 지원하지만 주로 .json
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

const processModZipFile = async (file, index) => {
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
    let metadata = null

    zipData.forEach((relativePath, zipEntry) => {
      // 최상위 디렉토리의 JSON 파일만
      if (!zipEntry.dir && relativePath.endsWith('.json') && !relativePath.includes('/')) {
        // metadata.json은 별도 처리
        if (relativePath.toLowerCase() === 'metadata.json') {
          // metadata는 나중에 읽음
        } else {
          jsonFiles.push({ path: relativePath, entry: zipEntry })
        }
      }
      // assets 디렉토리의 이미지 파일들
      else if (!zipEntry.dir && relativePath.startsWith('assets/') &&
               /\.(png|jpg|jpeg|gif|webp)$/i.test(relativePath)) {
        assetFiles.push({ path: relativePath, entry: zipEntry })
      }
    })

    // metadata.json 읽기
    const metadataFile = zipData.file('metadata.json')
    if (metadataFile) {
      try {
        const metadataContent = await metadataFile.async('text')
        metadata = JSON.parse(metadataContent)
      } catch (error) {
        errors.push(`${file.name}/metadata.json: 파싱 오류 - ${error.message}`)
      }
    }

    // 파일 이름 결정 (metadata.mod_name이 있으면 사용, 없으면 파일명)
    const baseFileName = metadata?.mod_name || removeFileExtension(file.name)

    // JSON 파일들 처리
    for (const jsonFile of jsonFiles) {
      try {
        const jsonContent = await jsonFile.entry.async('text')
        const jsonData = JSON.parse(jsonContent)

        // 배열 형식인지 확인
        const modArray = Array.isArray(jsonData) ? jsonData : [jsonData]

        // lorebook_export.json인 경우 RisuAI 내보내기 형식으로 처리
        if (jsonFile.path.toLowerCase() === 'lorebook_export.json') {
          try {
            const risuMods = parseRisuExport(jsonData)
            risuMods.forEach((risuMod, risuIndex) => {
              const modItemObj = {
                id: generateModId(index, jsonFile.path, 'risu', risuIndex),
                name: `${baseFileName}/${risuMod.name || `항목 ${risuIndex + 1}`}`,
                section: risuMod.section,
                data: {
                  ...risuMod,
                  name: `${baseFileName}/${risuMod.name || `항목 ${risuIndex + 1}`}`
                },
                metadata: metadata,
                selected: false
              }
              results.push(modItemObj)
            })
          } catch (error) {
            errors.push(`${file.name}/${jsonFile.path}: RisuAI 형식 파싱 오류 - ${error.message}`)
          }
        } else {
          // 일반 mod 형식 처리
          modArray.forEach((modItem, modIndex) => {
            const validation = validateJsonStructure(modItem, false)

            if (validation.isValid) {
              // regex mod인 경우
              if (modItem.type === 'regex') {
                const regexItemObj = {
                  id: generateModId(index, jsonFile.path, modIndex),
                  name: `${baseFileName}/${jsonFile.path}${modArray.length > 1 ? `[${modIndex}]` : ''}`,
                  section: 'regex',
                  data: modItem,
                  metadata: metadata,
                  selected: false
                }
                results.push(regexItemObj)
              }
              // slot mod인 경우 content 배열의 각 항목을 개별 mod로 분리
              else if (modItem.section === 'slot' && modItem.content && Array.isArray(modItem.content) && modItem.content.length > 0) {
                const normalizedSlotname = normalizeSlotFormat(modItem.slotname)
                modItem.content.forEach((contentItem, contentIndex) => {
                  const slotItemObj = {
                    id: generateModId(index, jsonFile.path, modIndex, 'slot', contentIndex),
                    name: `${baseFileName}/${modItem.name || jsonFile.path}/${contentIndex}`,
                    section: modItem.section,
                    data: {
                      slotname: normalizedSlotname,
                      separator: modItem.separator,
                      content: [contentItem], // 단일 항목만 포함
                      name: `${baseFileName}/${modItem.name || jsonFile.path}/${contentIndex}`,
                      index: contentIndex,
                      contentValue: contentItem
                    },
                    metadata: metadata,
                    selected: false
                  }
                  results.push(slotItemObj)
                })
              } else {
                // 일반 mod (lorebook, asset) 또는 content가 없는 slot
                const modItemObj = {
                  id: generateModId(index, jsonFile.path, modIndex),
                  name: `${baseFileName}/${modItem.name || jsonFile.path}${modArray.length > 1 ? `[${modIndex}]` : ''}`,
                  section: modItem.section,
                  data: {
                    ...modItem,
                    name: `${baseFileName}/${modItem.name || jsonFile.path}${modArray.length > 1 ? `[${modIndex}]` : ''}`
                  },
                  metadata: metadata,
                  selected: false
                }

                // 에셋 mod인 경우 이미지 파일들도 포함
                if (modItem.section === 'asset') {
                  modItemObj.assetFiles = assetFiles
                  modItemObj.zipData = zipData // ZIP 데이터 보존
                }

                results.push(modItemObj)
              }
            } else {
              errors.push(`${file.name}/${jsonFile.path}[${modIndex}]: ${validation.errors.join(', ')}`)
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
        const autoAssetMod = {
          name: `${baseFileName}/에셋 팩`,
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

        const modItemObj = {
          id: generateModId(index, 'auto-asset'),
          name: autoAssetMod.name,
          section: autoAssetMod.section,
          data: autoAssetMod,
          metadata: metadata,
          selected: false,
          assetFiles: assetFiles,
          zipData: zipData
        }

        results.push(modItemObj)
      } catch (error) {
        errors.push(`${file.name}: 자동 에셋 mod 생성 오류 - ${error.message}`)
      }
    }

    // 처리 결과 확인
    if (results.length === 0 && jsonFiles.length === 0 && assetFiles.length === 0) {
      errors.push(`${file.name}: 사용 가능한 mod 파일이나 에셋 파일이 없습니다`)
    }

  } catch (error) {
    errors.push(`${file.name}: ZIP 파일 읽기 오류 - ${error.message}`)
  }

  return { results, errors }
}

export const processModFiles = async (files) => {
  const results = []
  const errors = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    if (file.name.toLowerCase().endsWith('.zip')) {
      // ZIP 파일 처리
      try {
        const zipResults = await processModZipFile(file, i)
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
            const risuMods = parseRisuExport(jsonData)
            const fileNameWithoutExt = removeFileExtension(file.name)
            risuMods.forEach((risuMod, risuIndex) => {
              results.push({
                id: generateModId(i, 'risu', risuIndex),
                name: `${fileNameWithoutExt}/${risuMod.name || `항목 ${risuIndex + 1}`}`,
                section: risuMod.section,
                data: {
                  ...risuMod,
                  name: `${fileNameWithoutExt}/${risuMod.name || `항목 ${risuIndex + 1}`}`
                },
                selected: false
              })
            })
          } catch (error) {
            errors.push(`${file.name}: RisuAI 형식 파싱 오류 - ${error.message}`)
          }
        } else {
          // 일반 mod 형식 처리
          const modArray = Array.isArray(jsonData) ? jsonData : [jsonData]
          const fileNameWithoutExt = removeFileExtension(file.name)

          modArray.forEach((modItem, modIndex) => {
            const validation = validateJsonStructure(modItem, false)

            if (validation.isValid) {
              // regex mod인 경우
              if (modItem.type === 'regex') {
                results.push({
                  id: generateModId(i, modIndex),
                  name: `${fileNameWithoutExt}/${file.name}${modArray.length > 1 ? `[${modIndex}]` : ''}`,
                  section: 'regex',
                  data: modItem,
                  selected: false
                })
              }
              // slot mod인 경우 content 배열의 각 항목을 개별 mod로 분리
              else if (modItem.section === 'slot' && modItem.content && Array.isArray(modItem.content) && modItem.content.length > 0) {
                const normalizedSlotname = normalizeSlotFormat(modItem.slotname)
                modItem.content.forEach((contentItem, contentIndex) => {
                  const slotItemObj = {
                    id: generateModId(i, modIndex, 'slot', contentIndex),
                    name: `${fileNameWithoutExt}/${modItem.name || `항목 ${modIndex + 1}`}/${contentIndex}`,
                    section: modItem.section,
                    data: {
                      slotname: normalizedSlotname,
                      separator: modItem.separator,
                      content: [contentItem], // 단일 항목만 포함
                      name: `${fileNameWithoutExt}/${modItem.name || `항목 ${modIndex + 1}`}/${contentIndex}`,
                      index: contentIndex,
                      contentValue: contentItem
                    },
                    selected: false
                  }
                  results.push(slotItemObj)
                })
              } else {
                // 일반 mod (lorebook, asset) 또는 content가 없는 slot
                results.push({
                  id: generateModId(i, modIndex),
                  name: `${fileNameWithoutExt}/${modItem.name || `항목 ${modIndex + 1}`}`,
                  section: modItem.section,
                  data: {
                    ...modItem,
                    name: `${fileNameWithoutExt}/${modItem.name || `항목 ${modIndex + 1}`}`
                  },
                  selected: false
                })
              }
            } else {
              errors.push(`${file.name}[${modIndex}]: ${validation.errors.join(', ')}`)
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
    'regex': '정규식',
    'unknown': '알 수 없음'
  }
  return sectionNames[section] || section
}

export const getSectionIcon = (section) => {
  const icons = {
    'lorebook': '📚',
    'asset': '🎨',
    'slot': '🔧',
    'regex': '🔤',
    'unknown': '❓'
  }
  return icons[section] || '📄'
}

export const getSectionBadgeColor = (section) => {
  const colors = {
    'lorebook': 'bg-amber-100 text-amber-800',
    'asset': 'bg-pink-100 text-pink-800',
    'slot': 'bg-emerald-100 text-emerald-800',
    'regex': 'bg-purple-100 text-purple-800',
    'unknown': 'bg-gray-100 text-gray-800'
  }
  return colors[section] || colors.unknown
}

// 원본 파일의 lorebook과 regex를 mod 형식으로 변환
export const parseOriginalItems = (originalData) => {
  const results = []

  // RisuAI 모듈인지 확인
  const isRisuModule = originalData.spec === 'risu_module' && originalData.risuModule

  if (isRisuModule) {
    // RisuAI 모듈의 lorebook 항목들
    if (originalData.risuModule.lorebook && Array.isArray(originalData.risuModule.lorebook)) {
      originalData.risuModule.lorebook.forEach((entry, index) => {
        const itemName = entry.comment || `로어북 ${index}`
        results.push({
          id: `original-lorebook-${index}`,
          name: `original/${itemName}`,
          section: 'lorebook',
          data: {
            ...entry,
            name: `original/${itemName}`,
            index: index
          },
          isOriginal: true,
          selected: true // 기본적으로 선택된 상태
        })
      })
    }

    // RisuAI 모듈의 regex 항목들
    if (originalData.risuModule.regex && Array.isArray(originalData.risuModule.regex)) {
      originalData.risuModule.regex.forEach((regexEntry, index) => {
        const itemName = regexEntry.comment || `정규식 ${index}`
        results.push({
          id: `original-regex-${index}`,
          name: `original/${itemName}`,
          section: 'regex',
          data: {
            ...regexEntry,
            index: index
          },
          isOriginal: true,
          selected: true
        })
      })
    }
  } else {
    // V3 형식 확인
    const isV3Format = originalData.spec === 'chara_card_v3' && originalData.data
    const dataRoot = isV3Format ? originalData.data : originalData

    // 일반 캐릭터 카드의 lorebook 항목들
    if (dataRoot.character_book && dataRoot.character_book.entries && Array.isArray(dataRoot.character_book.entries)) {
      dataRoot.character_book.entries.forEach((entry, index) => {
        const itemName = entry.comment || `로어북 ${index}`
        results.push({
          id: `original-lorebook-${index}`,
          name: `original/${itemName}`,
          section: 'lorebook',
          data: {
            ...entry,
            name: `original/${itemName}`,
            index: index
          },
          isOriginal: true,
          selected: true
        })
      })
    }
  }

  return results
}

// RisuAI 내보내기 형식을 일반 mod 형식으로 변환
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

    // RisuAI 엔트리를 표준 로어북 mod로 변환
    const modItem = {
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
      modItem.folder = entry.folder
    }

    results.push(modItem)
  })

  return results
}
