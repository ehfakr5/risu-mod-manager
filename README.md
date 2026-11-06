# 모드를 관리하는 프로그램
- React + tailwindcss
- electron으로 배포 win/mac

## 주요 기능: 기존 json에 텍스트를 수정하거나, 배열에 새로운 요소를 추가하는 기능이야.
1. 사용자가 원본 json을 업로드
2. 사전에 지정된 형식으로 된 모드 json 파일들을 업로드
3. 모드 json 파일들의 목록이 화면에 표시됨
4. 그 중에 체크박스를 클릭하고 export 버튼을 누르면 json파일이 구성돼서 저장됨


## 이미지 모듈 네임스페이스

1. **이미지 모듈 네임스페이스**를 열고 함께 쓸 이미지 모듈(`.risum`)을 한꺼번에 선택하세요.
2. 모듈마다 **사본 다운로드**로 `.ah.risum` 파일을 받고, Risu에서 해당 사본을 가져와 켜세요. 같은 모듈 ID를 공유하는 버전은 하나만 선택해 주세요.
3. **코드 복사**로 Risu의 `module_assetlist` 호출을 복사하세요. 얼터네이트 헌터즈에서는 **에셋 찐빠 수정6**과 **에셋 디스플레이** OUT 첫 블록의 `AH` 바로 아래에 붙여넣으세요. Male/Female 이미지가 필요한 경우 해당 표시 정규식에도 같은 코드를 넣으세요.

파일은 브라우저나 데스크톱 앱에서 처리돼요. 사본에는 새 네임스페이스가 들어가며, 모듈 ID와 에셋 데이터는 그대로 유지돼요.

## json 파일 포맷
- 섹션마다 포맷이 다르나 공통 포맷은 동일함
### 공통 포맷
- 이름(목록에 표시될 이름)
- 섹션(어떤 섹션에 표시될지)
    - 섹션 목록: 로어북, 에셋, 슬롯

### 로어북
```json
{
    "name": "",
    "section": "lorebook",
    "keys": [
        ""
    ],
    "content": "",
    "extensions": {
        "risu_case_sensitive": false,
        "risu_loreCache": null
    },
    "enabled": true,
    "insertion_order": 8,
    "constant": true,
    "selective": false,
    "name": "기초 설정",
    "comment": "기초 설정",
    "case_sensitive": false,
    "use_regex": false
}
```

### 에셋
```json
{
    "name": "",
    "section": "asset",
    "content": [
        {
        "filename": "",
        "assetname": ""
        }
    ]
}
```

### 슬롯
```json
{
    "name": "",
    "section": "slot",
    "slotname": "",
    "content": [""],
    "separator": ""
}
```
## json 섹션 분류
- json 파일의 목록은 