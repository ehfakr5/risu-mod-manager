import { getSectionDisplayName, getSectionIcon, getSectionBadgeColor } from '../utils/fileHandler'

const ModItem = ({ mod, onToggle }) => {
    const isRemoved = mod.isRemoved === true

    return (
        <div className={`p-4 border rounded-lg transition-colors ${isRemoved
                ? 'border-red-400 bg-red-50'
                : mod.selected
                    ? 'border-blue-300 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
            }`}>
            <div className="flex items-start gap-3">
                <input
                    type="checkbox"
                    checked={mod.selected}
                    onChange={() => onToggle(mod.id)}
                    disabled={isRemoved}
                    className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                />

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{getSectionIcon(mod.section)}</span>
                        <h3 className="font-medium truncate" style={{ color: isRemoved ? '#991b1b' : '#111827' }}>
                            {mod.section === 'slot' && mod.data.index !== undefined
                                ? `${mod.name} (${mod.data.contentValue || mod.data.content?.[0] || ''})`
                                : (mod.data.name || mod.name)}
                        </h3>
                        {isRemoved && (
                            <span className="text-xs px-2 py-1 rounded-full bg-red-200 text-red-800">
                                삭제됨
                            </span>
                        )}
                        <span className={`text-xs px-2 py-1 rounded-full ${getSectionBadgeColor(mod.section)}`}>
                            {getSectionDisplayName(mod.section)}
                        </span>
                    </div>

                    <p className="text-sm mb-2" style={{ color: isRemoved ? '#991b1b' : '#4b5563' }}>
                        {isRemoved ? `삭제 대상 (${mod.removedBy}에 의해)` : `파일: ${mod.name}`}
                    </p>

                    {mod.section === 'lorebook' && mod.data.keys && mod.data.keys.length > 0 && (
                        <p className="text-sm text-gray-600">
                            키워드: {mod.data.keys.slice(0, 3).join(', ')}
                            {mod.data.keys.length > 3 && ` 외 ${mod.data.keys.length - 3}개`}
                        </p>
                    )}

                    {mod.section === 'slot' && mod.data.slotname && (
                        <div className="text-sm text-gray-600">
                            <p>슬롯: {mod.data.slotname}</p>
                        </div>
                    )}

                    {mod.section === 'asset' && mod.data.content && Array.isArray(mod.data.content) && (
                        <p className="text-sm text-gray-600">
                            에셋 개수: {mod.data.content.length}개
                        </p>
                    )}

                    {mod.section === 'regex' && mod.data.data && Array.isArray(mod.data.data) && (
                        <p className="text-sm text-gray-600">
                            정규식 규칙: {mod.data.data.length}개
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}

const ModList = ({
    modFiles,
    currentSection,
    onSectionChange,
    onModToggle,
    onSelectAll,
    onDeselectAll,
    tableMode = false
}) => {
    const filteredMods = currentSection === 'all'
        ? modFiles.filter(mod => !mod.isRemoved)
        : currentSection === 'removed'
            ? modFiles.filter(mod => mod.isRemoved)
            : modFiles.filter(mod => mod.section === currentSection && !mod.isRemoved)

    const sectionCounts = modFiles.reduce((acc, mod) => {
        acc[mod.section] = (acc[mod.section] || 0) + 1
        return acc
    }, {})

    const selectedCount = filteredMods.filter(mod => mod.selected).length

    if (modFiles.length === 0) {
        return (
            <div className="text-center py-8">
                <div className="text-gray-400 mb-4">
                    <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                </div>
                <p className="text-gray-500 font-medium">업로드된 모드 파일이 없습니다</p>
                <p className="text-gray-400 text-sm mt-1">모드 파일을 업로드하여 시작해보세요</p>
            </div>
        )
    }

    if (tableMode) {
        return (
            <div className="overflow-hidden">
                {/* Table Body */}
                <div className="max-h-80 overflow-y-auto">
                    {filteredMods.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-gray-400 text-sm">
                                {currentSection === 'all'
                                    ? '업로드된 모드 파일이 없습니다'
                                    : `${getSectionDisplayName(currentSection)} 모드가 없습니다`
                                }
                            </p>
                        </div>
                    ) : (
                        filteredMods.map((mod, index) => (
                            <div
                                key={mod.id}
                                className={`grid grid-cols-12 gap-4 px-4 py-3 border-b transition-colors ${mod.isRemoved
                                        ? 'bg-red-900/30 border-red-700 cursor-not-allowed'
                                        : mod.selected
                                            ? 'bg-gray-700 border-gray-700 cursor-pointer hover:bg-gray-700'
                                            : 'bg-gray-800 border-gray-700 cursor-pointer hover:bg-gray-700'
                                    }`}
                                onClick={() => !mod.isRemoved && onModToggle(mod.id)}
                            >
                                <div className="col-span-1 flex items-center justify-center">
                                    {mod.selected && (
                                        <div className="w-5 h-5 bg-blue-500 rounded flex items-center justify-center">
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <div className="col-span-5 flex items-center text-sm gap-2">
                                    <span className="truncate" style={{ color: mod.isRemoved ? '#fca5a5' : '#fff' }}>
                                        {mod.section === 'slot' && mod.data.index !== undefined
                                            ? `${mod.name} (${mod.data.contentValue || mod.data.content?.[0] || ''})`
                                            : (mod.data.name || mod.name)}
                                    </span>
                                    {mod.isRemoved && (
                                        <span className="text-xs px-2 py-0.5 rounded bg-red-800 text-red-200">
                                            삭제됨
                                        </span>
                                    )}
                                </div>
                                <div className="col-span-3 flex items-center text-sm">
                                    <span className="px-2 py-1 bg-gray-600 text-gray-200 rounded text-xs">
                                        {getSectionDisplayName(mod.section)}
                                    </span>
                                </div>
                                <div className="col-span-3 flex items-center justify-center text-center text-sm text-gray-300">
                                    {mod.section === 'lorebook' && mod.data.keys ? mod.data.keys.length :
                                        mod.section === 'asset' && mod.data.content ? mod.data.content.length :
                                            mod.section === 'slot' && mod.data.content ? mod.data.content.length :
                                                mod.section === 'regex' && mod.data.data ? mod.data.data.length : 0}
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
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentSection === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    onClick={() => onSectionChange('all')}
                >
                    전체 ({modFiles.length})
                </button>
                <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentSection === 'lorebook'
                            ? 'bg-amber-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    onClick={() => onSectionChange('lorebook')}
                >
                    📚 로어북 ({sectionCounts.lorebook || 0})
                </button>
                <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentSection === 'asset'
                            ? 'bg-pink-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    onClick={() => onSectionChange('asset')}
                >
                    🎨 에셋 ({sectionCounts.asset || 0})
                </button>
                <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentSection === 'slot'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    onClick={() => onSectionChange('slot')}
                >
                    🔧 슬롯 ({sectionCounts.slot || 0})
                </button>
                <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${currentSection === 'regex'
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    onClick={() => onSectionChange('regex')}
                >
                    🔤 정규식 ({sectionCounts.regex || 0})
                </button>
            </div>

            {/* Selection Controls */}
            {filteredMods.length > 0 && (
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

            {/* mod Items */}
            <div className="space-y-3 max-h-80 overflow-y-auto">
                {filteredMods.length === 0 ? (
                    <div className="text-center py-8">
                        <p className="text-gray-500">
                            {currentSection === 'all'
                                ? '업로드된 모드 파일이 없습니다'
                                : `${getSectionDisplayName(currentSection)} 모드가 없습니다`
                            }
                        </p>
                    </div>
                ) : (
                    filteredMods.map(mod => (
                        <ModItem
                            key={mod.id}
                            mod={mod}
                            onToggle={onModToggle}
                        />
                    ))
                )}
            </div>
        </div>
    )
}

export default ModList
