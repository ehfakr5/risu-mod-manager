import { useState, useRef, useEffect } from 'react'
import DlcList from './components/DlcList'
import { processDlcFiles, readFileAsJson } from './utils/fileHandler'
import { mergeDlcsIntoOriginal, validateMergeResult, downloadCharxFile } from './utils/jsonMerger'
import { extractAndDownloadDlc } from './utils/extractorUtils'

// 파일명에서 확장자 제거 유틸리티 함수
const removeFileExtension = (filename) => {
  if (!filename) return filename
  // .zip 확장자만 제거
  return filename.replace(/\.zip$/i, '')
}

const MasterCheckbox = ({ dlcFiles, currentSection, onSelectAll, onDeselectAll }) => {
  const checkboxRef = useRef(null)
  
  // 현재 섹션의 DLC들 필터링
  const filteredDlcs = currentSection === 'all' 
    ? dlcFiles 
    : dlcFiles.filter(dlc => dlc.section === currentSection)
    
  const selectedCount = filteredDlcs.filter(dlc => dlc.selected).length
  const totalCount = filteredDlcs.length
  
  // 체크박스 상태 계산
  const isAllSelected = totalCount > 0 && selectedCount === totalCount
  const isPartiallySelected = selectedCount > 0 && selectedCount < totalCount
  
  // indeterminate 상태 설정
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = isPartiallySelected
    }
  }, [isPartiallySelected])
  
  const handleClick = () => {
    if (isAllSelected) {
      onDeselectAll()
    } else {
      onSelectAll()
    }
  }
  
  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={isAllSelected}
      onChange={handleClick}
      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
      title={isAllSelected ? '전체 해제' : '전체 선택'}
    />
  )
}

