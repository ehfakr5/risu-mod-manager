export const flattenSlotMods = (mods) => {
    return mods.flatMap(mod => {
        if (mod.data && Array.isArray(mod.data)) {
            return mod.data.map(item => ({
                ...mod,
                section: item.section || mod.section,
                data: item
            }))
        }
        return mod
    })
}

export const mergeModsIntoOriginal = async (originalData, selectedMods) => {
    // 원본 데이터 깊은 복사
    const result = JSON.parse(JSON.stringify(originalData))

    // remove_object 처리: 메타데이터에 제외할 경로가 지정된 mod 필터링
    const removedMods = [] // remove_object로 제외된 mod들을 추적
    let filteredMods = selectedMods.filter(mod => {
        // 다른 mod들의 metadata.remove_object에 이 mod의 name이 포함되어 있는지 확인
        const shouldRemove = selectedMods.some(otherMod => {
            if (!otherMod.metadata?.remove_object || !Array.isArray(otherMod.metadata.remove_object)) {
                return false
            }
            return otherMod.metadata.remove_object.includes(mod.name)
        })
        if (shouldRemove) {
            removedMods.push(mod) // 제외된 mod 추적
        }
        return !shouldRemove
    })

    // original 항목들이 항상 먼저 처리되도록 정렬
    // original -> order 내림차순 -> metadata 없는 항목들
    filteredMods.sort((a, b) => {
        // original 항목은 항상 최우선
        if (a.isOriginal && !b.isOriginal) return -1
        if (!a.isOriginal && b.isOriginal) return 1
        if (a.isOriginal && b.isOriginal) return 0

        // original이 아닌 경우 order로 정렬 (내림차순)
        const orderA = a.metadata?.order !== undefined ? a.metadata.order : 0
        const orderB = b.metadata?.order !== undefined ? b.metadata.order : 0
        return orderB - orderA
    })

    // 원본 항목(isOriginal=true) 중 제거할 항목들:
    // 1. filteredMods 안에서 선택되지 않은 항목들
    // 2. remove_object로 제외된 원본 항목들
    const originalItemsToRemove = [
        ...filteredMods.filter(mod => mod.isOriginal && !mod.selected),
        ...removedMods.filter(mod => mod.isOriginal)
    ]

    // RisuAI 모듈인지 확인
    const isRisuModule = result.spec === 'risu_module' && result.risuModule

    if (isRisuModule) {
        // RisuAI 모듈의 원본 항목 제거
        // lorebook 항목 제거 (인덱스 역순으로 제거)
        const lorebookIndicesToRemove = originalItemsToRemove
            .filter(i => i.section === 'lorebook' && i.data.index !== undefined)
            .map(i => i.data.index)
            .sort((a, b) => b - a)

        if (result.risuModule.lorebook && lorebookIndicesToRemove.length > 0) {
            lorebookIndicesToRemove.forEach(index => {
                result.risuModule.lorebook.splice(index, 1)
            })
        }

        // regex 항목 제거 (인덱스 역순으로 제거)
        const regexIndicesToRemove = originalItemsToRemove
            .filter(i => i.section === 'regex' && i.data.index !== undefined)
            .map(i => i.data.index)
            .sort((a, b) => b - a)

        if (result.risuModule.regex && regexIndicesToRemove.length > 0) {
            regexIndicesToRemove.forEach(index => {
                result.risuModule.regex.splice(index, 1)
            })
        }

        // 원본이 아닌 mod만 병합
        const nonOriginalMods = filteredMods.filter(mod => !mod.isOriginal)
        return await mergeRisuModule(result, nonOriginalMods)
    }

    // RisuAI V3 형식인지 확인
    const isV3Format = result.spec === 'chara_card_v3' && result.data
    const dataRoot = isV3Format ? result.data : result

    // 일반 캐릭터 카드의 원본 항목 제거
    // lorebook 항목 제거 (인덱스 역순으로 제거)
    const lorebookIndicesToRemove = originalItemsToRemove
        .filter(i => i.section === 'lorebook' && i.data.index !== undefined)
        .map(i => i.data.index)
        .sort((a, b) => b - a)

    if (dataRoot.character_book && dataRoot.character_book.entries && lorebookIndicesToRemove.length > 0) {
        lorebookIndicesToRemove.forEach(index => {
            dataRoot.character_book.entries.splice(index, 1)
        })
    }

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

    // 원본이 아닌 mod만 병합
    const rawNonOriginalMods = filteredMods.filter(mod => !mod.isOriginal)
    const nonOriginalMods = flattenSlotMods(rawNonOriginalMods)

    // 섹션별로 mod 처리 (nonOriginalMods 사용)
    nonOriginalMods.forEach(mod => {
        switch (mod.section) {
            case 'lorebook':
                mergeLorebook(dataRoot, mod)
                break
            case 'asset':
                mergeAsset(dataRoot, mod, isV3Format)
                break
            case 'slot':
                // 슬롯은 별도로 처리하지 않고 나중에 일괄 처리
                break
        }
    })

    // 슬롯 mod들을 마지막에 일괄 처리 (사전 정의 슬롯 제외)
    const slotMods = nonOriginalMods.filter(mod =>
        mod.section === 'slot' &&
        mod.data.slotname !== '<<lua>>' &&
        mod.data.slotname !== '<<toggle>>' &&
        mod.data.slotname !== '<<embedding>>'
    )
    if (slotMods.length > 0) {
        mergeSlots(dataRoot, slotMods)
    }

    // 사용되지 않은 슬롯 제거
    removeUnusedSlots(dataRoot)

    return result
}

