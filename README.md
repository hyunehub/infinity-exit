# ∞번 출구: 메시 네트워크 기반 스마트 대피 시스템

지하 3층 주차장에서 전기차 화재가 났을 때, 기둥 센서끼리 메시 네트워크로 화재·연기 정보를 공유하고 구역별로 안전한 비상계단을 안내하는 과정을 보여 주는 3D 시뮬레이터입니다.

- **바로 보기:** `index.html` (GitHub Pages 주소에서 열림, 파일 하나에 3D 모델과 three.js 포함)
- **경우의 수:** A~D 구역 화재 조합과 다른 구역으로 넘어간 연기 조합 65가지마다 막힌 비상계단과 구역별 대피 계단을 계산합니다.
- **스토리:** 화재 감지 → 정보 공유 → 판단 → 대피 행동 → 결과를 6단계로 보여 줍니다.

## 소스에서 다시 빌드하기 (`source/`)
```
cd source
npm i esbuild playwright
npm pack three@0.160.0 && tar xzf three-0.160.0.tgz && mv package three_pkg
ASSETS_DIR=./assets node build.mjs      # → site/index.html
node tests/oracle.mjs                   # 판단 로직 정답표
node tests/cases.mjs                    # 65가지 경우의 수 → src/cases.json
```

실제 화재 시 소방관과 관리실 지시가 우선합니다. 시뮬레이션의 임계값은 모형 기준이며 실제 설비 기준이 아닙니다.