function App() {
  const [originalJson, setOriginalJson] = useState(null)
  const [dlcFiles, setDlcFiles] = useState([])
  const [_selectedDlcs, _setSelectedDlcs] = useState([])
  const [currentSection, setCurrentSection] = useState('all')
  const [uploadErrors, setUploadErrors] = useState([])
  const [dragOver, setDragOver] = useState({ original: false, dlc: false })
  const [selectedOriginalItems, setSelectedOriginalItems] = useState([])

  const handleOriginalFileSelect = async (files) => {
    const file = files[0]
    if (file) {
      try {
        const result = await readFileAsJson(file, true) // 원본 파일임을 표시
        if (result.success) {
          setOriginalJson({ 
            name: file.name, 
            data: result.data,
            zipData: result.zipData, // ZIP 데이터 보존
            isRisuModule: result.isRisuModule,
            originalRisumBuffer: result.originalRisumBuffer,
            risumAssets: result.risumAssets
          })
          setSelectedOriginalItems([]) // 선택 상태 초기화
          setUploadErrors([])
        } else {
          setUploadErrors([`원본 파일 오류: ${result.errors.join(', ')}`])
        }
      } catch (error) {
        setUploadErrors([`원본 파일 읽기 오류: ${error.message}`])
      }
    }
  }

  const handleDlcFilesSelect = async (files) => {
    setUploadErrors([])
    
    try {
      const { results, errors } = await processDlcFiles(files)
      
      if (results.length > 0) {
        setDlcFiles(prev => [...prev, ...results])
      }
      
      if (errors.length > 0) {
        setUploadErrors(errors)
      }
    } catch (error) {
      setUploadErrors([`DLC 파일 처리 오류: ${error.message}`])
    }
  }

  const handleDlcToggle = (dlcId) => {
    setDlcFiles(prev => {
      const updated = prev.map(dlc => 
        dlc.id === dlcId 
          ? { ...dlc, selected: !dlc.selected }
          : dlc
      )
      return updated
    })
  }

  const handleSectionChange = (section) => {
    setCurrentSection(section)
  }

  const handleSelectAll = () => {
    const filteredDlcs = currentSection === 'all' 
      ? dlcFiles 
      : dlcFiles.filter(dlc => dlc.section === currentSection)
    
    const filteredIds = filteredDlcs.map(dlc => dlc.id)
    
    setDlcFiles(prev =>
      prev.map(dlc =>
        filteredIds.includes(dlc.id)
          ? { ...dlc, selected: true }
          : dlc
      )
    )
  }

  const handleDeselectAll = () => {
    const filteredDlcs = currentSection === 'all' 
      ? dlcFiles 
      : dlcFiles.filter(dlc => dlc.section === currentSection)
    
    const filteredIds = filteredDlcs.map(dlc => dlc.id)
    
    setDlcFiles(prev =>
      prev.map(dlc =>
        filteredIds.includes(dlc.id)
          ? { ...dlc, selected: false }
          : dlc
      )
    )
  }

  const selectedDlcsCount = dlcFiles.filter(dlc => dlc.selected).length

  // 선택된 DLC에서 사용하는 슬롯 목록 추출 (같은 슬롯명은 병합)
  const getUsedSlots = () => {
    const selectedDlcs = dlcFiles.filter(dlc => dlc.selected)
    const slotDlcs = selectedDlcs.filter(dlc => dlc.section === 'slot')
    
    // 슬롯명별로 그룹화
    const slotGroups = {}
    const separatorMap = {}
    const dlcNamesMap = {}
    
    slotDlcs.forEach(dlc => {
      const slotname = dlc.data.slotname
      const separator = dlc.data.separator || ''
      const dlcName = dlc.data.name || dlc.name
      
      if (!slotGroups[slotname]) {
        slotGroups[slotname] = []
        separatorMap[slotname] = separator
        dlcNamesMap[slotname] = []
      }
      
      // 같은 슬롯의 경우 separator가 다르면 첫 번째 것 사용
      if (dlc.data.content && Array.isArray(dlc.data.content)) {
        slotGroups[slotname].push(...dlc.data.content)
      }
      
      if (!dlcNamesMap[slotname].includes(dlcName)) {
        dlcNamesMap[slotname].push(dlcName)
      }
    })
    
    // 그룹화된 슬롯들을 병합하여 반환
    return Object.entries(slotGroups).map(([slotname, contents]) => ({
      slotname,
      dlcNames: dlcNamesMap[slotname],
      content: contents,
      separator: separatorMap[slotname],
      mergedContent: contents.join(separatorMap[slotname])
    }))
  }

  const usedSlots = getUsedSlots()

  // 드래그&드랍 핸들러
  const handleDragOver = (e, type) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(prev => ({ ...prev, [type]: true }))
  }

  const handleDragLeave = (e, type) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(prev => ({ ...prev, [type]: false }))
  }

  const handleDrop = (e, type) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(prev => ({ ...prev, [type]: false }))
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      if (type === 'original') {
        handleOriginalFileSelect(files)
      } else if (type === 'dlc') {
        handleDlcFilesSelect(files)
      }
    }
  }

  const handleOriginalItemToggle = (itemId) => {
    setSelectedOriginalItems(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  const handleDeleteSelected = async () => {
    if (!originalJson || selectedOriginalItems.length === 0) {
      return
    }

    if (!confirm(`선택된 ${selectedOriginalItems.length}개 항목을 원본 파일에서 삭제하시겠습니까?`)) {
      return
    }

    try {
      const updatedData = { ...originalJson.data }

      // RisuAI 모듈인 경우
      if (originalJson.isRisuModule) {
        if (updatedData.risuModule && updatedData.risuModule.lorebook) {
          const lorebookEntriesToDelete = selectedOriginalItems
            .filter(id => id.startsWith('risu-lorebook-'))
            .map(id => parseInt(id.replace('risu-lorebook-', '')))
            .sort((a, b) => b - a) // 역순으로 정렬하여 인덱스 문제 방지

          lorebookEntriesToDelete.forEach(index => {
            updatedData.risuModule.lorebook.splice(index, 1)
          })
        }
      } else {
        // 일반 캐릭터 카드인 경우
        if (updatedData.data) {
          // 로어북 엔트리 삭제
          if (updatedData.data.character_book && updatedData.data.character_book.entries) {
            const lorebookEntriesToDelete = selectedOriginalItems
              .filter(id => id.startsWith('lorebook-'))
              .map(id => parseInt(id.replace('lorebook-', '')))
              .sort((a, b) => b - a) // 역순으로 정렬하여 인덱스 문제 방지

            lorebookEntriesToDelete.forEach(index => {
              updatedData.data.character_book.entries.splice(index, 1)
            })
          }

          // 에셋 삭제
          if (updatedData.data.assets) {
            const assetEntriesToDelete = selectedOriginalItems
              .filter(id => id.startsWith('asset-'))
              .map(id => parseInt(id.replace('asset-', '')))
              .sort((a, b) => b - a) // 역순으로 정렬하여 인덱스 문제 방지

            // x-risu-asset 타입 에셋들만 필터링
            const risuAssets = updatedData.data.assets.filter(asset => asset.type === 'x-risu-asset')
            assetEntriesToDelete.forEach(index => {
              if (index < risuAssets.length) {
                const assetToDelete = risuAssets[index]
                const originalIndex = updatedData.data.assets.indexOf(assetToDelete)
                if (originalIndex !== -1) {
                  updatedData.data.assets.splice(originalIndex, 1)
                }
              }
            })
          }
        }
      }

      // 원본 JSON 데이터 업데이트
      setOriginalJson(prev => ({
        ...prev,
        data: updatedData
      }))

      setSelectedOriginalItems([]) // 선택 상태 초기화
      setUploadErrors([])
      alert(`✅ 삭제 완료! ${selectedOriginalItems.length}개 항목이 삭제되었습니다.`)
    } catch (error) {
      setUploadErrors([`삭제 오류: ${error.message}`])
    }
  }

  const handleExtractSelected = async () => {
    if (!originalJson || selectedOriginalItems.length === 0) {
      return
    }

    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      const filename = `extracted_dlc_${timestamp}.zip`
      
      // 선택된 항목들을 DLC 형식으로 변환하고 ZIP 파일로 다운로드
      const result = await extractAndDownloadDlc(originalJson, selectedOriginalItems, filename)
      
      if (result.success) {
        alert(`✅ 추출 완료! ${selectedOriginalItems.length}개 항목이 DLC 형식으로 추출되었습니다.`)
        setSelectedOriginalItems([]) // 선택 상태 초기화
        setUploadErrors([])
      } else {
        setUploadErrors([result.error])
      }
    } catch (error) {
      setUploadErrors([`추출 오류: ${error.message}`])
    }
  }

  const handleMergeAndDownload = async () => {
    if (!originalJson || selectedDlcsCount === 0) {
      console.log('병합 조건 미충족 - 함수 종료')
      return
    }

    try {
      const selectedDlcs = dlcFiles.filter(dlc => dlc.selected)
      const mergedData = await mergeDlcsIntoOriginal(originalJson.data, selectedDlcs)
      
      const validation = validateMergeResult(mergedData)
      if (!validation.isValid) {
        setUploadErrors([`병합 검증 실패: ${validation.errors.join(', ')}`])
        return
      }

      // 파일명 생성
      const originalName = originalJson.name.replace(/\.(json|charx)$/, '')
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      const filename = `${originalName}_dlc_${timestamp}.charx`
      
      const downloadResult = await downloadCharxFile(
        mergedData, 
        filename, 
        selectedDlcs, 
        originalJson.zipData,
        originalJson.originalRisumBuffer,
        originalJson.risumAssets
      )
      if (downloadResult.success) {
        setUploadErrors([])
        alert(`✅ 병합 완료! ${selectedDlcsCount}개 DLC가 적용되어 다운로드되었습니다.`)
      } else {
        setUploadErrors([downloadResult.error])
      }
    } catch (error) {
      setUploadErrors([`병합 오류: ${error.message}`])
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-medium text-white mb-2">
            RisuAI DLC Manager
          </h1>
          <p className="text-gray-400 text-sm">
            시뮬봇 DLC 파일 관리 및 병합 도구
          </p>
        </div>

        {/* Top Row - Upload sections */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Original File Upload */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm min-h-[200px] flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">원본 파일</h3>
                <p className="text-xs text-gray-400">캐릭터 CHARX 파일</p>
              </div>
            </div>
            
            <div className="flex-1 flex items-center">
              {originalJson ? (
                <div className="w-full bg-gradient-to-r from-emerald-900/20 to-teal-900/20 rounded-lg border border-emerald-700/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-emerald-300 truncate">{originalJson.name}</p>
                      <p className="text-xs text-emerald-400">업로드 완료</p>
                    </div>
                    <button 
                      onClick={() => document.getElementById('originalFile').click()}
                      className="text-emerald-400 hover:text-emerald-300 p-1 rounded-full hover:bg-emerald-800/30 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div 
                  className={`w-full rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-all duration-200 ${
                    dragOver.original 
                      ? 'bg-blue-900/20 border-blue-500' 
                      : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700 hover:border-gray-500'
                  }`}
                  onClick={() => document.getElementById('originalFile').click()}
                  onDragOver={(e) => handleDragOver(e, 'original')}
                  onDragLeave={(e) => handleDragLeave(e, 'original')}
                  onDrop={(e) => handleDrop(e, 'original')}
                >
                  <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-300 mb-1">파일을 드래그하거나 클릭</p>
                  <p className="text-xs text-gray-400">CHARX, ZIP 파일 지원</p>
                </div>
              )}
            </div>
            
            <input
              id="originalFile"
              type="file"
              accept=".charx,.zip"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleOriginalFileSelect(Array.from(e.target.files))
                }
              }}
              className="hidden"
            />
          </div>

          {/* DLC Files Upload */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 shadow-sm min-h-[200px] flex flex-col">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">DLC 파일들</h3>
                <p className="text-xs text-gray-400">모드 JSON 파일들</p>
              </div>
            </div>
            
            <div className="flex-1 flex flex-col gap-3">
              {/* 업로드된 파일 정보 (파일이 있을 때만 표시) */}
              {dlcFiles.length > 0 && (
                <div className="w-full bg-gradient-to-r from-blue-900/20 to-indigo-900/20 rounded-lg border border-blue-700/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{dlcFiles.length}</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-300">{dlcFiles.length}개 파일 업로드됨</p>
                      <p className="text-xs text-blue-400">준비 완료</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 드래그앤드랍 업로드 영역 (항상 표시) */}
              <div 
                className={`w-full rounded-lg border-2 border-dashed text-center cursor-pointer transition-all duration-200 ${
                  dlcFiles.length > 0 ? 'p-4' : 'p-6'
                } ${
                  dragOver.dlc 
                    ? 'bg-purple-900/20 border-purple-500' 
                    : 'bg-gray-700/50 border-gray-600 hover:bg-gray-700 hover:border-gray-500'
                }`}
                onClick={() => document.getElementById('dlcFiles').click()}
                onDragOver={(e) => handleDragOver(e, 'dlc')}
                onDragLeave={(e) => handleDragLeave(e, 'dlc')}
                onDrop={(e) => handleDrop(e, 'dlc')}
              >
                <div className={`bg-gray-600 rounded-full flex items-center justify-center mx-auto ${
                  dlcFiles.length > 0 ? 'w-8 h-8 mb-2' : 'w-12 h-12 mb-3'
                }`}>
                  <svg className={`text-gray-300 ${dlcFiles.length > 0 ? 'w-4 h-4' : 'w-6 h-6'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                  </svg>
                </div>
                <p className={`font-medium text-gray-300 mb-1 ${
                  dlcFiles.length > 0 ? 'text-xs' : 'text-sm'
                }`}>
                  {dlcFiles.length > 0 ? '추가 파일 업로드' : '여러 파일을 선택하세요'}
                </p>
                <p className="text-xs text-gray-400">JSON, ZIP 파일 지원</p>
              </div>
            </div>
            
            <input
              id="dlcFiles"
              type="file"
              accept=".json,.zip"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleDlcFilesSelect(Array.from(e.target.files))
                }
              }}
              className="hidden"
            />
          </div>
        </div>

        {/* Error Messages */}
        {uploadErrors.length > 0 && (
          <div className="mb-6 p-3 bg-red-900/20 border border-red-700/50 rounded-md">
            <div className="text-sm text-red-300">
              {uploadErrors.map((error, index) => (
                <div key={index}>• {error}</div>
              ))}
            </div>
          </div>
        )}

        {/* DLC File List Section */}
        <div className="mb-8">
          <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-700 bg-gray-700/50">
              <h2 className="text-lg font-medium text-white">DLC 파일 목록</h2>
            </div>
            
            {/* Filter Tabs */}
            <div className="px-4 py-3 border-b border-gray-700">
              <div className="flex gap-2">
                {[
                  { key: 'all', label: '전체', count: dlcFiles.length },
                  { key: 'lorebook', label: '로어북', count: dlcFiles.filter(d => d.section === 'lorebook').length },
                  { key: 'asset', label: '에셋', count: dlcFiles.filter(d => d.section === 'asset').length },
                  { key: 'slot', label: '슬롯', count: dlcFiles.filter(d => d.section === 'slot').length }
                ].map(({ key, label, count }) => (
                  <button
                    key={key}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      currentSection === key
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    onClick={() => handleSectionChange(key)}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>
            </div>

            {/* DLC Table */}
            <div className="bg-gray-900/50">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-700 text-sm font-medium text-gray-300 bg-gray-700">
                <div className="col-span-1 flex items-center justify-center">
                  <MasterCheckbox 
                    dlcFiles={dlcFiles}
                    currentSection={currentSection}
                    onSelectAll={handleSelectAll}
                    onDeselectAll={handleDeselectAll}
                  />
                </div>
                <div className="col-span-5">이름</div>
                <div className="col-span-3">종류</div>
                <div className="col-span-3 text-center">개수</div>
              </div>
              
              <DlcList
                dlcFiles={dlcFiles}
                currentSection={currentSection}
                onSectionChange={handleSectionChange}
                onDlcToggle={handleDlcToggle}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                tableMode={true}
              />
            </div>
            
            {/* Slot Information */}
            {usedSlots.length > 0 && (
              <div className="p-4 bg-gray-800/50 border-t border-gray-700">
                <h4 className="text-sm font-medium text-orange-400 mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                  </svg>
                  사용된 슬롯 ({usedSlots.length}개)
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {usedSlots.map((slot, index) => (
                    <div key={index} className="bg-gray-700/50 rounded-lg p-3 border border-gray-600/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-mono text-orange-300 bg-orange-900/30 px-2 py-1 rounded">
                          {slot.slotname}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {slot.dlcNames.map((dlcName, dlcIndex) => (
                            <span key={dlcIndex} className="text-xs text-gray-400 bg-gray-600/50 px-2 py-1 rounded">
                              {dlcName}
                            </span>
                          ))}
                        </div>
                      </div>
                      {slot.mergedContent && (
                        <div className="text-xs text-gray-300">
                          <span className="text-gray-400">병합된 내용: </span>
                          <div className="mt-1 p-2 bg-gray-800/50 rounded border-l-2 border-orange-500/50">
                            <span className="font-mono text-green-300">
                              {slot.mergedContent}
                            </span>
                          </div>
                          {slot.dlcNames.length > 1 && (
                            <div className="mt-1 text-xs text-gray-500">
                              구분자: <span className="font-mono text-orange-400">"{slot.separator}"</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Export Button */}
            <div className="p-4 bg-gray-700/30 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  {selectedDlcsCount > 0 && (
                    <span className="text-blue-400">
                      {selectedDlcsCount}개 DLC 선택됨
                    </span>
                  )}
                </div>
                <button 
                  className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                    !originalJson || selectedDlcsCount === 0
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg transform hover:scale-105'
                  }`}
                  disabled={!originalJson || selectedDlcsCount === 0}
                  onClick={handleMergeAndDownload}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  병합 및 내보내기
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Tables - Original and DLC side by side */}
        <div className="grid grid-cols-2 gap-4">
          {/* Original File Table */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-700 bg-gray-700/50 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">원본 파일</h3>
              {originalJson && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedOriginalItems.length === 0}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                      selectedOriginalItems.length === 0
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-red-600 hover:bg-red-700 text-white shadow-sm transform hover:scale-105'
                    }`}
                    title={selectedOriginalItems.length === 0 ? '항목을 선택해주세요' : `${selectedOriginalItems.length}개 항목 삭제`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                    삭제
                  </button>
                  <button
                    onClick={handleExtractSelected}
                    disabled={selectedOriginalItems.length === 0}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                      selectedOriginalItems.length === 0
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transform hover:scale-105'
                    }`}
                    title={selectedOriginalItems.length === 0 ? '항목을 선택해주세요' : `${selectedOriginalItems.length}개 항목 추출`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 12h6m-3-3v6"/>
                    </svg>
                    추출
                  </button>
                </div>
              )}
            </div>
            <div className="bg-gray-700">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-gray-600 text-sm font-medium text-gray-300">
                <div className="col-span-1 text-center">선택</div>
                <div className="col-span-8">이름</div>
                <div className="col-span-3">종류</div>
              </div>
              {/* Content */}
              <div className="max-h-48 overflow-y-auto bg-gray-800">
                {originalJson ? (
                  <>
                    {/* RisuAI 모듈인지 확인 */}
                    {originalJson.isRisuModule ? (
                      <>
                        {/* RisuAI 모듈의 로어북 엔트리들 */}
                        {originalJson.data?.risuModule?.lorebook?.map((entry, index) => {
                          const itemId = `risu-lorebook-${index}`
                          return (
                            <div 
                              key={itemId} 
                              className={`grid grid-cols-12 gap-4 px-4 py-2 border-b border-gray-700 text-sm cursor-pointer hover:bg-gray-700 transition-colors ${
                                selectedOriginalItems.includes(itemId) ? 'bg-gray-700' : 'bg-gray-800'
                              }`}
                              onClick={() => handleOriginalItemToggle(itemId)}
                            >
                              <div className="col-span-1 flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={selectedOriginalItems.includes(itemId)}
                                  onChange={() => handleOriginalItemToggle(itemId)}
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="col-span-8 truncate text-white">{entry.comment || `로어북 엔트리 ${index + 1}`}</div>
                              <div className="col-span-3 text-gray-300">로어북</div>
                            </div>
                          )
                        }) || []}
                      </>
                    ) : (
                      <>
                        {/* 일반 캐릭터 카드의 로어북 엔트리들 */}
                        {originalJson.data?.data?.character_book?.entries?.map((entry, index) => {
                          const itemId = `lorebook-${index}`
                          return (
                            <div 
                              key={itemId} 
                              className={`grid grid-cols-12 gap-4 px-4 py-2 border-b border-gray-700 text-sm cursor-pointer hover:bg-gray-700 transition-colors ${
                                selectedOriginalItems.includes(itemId) ? 'bg-gray-700' : 'bg-gray-800'
                              }`}
                              onClick={() => handleOriginalItemToggle(itemId)}
                            >
                              <div className="col-span-1 flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={selectedOriginalItems.includes(itemId)}
                                  onChange={() => handleOriginalItemToggle(itemId)}
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="col-span-8 truncate text-white">{entry.name || `로어북 엔트리 ${index + 1}`}</div>
                              <div className="col-span-3 text-gray-300">로어북</div>
                            </div>
                          )
                        }) || []}
                        
                        {/* x-risu-asset 타입 에셋들 */}
                        {originalJson.data?.data?.assets?.filter(asset => asset.type === 'x-risu-asset').map((asset, index) => {
                          const itemId = `asset-${index}`
                          return (
                            <div 
                              key={itemId} 
                              className={`grid grid-cols-12 gap-4 px-4 py-2 border-b border-gray-700 text-sm cursor-pointer hover:bg-gray-700 transition-colors ${
                                selectedOriginalItems.includes(itemId) ? 'bg-gray-700' : 'bg-gray-800'
                              }`}
                              onClick={() => handleOriginalItemToggle(itemId)}
                            >
                              <div className="col-span-1 flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={selectedOriginalItems.includes(itemId)}
                                  onChange={() => handleOriginalItemToggle(itemId)}
                                  className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </div>
                              <div className="col-span-8 truncate text-white">{asset.name || `에셋 ${index + 1}`}</div>
                              <div className="col-span-3 text-gray-300">에셋</div>
                            </div>
                          )
                        }) || []}
                      </>
                    )}
                    
                    {/* 아무것도 없을 때 */}
                    {(!originalJson.isRisuModule && 
                      !originalJson.data?.data?.character_book?.entries?.length && 
                      !originalJson.data?.data?.assets?.filter(asset => asset.type === 'x-risu-asset').length) && (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        로어북이나 에셋이 없습니다
                      </div>
                    )}
                    {(originalJson.isRisuModule && 
                      !originalJson.data?.risuModule?.lorebook?.length) && (
                      <div className="text-center py-6 text-gray-400 text-sm">
                        로어북이 없습니다
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    원본 파일을 업로드해주세요
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selected DLC Table */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 shadow-sm">
            <div className="px-4 py-3 border-b border-gray-700 bg-gray-700/50">
              <h3 className="text-lg font-medium text-white">선택된 DLC</h3>
            </div>
            <div className="bg-gray-700">
              {/* Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-gray-600 text-sm font-medium text-gray-300">
                <div className="col-span-7">이름</div>
                <div className="col-span-3">종류</div>
                <div className="col-span-2 text-center">개수</div>
              </div>
              {/* Content */}
              <div className="max-h-48 overflow-y-auto bg-gray-800">
                {dlcFiles.filter(dlc => dlc.selected).length > 0 ? (
                  dlcFiles.filter(dlc => dlc.selected).map((dlc) => (
                    <div key={dlc.id} className="grid grid-cols-12 gap-4 px-4 py-2 border-b border-gray-700 text-sm bg-gray-800">
                      <div className="col-span-7 truncate text-white">{dlc.data.name || removeFileExtension(dlc.name)}</div>
                      <div className="col-span-3 text-gray-300">
                        {dlc.section === 'lorebook' ? '로어북' :
                         dlc.section === 'asset' ? '에셋' :
                         dlc.section === 'slot' ? '슬롯' : dlc.section}
                      </div>
                      <div className="col-span-2 text-center text-gray-300">
                        {dlc.section === 'lorebook' && dlc.data.keys ? dlc.data.keys.length :
                         dlc.section === 'asset' && dlc.data.content ? dlc.data.content.length :
                         dlc.section === 'slot' && dlc.data.content ? dlc.data.content.length : 0}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    선택된 DLC가 없습니다
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App