// RisuAI 모듈 병합 처리
const mergeRisuModule = async (originalData, selectedMods) => {
    const { mergeLorebooks } = await import('./risumHandler.js')

    // lorebook mod들 필터링 및 병합
    const lorebookMods = selectedMods.filter(mod => mod.section === 'lorebook')

    // 원본 모듈과 lorebook mod 병합 (전체 mod 객체 전달)
    let mergedModule = mergeLorebooks(originalData.risuModule, lorebookMods)

    // 슬롯 mod들을 risuModule에 적용 (특수 슬롯 제외)
    const rawSlotMods = selectedMods.filter(mod => mod.section === 'slot' || (mod.data && Array.isArray(mod.data)))
    const flattenedSlotMods = flattenSlotMods(rawSlotMods)

    const slotMods = flattenedSlotMods.filter(mod =>
        mod.section === 'slot' &&
        mod.data.slotname !== '<<lua>>' &&
        mod.data.slotname !== '<<toggle>>' &&
        mod.data.slotname !== '<<embedding>>'
    )
    if (slotMods.length > 0) {
        mergeSlots(mergedModule, slotMods)
    }

    // 사용되지 않은 슬롯 제거
    removeUnusedSlots(mergedModule)

    // 병합된 모듈로 결과 업데이트
    const result = JSON.parse(JSON.stringify(originalData))
    result.risuModule = mergedModule
    result.mergedLorebookCount = lorebookMods.length
    result.mergedSlotCount = slotMods.length

    return result
}

const mergeLorebook = (dataRoot, mod) => {
    const lorebookEntry = {
        keys: mod.data.keys || [],
        content: mod.data.content || '',
        extensions: mod.data.extensions || {
            risu_case_sensitive: false,
            risu_loreCache: null
        },
        enabled: mod.data.enabled !== undefined ? mod.data.enabled : true,
        insertion_order: mod.data.insertion_order || 10,
        constant: mod.data.constant !== undefined ? mod.data.constant : true,
        selective: mod.data.selective !== undefined ? mod.data.selective : false,
        name: mod.data.name || mod.name,
        comment: mod.data.comment || '',
        case_sensitive: mod.data.case_sensitive !== undefined ? mod.data.case_sensitive : false,
        use_regex: mod.data.use_regex !== undefined ? mod.data.use_regex : false
    }

    dataRoot.character_book.entries.push(lorebookEntry)
}

