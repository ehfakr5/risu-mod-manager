# 모드를 관리하는 프로그램
- React + tailwindcss
- electron으로 배포 win/mac

## 주요 기능: 기존 json에 텍스트를 수정하거나, 배열에 새로운 요소를 추가하는 기능이야.
1. 사용자가 원본 json을 업로드
2. 사전에 지정된 형식으로 된 모드 json 파일들을 업로드
3. 모드 json 파일들의 목록이 화면에 표시됨
4. 그 중에 체크박스를 클릭하고 export 버튼을 누르면 json파일이 구성돼서 저장됨


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