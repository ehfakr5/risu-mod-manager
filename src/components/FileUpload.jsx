import { useRef } from 'react'

const FileUpload = ({ 
  title, 
  description, 
  onFileSelect, 
  multiple = false,
  accept = ".json",
  compact = false
}) => {
  const fileInputRef = useRef(null)

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files)
    if (files.length > 0) {
      onFileSelect(files)
    }
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    
    const files = Array.from(event.dataTransfer.files)
    const jsonFiles = files.filter(file => file.name.endsWith('.json'))
    
    if (jsonFiles.length > 0) {
      onFileSelect(jsonFiles)
    }
  }

  const handleClick = () => {
    fileInputRef.current.click()
  }

  return (
    <div>
      {title && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {title}
        </label>
      )}
      <div 
        className={`border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors duration-200 ${
          compact ? 'p-3' : 'p-6'
        }`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {!compact && (
          <div className="mb-4">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
          </div>
        )}
        
        <div>
          <p className={`text-gray-700 font-medium ${
            compact ? 'text-sm' : 'mb-1'
          }`}>
            {description || "파일을 드래그하거나 클릭하여 업로드"}
          </p>
          {!compact && (
            <p className="text-sm text-gray-500">
              JSON 파일만 지원됩니다
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default FileUpload