const mergeAsset = (dataRoot, mod, isV3Format = false) => {
    if (mod.data.content && Array.isArray(mod.data.content)) {
        mod.data.content.forEach((assetItem) => {
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

const mergeSlots = (dataRoot, slotMods) => {
    // 같은 slotname끼리 그룹화
    const slotGroups = {}
    const separatorMap = {}
    const conflictingSeparators = []

    // 슬롯 mod들을 그룹화하고 separator 검증
    slotMods.forEach(mod => {
        const slotname = mod.data.slotname
        const separator = mod.data.separator || ''

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
                    modNames: []
                })
            }
            const conflict = conflictingSeparators.find(c => c.slotname === slotname)
            if (!conflict.separators.includes(separator)) {
                conflict.separators.push(separator)
            }
        }

        slotGroups[slotname].push(mod)
    })

    // separator 충돌이 있는 경우 오류 발생
    if (conflictingSeparators.length > 0) {
        const errorDetails = conflictingSeparators.map(conflict => {
            const modNames = slotGroups[conflict.slotname].map(mod => mod.data.name || mod.name)
            return `슬롯 '${conflict.slotname}': separator 충돌 (${conflict.separators.map(s => `'${s}'`).join(', ')}) - mod: ${modNames.join(', ')}`
        })
        throw new Error(`슬롯 mod separator 충돌:\n${errorDetails.join('\n')}`)
    }

    // 각 슬롯 그룹별로 content를 join하고 원본 JSON에서 대치
    Object.entries(slotGroups).forEach(([slotname, mods]) => {
        const separator = separatorMap[slotname]

        // zip 파일별로 그룹화
        const zipGroups = {}
        mods.forEach(mod => {
            // zip 파일 이름 추출
            let zipFileName = ''
            if (mod.name) {
                const parts = mod.name.split('/')
                zipFileName = parts[0]
            }

            if (!zipGroups[zipFileName]) {
                zipGroups[zipFileName] = []
            }
            zipGroups[zipFileName].push(mod)
        })

        // 각 zip 파일 그룹별로 content 병합 및 토글 적용
        const zipContentParts = []
        Object.entries(zipGroups).forEach(([zipFileName, zipMods]) => {
            const zipContent = []

            // 해당 zip의 모든 mod content를 수집
            zipMods.forEach(mod => {
                if (mod.data.content && Array.isArray(mod.data.content)) {
                    zipContent.push(...mod.data.content)
                }
            })

            // separator를 접두사로 붙여서 join
            let mergedContent = zipContent.map(item => separator + item).join('')

            // toggleable 체크 (기본값: true, false일 때만 토글 미적용)
            const firstMod = zipMods[0]
            const toggleable = firstMod.data.toggleable !== false

            // slotname에 'lua'가 포함되어 있는지 확인
            const containsLua = slotname.toLowerCase().includes('lua')

            // toggleable이 true이고, slotname에 'lua'가 없으면 토글 문법으로 감싸기
            if (toggleable && !containsLua && zipFileName && mergedContent) {
                mergedContent = `{{#if {{? {{getglobalvar::toggle_${zipFileName}}}=1}}}}${mergedContent}{{/if}}`
            }

            if (mergedContent) {
                zipContentParts.push(mergedContent)
            }
        })

        // 모든 zip 파일 그룹의 content를 합침 (separator 없이)
        const finalContent = zipContentParts.join('')

        // 원본 JSON에서 slotname과 일치하는 텍스트를 finalContent로 대치
        replaceSlotInJsonMutating(dataRoot, slotname, finalContent)
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

// 사용되지 않은 슬롯 제거 함수
// <<slotname>> 형식의 슬롯 패턴을 찾아서 제거 (공백 포함 가능, 줄바꿈 제외)
// 참고: [[...]] 형식은 Lua 멀티라인 문자열 문법과 충돌하므로 제외
const removeUnusedSlots = (obj) => {
    // 슬롯 패턴: <<...>> 형식만 처리 (공백 포함 가능, 줄바꿈 제외)
    const slotPattern = /<<[^<>\n]+>>/g

    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (typeof obj[i] === 'string') {
                // 문자열에서 슬롯 패턴 제거
                obj[i] = obj[i].replace(slotPattern, '')
            } else if (obj[i] && typeof obj[i] === 'object') {
                removeUnusedSlots(obj[i])
            }
        }
    } else if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                // 문자열에서 슬롯 패턴 제거
                obj[key] = value.replace(slotPattern, '')
            } else if (value && typeof value === 'object') {
                removeUnusedSlots(value)
            }
        }
    }
}

