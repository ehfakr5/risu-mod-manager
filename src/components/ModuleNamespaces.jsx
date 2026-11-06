import { useRef, useState } from 'react'

const buttonClass = 'rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500'

function download({ blob, filename }) {
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ModuleNamespaces() {
    const [modules, setModules] = useState([])
    const [errors, setErrors] = useState([])
    const [busy, setBusy] = useState(false)
    const [exporting, setExporting] = useState(false)
    const [zipError, setZipError] = useState('')
    const [status, setStatus] = useState('')
    const fileInput = useRef(null)
    const codeField = useRef(null)
    const code = modules.map(module => `    {{module_assetlist::${module.namespace}}}`).join('\n')

    const selectFiles = async (event) => {
        const files = Array.from(event.currentTarget.files)
        event.currentTarget.value = ''
        if (!files.length) return

        setBusy(true)
        setModules([])
        setErrors([])
        setZipError('')
        setStatus('')
        const results = []
        const failures = []
        const used = new Set()
        try {
            const { createRisumNamespaceCopy } = await import('../utils/risumHandler')
            for (const file of files) {
                try {
                    const result = await createRisumNamespaceCopy(file)
                    if (used.has(result.namespace)) {
                        throw new Error('같은 모듈 ID가 이미 있어요. 사용할 버전 하나만 골라주세요.')
                    }
                    used.add(result.namespace)
                    results.push(result)
                } catch (error) {
                    failures.push(`${file.name}: ${error.message}`)
                }
            }
            setModules(results)
            setErrors(failures)
        } catch (error) {
            setErrors([error.message])
        } finally {
            setBusy(false)
        }
    }

    const downloadAll = async () => {
        setExporting(true)
        setZipError('')
        try {
            const { createStoredZip } = await import('../utils/storedZip')
            const blob = await createStoredZip(modules)
            download({ blob, filename: 'risu-image-modules.zip' })
        } catch (error) {
            setZipError(error.message)
        } finally {
            setExporting(false)
        }
    }

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(code)
            setStatus('정규식 코드를 복사했어요.')
        } catch {
            codeField.current?.focus()
            codeField.current?.select()
            setStatus('선택된 코드를 Ctrl+C 또는 Command+C로 복사해 주세요.')
        }
    }

    return (
        <details className="mb-6 rounded-xl border border-gray-700 bg-gray-800 text-gray-300">
            <summary className="cursor-pointer px-5 py-4 text-base font-semibold text-white">이미지 모듈 네임스페이스</summary>
            <div className="space-y-4 border-t border-gray-700 p-5">
                <p className="text-sm">같이 쓸 이미지 모듈을 한 번에 선택해 주세요.</p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy || exporting} className={buttonClass + ' disabled:opacity-50'}
                        onClick={() => fileInput.current?.click()}>RISUM 선택</button>
                    {modules.length > 1 ? (
                        <button type="button" disabled={exporting} className={buttonClass + ' disabled:opacity-50'} onClick={downloadAll}>
                            {exporting ? 'ZIP 만드는 중…' : '전체 ZIP 다운로드'}
                        </button>
                    ) : null}
                </div>
                <input ref={fileInput} type="file" accept=".risum" multiple onChange={selectFiles} hidden aria-label="이미지 모듈 선택" />
                {busy ? <p role="status" className="text-sm">모듈을 읽고 있어요.</p> : null}
                {zipError ? <p role="alert" className="text-sm text-red-300">{zipError}</p> : null}
                {errors.length ? (
                    <ul role="alert" className="space-y-1 break-all text-sm text-red-300">
                        {errors.map((error, index) => <li key={index}>{error}</li>)}
                    </ul>
                ) : null}
                {modules.length ? (
                    <>
                        <ul className="divide-y divide-gray-700">
                            {modules.map(module => (
                                <li key={module.namespace} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                                    <div className="min-w-0 break-all">
                                        <p className="font-medium text-white">{module.name} <span className="text-gray-400">({module.assetCount.toLocaleString()}개)</span></p>
                                        <p className="font-mono text-xs">{module.originalNamespace || '(없음)'} → {module.namespace}</p>
                                    </div>
                                    <button type="button" className={buttonClass} onClick={() => download(module)}
                                        aria-label={`${module.name} 사본 다운로드`}>사본 다운로드</button>
                                </li>
                            ))}
                        </ul>
                        <div className="space-y-2">
                            <label htmlFor="module-namespace-code" className="block text-sm font-medium text-white">정규식 OUT 코드</label>
                            <textarea id="module-namespace-code" ref={codeField} readOnly value={code} spellCheck={false}
                                rows={Math.min(modules.length + 1, 6)} className="block w-full rounded-md border border-gray-700 bg-gray-900 p-3 font-mono text-sm text-gray-100" />
                            <button type="button" className={buttonClass} onClick={copy}>코드 복사</button>
                            <p role="status" className="text-sm text-emerald-300">{status}</p>
                            <p className="text-sm text-gray-400">Risu에서는 다운로드한 사본을 켜세요. 얼터네이트 헌터즈의 에셋 찐빠 수정6과 에셋 디스플레이 OUT 맨 위에서 AH 바로 아래 빈 줄에 코드를 넣으면 돼요. Male/Female 이미지도 연결할 때는 해당 에셋 디스플레이 OUT에도 넣어 주세요.</p>
                        </div>
                    </>
                ) : null}
            </div>
        </details>
    )
}
