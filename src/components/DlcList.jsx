import { getSectionDisplayName, getSectionIcon } from '../utils/fileHandler'

// 파일명에서 확장자 제거 유틸리티 함수
const removeFileExtension = (filename) => {
  if (!filename) return filename
  // .zip 확장자만 제거
  return filename.replace(/\.zip$/i, '')
}

const DlcItem = ({ dlc, onToggle }) => {
  const getSectionBadgeColor = (section) => {
    const colors = {
      'lorebook': 'bg-amber-100 text-amber-800',
      'asset': 'bg-pink-100 text-pink-800',
      'slot': 'bg-emerald-100 text-emerald-800',
      'unknown': 'bg-gray-100 text-gray-800'
    }
    return colors[section] || colors.unknown
  }

  return (
    <div className={`p-4 border rounded-lg transition-colors ${
      dlc.selected 
        ? 'border-blue-300 bg-blue-50' 
        : 'border-gray-200 hover:border-gray-300'
    }`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={dlc.selected}
          onChange={() => onToggle(dlc.id)}
          className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">{getSectionIcon(dlc.section)}</span>
            <h3 className="font-medium text-gray-900 truncate">
              {dlc.data.name || removeFileExtension(dlc.name)}
            </h3>
            <span className={`text-xs px-2 py-1 rounded-full ${getSectionBadgeColor(dlc.section)}`}>
              {getSectionDisplayName(dlc.section)}
            </span>
          </div>
          
          <p className="text-sm text-gray-600 mb-2">
            파일: {removeFileExtension(dlc.name)}
          </p>
          
          {dlc.section === 'lorebook' && dlc.data.keys && dlc.data.keys.length > 0 && (
            <p className="text-sm text-gray-600">
              키워드: {dlc.data.keys.slice(0, 3).join(', ')}
              {dlc.data.keys.length > 3 && ` 외 ${dlc.data.keys.length - 3}개`}
            </p>
          )}
          
          {dlc.section === 'slot' && dlc.data.slotname && (
            <p className="text-sm text-gray-600">
              슬롯: {dlc.data.slotname}
            </p>
          )}
          
          {dlc.section === 'asset' && dlc.data.content && Array.isArray(dlc.data.content) && (
            <p className="text-sm text-gray-600">
              에셋 개수: {dlc.data.content.length}개
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

const DlcList = ({ 
  dlcFiles, 
  currentSection, 
  onSectionChange, 
  onDlcToggle,
  onSelectAll,
  onDeselectAll,
  tableMode = false
}) => {
  const filteredDlcs = currentSection === 'all' 
    ? dlcFiles 
    : dlcFiles.filter(dlc => dlc.section === currentSection)

  const sectionCounts = dlcFiles.reduce((acc, dlc) => {
    acc[dlc.section] = (acc[dlc.section] || 0) + 1
    return acc
  }, {})

  const selectedCount = filteredDlcs.filter(dlc => dlc.selected).length

  const getSectionBadgeColor = (section) => {
    const colors = {
      'lorebook': 'bg-amber-100 text-amber-800',
      'asset': 'bg-pink-100 text-pink-800',
      'slot': 'bg-emerald-100 text-emerald-800',
      'unknown': 'bg-gray-100 text-gray-800'
    }
    return colors[section] || colors.unknown
  }

  if (dlcFiles.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
          </svg>
        </div>
        <p className="text-gray-500 font-medium">업로드된 DLC 파일이 없습니다</p>
        <p className="text-gray-400 text-sm mt-1">DLC 파일을 업로드하여 시작해보세요</p>
      </div>
    )
  }

  if (tableMode) {
    return (
      <div className="overflow-hidden">
        {/* Table Body */}
        <div className="max-h-80 overflow-y-auto">
          {filteredDlcs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm">
                {currentSection === 'all' 
                  ? '업로드된 DLC 파일이 없습니다' 
                  : `${getSectionDisplayName(currentSection)} DLC가 없습니다`
                }
              </p>
            </div>
          ) : (
            filteredDlcs.map((dlc, index) => (
              <div 
                key={dlc.id} 
                className={`grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-700 cursor-pointer hover:bg-gray-700 transition-colors ${
                  dlc.selected ? 'bg-gray-700' : 'bg-gray-800'
                }`}
                onClick={() => onDlcToggle(dlc.id)}
              >
                <div className="col-span-1 flex items-center justify-center">
                  {dlc.selected && (
                    <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                  )}
                </div>
                <div className="col-span-5 flex items-center text-sm">
                  <span className="truncate text-white">
                    {dlc.data.name || removeFileExtension(dlc.name)}
                  </span>
                </div>
                <div className="col-span-3 flex items-center text-sm">
                  <span className="px-2 py-1 bg-gray-600 text-gray-200 rounded text-xs">
                    {getSectionDisplayName(dlc.section)}
                  </span>
                </div>
                <div className="col-span-3 flex items-center justify-center text-center text-sm text-gray-300">
                  {dlc.section === 'lorebook' && dlc.data.keys ? dlc.data.keys.length :
                   dlc.section === 'asset' && dlc.data.content ? dlc.data.content.length :
                   dlc.section === 'slot' && dlc.data.content ? dlc.data.content.length : 0}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // Card view (fallback)
  return (
    <div>
      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button 
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentSection === 'all' 
              ? 'bg-blue-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => onSectionChange('all')}
        >
          전체 ({dlcFiles.length})
        </button>
        <button 
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentSection === 'lorebook' 
              ? 'bg-amber-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => onSectionChange('lorebook')}
        >
          📚 로어북 ({sectionCounts.lorebook || 0})
        </button>
        <button 
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentSection === 'asset' 
              ? 'bg-pink-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => onSectionChange('asset')}
        >
          🎨 에셋 ({sectionCounts.asset || 0})
        </button>
        <button 
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentSection === 'slot' 
              ? 'bg-emerald-600 text-white' 
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => onSectionChange('slot')}
        >
          🔧 슬롯 ({sectionCounts.slot || 0})
        </button>
      </div>

      {/* Selection Controls */}
      {filteredDlcs.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-gray-600">
            {selectedCount > 0 && (
              <span className="text-blue-600 font-medium">
                {selectedCount}개 선택됨
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSelectAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              전체 선택
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={onDeselectAll}
              className="text-sm text-gray-600 hover:text-gray-700 font-medium"
            >
              전체 해제
            </button>
          </div>
        </div>
      )}
      
      {/* DLC Items */}
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {filteredDlcs.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {currentSection === 'all' 
                ? '업로드된 DLC 파일이 없습니다' 
                : `${getSectionDisplayName(currentSection)} DLC가 없습니다`
              }
            </p>
          </div>
        ) : (
          filteredDlcs.map(dlc => (
            <DlcItem 
              key={dlc.id} 
              dlc={dlc} 
              onToggle={onDlcToggle}
            />
          ))
        )}
      </div>
    </div>
  )
}

export default DlcList