const getFileExtension = (filename) => {
    const parts = filename.split('.')
    return parts.length > 1 ? parts[parts.length - 1] : 'png'
}

// JSON 문자열로 안전하게 변환하는 함수
const createJSONStringWithPreservedHTML = (data) => {
    // JSON.stringify는 이미 모든 특수문자를 올바르게 이스케이핑하므로
    // 별도의 특수처리 없이 표준 방식 사용
    return JSON.stringify(data, null, 2)
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

export const downloadCharxFile = async (data, filename, selectedMods = [], originalZipData = null, originalRisumBuffer = null, risumAssets = []) => {
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

            // 2. card.json 처리 - 에셋 mod 병합
            let cardJsonData = {}
            const cardJsonFile = originalZipData.file('card.json')
            if (cardJsonFile) {
                const cardJsonContent = await cardJsonFile.async('text')
                cardJsonData = JSON.parse(cardJsonContent)
            }

            // 사전 정의된 슬롯 처리: <<lua>>, <<toggle>>
            // 먼저 모든 mod를 flatten하여 section이 내부에 있는 경우를 처리
            const flattenedMods = flattenSlotMods(selectedMods)
            const slotMods = flattenedMods.filter(mod => mod.section === 'slot')

            // <<lua>> 슬롯 수집 (trigger code용)
            const luaSlots = slotMods.filter(mod => mod.data.slotname === '<<lua>>')
            let luaCode = ''
            luaSlots.forEach(slot => {
                if (slot.data.content && Array.isArray(slot.data.content)) {
                    const separator = slot.data.separator || ''
                    luaCode += slot.data.content.map(item => separator + item).join('')
                }
            })

            // <<toggle>> 슬롯 수집 (customModuleToggle용)
            const toggleSlots = slotMods.filter(mod => mod.data.slotname === '<<toggle>>')
            let toggleContent = ''
            toggleSlots.forEach(slot => {
                if (slot.data.content && Array.isArray(slot.data.content)) {
                    const separator = slot.data.separator || ''
                    toggleContent += slot.data.content.map(item => separator + item).join('')
                }
            })

            // <<embedding>> 슬롯 수집 (backgroundEmbedding용)
            const embeddingSlots = slotMods.filter(mod => mod.data.slotname === '<<embedding>>')
            let embeddingContent = ''
            embeddingSlots.forEach(slot => {
                if (slot.data.content && Array.isArray(slot.data.content)) {
                    const separator = slot.data.separator || ''
                    embeddingContent += slot.data.content.map(item => separator + item).join('')
                }
            })

            // card.json에도 embedding 적용
            let cardEmbedding = cardJsonData.data?.extensions?.risuai?.backgroundHTML || ''
            if (embeddingContent) {
                const styleEndRegex = /<\/style>/i;
                if (styleEndRegex.test(cardEmbedding)) {
                    cardEmbedding = cardEmbedding.replace(styleEndRegex, `\n${embeddingContent}\n</style>`)
                } else {
                    cardEmbedding += `\n<style>\n${embeddingContent}\n</style>`
                }

                if (!cardJsonData.data) cardJsonData.data = {}
                if (!cardJsonData.data.extensions) cardJsonData.data.extensions = {}
                if (!cardJsonData.data.extensions.risuai) cardJsonData.data.extensions.risuai = {}
                cardJsonData.data.extensions.risuai.backgroundHTML = cardEmbedding
            }

            // 기존 Lua 코드 추출 (append 모드)
            const originalLua = data.risuModule?.trigger?.[0]?.effect?.[0]?.code || ''
            const finalLuaCode = originalLua ? (originalLua + '\n' + luaCode) : luaCode

            // 기존 Embedding 추출 및 병합 (append 모드)
            let finalEmbedding = data.risuModule?.backgroundEmbedding || ''
            if (embeddingContent) {
                if (finalEmbedding.includes('</style>')) {
                    finalEmbedding = finalEmbedding.replace('</style>', `\n${embeddingContent}\n</style>`)
                } else {
                    finalEmbedding += `\n<style>\n${embeddingContent}\n</style>`
                }
            }

            // customModuleToggle 문자열 생성
            const characterName = cardJsonData?.data?.name || '캐릭터'
            const modNames = selectedMods
                // disable_toggle이 true인 mod는 제외
                .filter(mod => !mod.metadata?.disable_toggle)
                .map(mod => {
                    // mod.name에서 파일 이름만 추출 (예: "파일명/mod이름" -> "파일명")
                    const parts = mod.name.split('/')
                    return parts[0]
                })
                // 중복 제거
                .filter((name, index, self) => self.indexOf(name) === index)

            // customModuleToggle 문자열 조립
            let customModuleToggle = `=${characterName}=divider\n`
            customModuleToggle += `=📖mod 토글 목록=group\n`
            modNames.forEach(modName => {
                customModuleToggle += `${modName}=${modName}\n`
            })
            customModuleToggle += `==groupEnd\n`
            if (toggleContent) {
                customModuleToggle += `${toggleContent}\n`
            }
            customModuleToggle += `=${characterName}=divider\n`

            // card.json V3 형식 확인 및 assets 배열 초기화
            const isCardV3Format = cardJsonData.spec === 'chara_card_v3' && cardJsonData.data
            const cardDataRoot = isCardV3Format ? cardJsonData.data : cardJsonData

            if (!cardDataRoot.assets) {
                cardDataRoot.assets = []
            }

            // 에셋 mod들을 card.json에 병합
            const assetMods = selectedMods.filter(mod => mod.section === 'asset')
            assetMods.forEach(mod => {
                if (mod.data.content && Array.isArray(mod.data.content)) {
                    mod.data.content.forEach((assetItem) => {
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

            // 일반 슬롯 mod들을 card.json에 적용 (사전 정의된 슬롯 제외)
            const regularSlotMods = slotMods.filter(mod =>
                mod.data.slotname !== '<<lua>>' &&
                mod.data.slotname !== '<<toggle>>' &&
                mod.data.slotname !== '<<embedding>>'
            )
            if (regularSlotMods.length > 0) {
                mergeSlots(cardDataRoot, regularSlotMods)
            }

            // 사용되지 않은 슬롯 제거
            removeUnusedSlots(cardDataRoot)

            // 업데이트된 card.json 저장
            const cardJsonString = createJSONStringWithPreservedHTML(cardJsonData)
            newZip.file('card.json', cardJsonString)

            // 3. 에셋 파일들을 assets/mod/에 추가
            for (const assetMod of assetMods) {
                if (assetMod.assetFiles && assetMod.zipData) {
                    for (const assetFile of assetMod.assetFiles) {
                        try {
                            const imageData = await assetMod.zipData.file(assetFile.path).async('uint8array')
                            const filename = assetFile.path.replace('assets/', '') // assets/ 제거
                            newZip.file(`assets/mod/${filename}`, imageData)
                        } catch (error) {
                            console.warn(`에셋 파일 ${assetFile.path} 추가 실패:`, error)
                        }
                    }
                }
            }

            // 4. module.risum 재패킹 (charx용 - trigger 및 regex 추가)
            // regex mod들 수집 (data 배열만 추출)
            const regexMods = selectedMods.filter(mod => mod.data?.type === 'regex')
            const regexEntries = []
            regexMods.forEach(mod => {
                if (mod.data?.data && Array.isArray(mod.data.data)) {
                    regexEntries.push(...mod.data.data)
                }
            })

            const charxModule = {
                ...data.risuModule,
                trigger: [
                    {
                        "comment": "",
                        "type": "start",
                        "conditions": [],
                        "effect": [
                            {
                                "type": "triggerlua",
                                "code": finalLuaCode
                            }
                        ],
                        "lowLevelAccess": false
                    }
                ],
                regex: [...(data.risuModule.regex || []), ...regexEntries],
                backgroundEmbedding: finalEmbedding
            }

            // charxModule에도 슬롯 치환 적용
            if (regularSlotMods.length > 0) {
                mergeSlots(charxModule, regularSlotMods)
            }

            const repackResult = await repackCharxWithMergedModule(
                newZip,
                charxModule,
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

            // 별도의 토글 모듈 파일 다운로드 (lorebook, regex, trigger 비우고 customModuleToggle만 추가)
            const { packToRisum } = await import('./risumHandler.js')
            const separateModule = {
                ...data.risuModule,
                lorebook: [],
                regex: [],
                trigger: [],
                customModuleToggle: customModuleToggle
            }
            const emptyRisumResult = await packToRisum(separateModule, [])

            if (emptyRisumResult.success) {
                const risumFilename = charxFilename.replace(/\.charx$/, '') + '_토글_모듈.risum'
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

        // 특수 슬롯 데이터 수집
        // 먼저 모든 mod를 flatten하여 section이 내부에 있는 경우를 처리
        const flattenedMods = flattenSlotMods(selectedMods)
        const slotMods = flattenedMods.filter(mod => mod.section === 'slot')

        // <<embedding>> 슬롯 수집
        const embeddingSlots = slotMods.filter(mod => mod.data.slotname === '<<embedding>>')
        let embeddingContent = ''
        embeddingSlots.forEach(slot => {
            if (slot.data.content && Array.isArray(slot.data.content)) {
                const separator = slot.data.separator || ''
                embeddingContent += slot.data.content.map(item => separator + item).join('')
            }
        })

        // 기존 card.json의 backgroundHTML 추출 및 병합
        let finalEmbedding = data.data?.extensions?.risuai?.backgroundHTML || ''

        if (embeddingContent) {
            // Case-insensitive check for </style>
            const styleEndRegex = /<\/style>/i;
            if (styleEndRegex.test(finalEmbedding)) {
                finalEmbedding = finalEmbedding.replace(styleEndRegex, `\n${embeddingContent}\n</style>`)
            } else {
                finalEmbedding += `\n<style>\n${embeddingContent}\n</style>`
            }
        }


        // card.json 데이터 복제 및 업데이트
        const cardDataToSave = JSON.parse(JSON.stringify(data))
        if (!cardDataToSave.data) cardDataToSave.data = {}
        if (!cardDataToSave.data.extensions) cardDataToSave.data.extensions = {}
        if (!cardDataToSave.data.extensions.risuai) cardDataToSave.data.extensions.risuai = {}
        cardDataToSave.data.extensions.risuai.backgroundHTML = finalEmbedding

        // 사용되지 않은 슬롯 제거
        const cardDataRoot = cardDataToSave.spec === 'chara_card_v3' && cardDataToSave.data ? cardDataToSave.data : cardDataToSave
        removeUnusedSlots(cardDataRoot)

        // card.json 파일을 ZIP에 추가 (업데이트된 데이터 사용)
        const jsonString = createJSONStringWithPreservedHTML(cardDataToSave)
        zip.file('card.json', jsonString)

        // 일반 캐릭터 카드라도 module.risum을 포함시켜서 특수 기능(trigger, embedding 등)이 동작하도록 함
        try {
            const { packToRisum } = await import('./risumHandler.js')

            // <<lua>> 슬롯 수집
            const luaSlots = slotMods.filter(mod => mod.data.slotname === '<<lua>>')
            let luaCode = ''
            luaSlots.forEach(slot => {
                if (slot.data.content && Array.isArray(slot.data.content)) {
                    const separator = slot.data.separator || ''
                    luaCode += slot.data.content.map(item => separator + item).join('')
                }
            })

            // <<toggle>> 슬롯 수집
            const toggleSlots = slotMods.filter(mod => mod.data.slotname === '<<toggle>>')
            let toggleContent = ''
            toggleSlots.forEach(slot => {
                if (slot.data.content && Array.isArray(slot.data.content)) {
                    const separator = slot.data.separator || ''
                    toggleContent += slot.data.content.map(item => separator + item).join('')
                }
            })

            // <<embedding>> 슬롯 처리 완료됨 (위에서 처리)

            // customModuleToggle 생성
            const characterName = data.data?.name || '캐릭터'
            const modNames = selectedMods
                .filter(mod => !mod.metadata?.disable_toggle)
                .map(mod => {
                    const parts = mod.name.split('/')
                    return parts[0]
                })
                .filter((name, index, self) => self.indexOf(name) === index)

            let customModuleToggle = `=${characterName}=divider\n`
            customModuleToggle += `=📖mod 토글 목록=group\n`
            modNames.forEach(modName => {
                customModuleToggle += `${modName}=${modName}\n`
            })
            customModuleToggle += `==groupEnd\n`
            if (toggleContent) {
                customModuleToggle += `${toggleContent}\n`
            }
            customModuleToggle += `=${characterName}=divider\n`

            // regex mod 수집
            const regexMods = selectedMods.filter(mod => mod.data?.type === 'regex')
            const regexEntries = []
            regexMods.forEach(mod => {
                if (mod.data?.data && Array.isArray(mod.data.data)) {
                    regexEntries.push(...mod.data.data)
                }
            })

            // risuModule 객체 생성
            const risuModule = {
                trigger: [
                    {
                        "comment": "",
                        "type": "start",
                        "conditions": [],
                        "effect": [
                            {
                                "type": "triggerlua",
                                "code": luaCode
                            }
                        ],
                        "lowLevelAccess": false
                    }
                ],
                regex: regexEntries,
                backgroundEmbedding: finalEmbedding,
                customModuleToggle: customModuleToggle
            }

            // risuModule에 슬롯 치환 적용 (<<lua>> content 안의 슬롯 처리)
            const regularSlotMods = slotMods.filter(mod =>
                mod.data.slotname !== '<<lua>>' &&
                mod.data.slotname !== '<<toggle>>' &&
                mod.data.slotname !== '<<embedding>>'
            )
            if (regularSlotMods.length > 0) {
                mergeSlots(risuModule, regularSlotMods)
            }

            // module.risum 패킹 및 추가
            const packResult = await packToRisum(risuModule, [])
            if (packResult.success) {
                zip.file('module.risum', packResult.buffer)
            } else {
                console.warn('module.risum 생성 실패:', packResult.error)
            }
        } catch (error) {
            console.warn('module.risum 처리 중 오류:', error)
        }

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

        // 에셋 mod들의 이미지 파일들을 assets/mod/ 디렉토리에 추가
        for (const mod of selectedMods) {
            if (mod.section === 'asset' && mod.assetFiles && mod.zipData) {
                for (const assetFile of mod.assetFiles) {
                    try {
                        const imageData = await mod.zipData.file(assetFile.path).async('blob')
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
