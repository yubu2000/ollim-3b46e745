// Concrete, copy-paste fix guides for each audit item (client-safe).
export type FixGuide = {
  why: string;
  steps: string[];
  snippet?: string;
  /** 배포 전에 하나씩 확인할 필수 수정 체크리스트 */
  checklist?: string[];
  /** 적용 전/후 비교 예시 */
  example?: { before: string; after: string };
};

export const FIX_GUIDES: Record<string, FixGuide> = {
  "canonical 태그": {
    why: "canonical이 없으면 같은 내용이 여러 주소(http/https, www 유무, ?파라미터)로 중복 인식돼 검색 순위가 분산되고, LLM도 어떤 주소를 정본으로 인용할지 판단하지 못합니다.",
    steps: [
      "각 페이지의 <head> 안에 그 페이지의 대표 절대주소를 canonical로 넣습니다.",
      "주소는 반드시 절대 URL(도메인 포함)로, 실제 접속되는 주소와 정확히 일치시킵니다.",
      "목록 페이지의 ?page=2 같은 파라미터 페이지도 자기 자신을 canonical로 지정합니다.",
      "http → https, www 유무 중 하나로 301 리다이렉트를 통일하면 효과가 더 큽니다.",
    ],
    checklist: [
      "모든 페이지 <head>에 canonical 태그가 1개만 있다 (중복 금지)",
      "href 가 상대경로가 아닌 절대 URL이다",
      "canonical 주소로 접속했을 때 200으로 열린다 (리다이렉트·404 아님)",
      "페이지마다 canonical 값이 서로 다르다 (전 페이지 홈 주소 금지)",
      "파라미터/페이지네이션 주소도 자기 자신을 가리킨다",
      "적용 후 리포트의 ‘게시 검증’으로 canonical 포함 여부를 재확인했다",
    ],
    example: {
      before: `<head>
  <title>중고차 사고이력 조회 | 무사고닷컴</title>
  <!-- canonical 없음 → /, /index.jsp, /?utm_source=... 가 전부 다른 페이지로 인식됨 -->
</head>`,
      after: `<head>
  <title>중고차 사고이력 조회 | 무사고닷컴</title>
  <link rel="canonical" href="http://mu4go.com/" />
</head>`,
    },
    snippet: `<link rel="canonical" href="http://mu4go.com/현재-페이지-경로" />`,
  },
  "구조화 데이터(JSON-LD)": {
    why: "JSON-LD는 사람이 읽는 문장을 기계가 읽는 데이터로 바꿔줍니다. ChatGPT·Gemini 같은 모델은 구조화된 사실(업체명, 서비스, 지역, 연락처)을 훨씬 잘 인용합니다.",
    steps: [
      "홈에는 Organization(또는 LocalBusiness), 서비스 페이지에는 Service, 글에는 Article 스키마를 넣습니다.",
      "<head> 마지막이나 </body> 직전에 <script type=\"application/ld+json\"> 블록으로 붙입니다.",
      "실제 사업자 정보와 100% 일치시키고, 화면에 없는 정보는 넣지 않습니다.",
      "이 리포트의 ‘스키마 자동 생성·유효성 검사’ 카드에서 만든 코드를 그대로 붙여넣으면 가장 빠릅니다.",
    ],
    checklist: [
      "script 태그의 type 이 정확히 application/ld+json 이다",
      "\"@context\": \"https://schema.org\" 와 \"@type\" 이 모두 있다",
      "필수 항목이 채워져 있다 (Organization: name·url / Article: headline·author·datePublished)",
      "url·logo 같은 주소 값이 절대 URL이다",
      "JSON 문법 오류가 없다 (마지막 쉼표, 따옴표 누락 금지)",
      "스키마 내용이 화면에 실제로 보이는 정보와 일치한다",
      "리포트의 스키마 유효성 검사에서 오류 0건으로 나온다",
    ],
    example: {
      before: `<!-- 구조화 데이터 없음: 크롤러와 LLM이 업체명·서비스·연락처를 문장에서 추측해야 함 -->
<footer>무사고닷컴 | 문의 00-0000-0000</footer>`,
      after: `<footer>무사고닷컴 | 문의 00-0000-0000</footer>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "무사고닷컴",
  "url": "http://mu4go.com",
  "description": "차량번호로 중고차 사고이력·성능점검을 조회하는 서비스",
  "telephone": "+82-00-0000-0000",
  "areaServed": "KR"
}
</script>`,
    },
    snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "무사고닷컴",
  "url": "http://mu4go.com",
  "description": "중고차 사고이력·성능점검 조회 서비스",
  "areaServed": "KR",
  "telephone": "+82-00-0000-0000"
}
</script>`,
  },
  "FAQ 스키마": {
    why: "FAQ 스키마가 있으면 검색결과에 질문·답변이 그대로 노출되고, 생성형 검색이 문장 단위로 답을 발췌해 인용하기 쉬워집니다.",
    steps: [
      "실제 고객이 자주 묻는 질문 4~6개를 페이지 본문에 먼저 노출합니다.",
      "본문에 보이는 질문/답변과 동일한 내용을 FAQPage JSON-LD로 넣습니다.",
      "답변은 2~3문장, 결론 문장을 맨 앞에 둡니다.",
    ],
    checklist: [
      "질문이 본문 화면에도 실제로 보인다 (스키마에만 있는 질문 금지)",
      "질문 4개 이상, 각 답변 2문장 이상",
      "각 Question 에 name 과 acceptedAnswer.text 가 모두 있다",
      "acceptedAnswer 의 @type 이 \"Answer\" 다",
      "한 페이지에 FAQPage 블록은 1개만 둔다",
      "광고성 문구·가격 오기재가 없다 (실제 정책과 일치)",
    ],
    example: {
      before: `<h2>안내</h2>
<p>조회는 간편하고 빠릅니다.</p>`,
      after: `<h2>사고이력 조회는 얼마나 걸리나요?</h2>
<p>차량번호 입력 후 보통 1분 이내에 결과를 확인할 수 있습니다.</p>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "사고이력 조회는 얼마나 걸리나요?",
    "acceptedAnswer": { "@type": "Answer", "text": "차량번호 입력 후 보통 1분 이내에 결과를 확인할 수 있습니다." }
  }]
}
</script>`,
    },
    snippet: `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "사고이력 조회는 얼마나 걸리나요?",
    "acceptedAnswer": { "@type": "Answer", "text": "차량번호 입력 후 보통 1분 이내에 결과를 확인할 수 있습니다." }
  }]
}
</script>`,
  },

  "질문형 소제목": {
    why: "LLM은 사용자의 질문과 문서의 소제목을 매칭해 답변을 만듭니다. 질문형 H2가 많을수록 인용 확률이 올라갑니다.",
    steps: [
      "'서비스 소개' 같은 명사형 소제목을 '사고이력 조회는 어떻게 하나요?'처럼 질문형으로 바꿉니다.",
      "질문 바로 아래 첫 문장에 결론을 먼저 씁니다.",
      "페이지당 질문형 H2를 3개 이상 확보합니다.",
    ],
    snippet: `<h2>중고차 사고이력 조회 비용은 얼마인가요?</h2>
<p>기본 조회는 무료이며, 상세 리포트는 건당 0,000원입니다.</p>`,
  },
  "인용 가능한 수치·사실": {
    why: "모델은 검증 가능한 숫자(기간, 비용, 건수, 비율)를 포함한 문장을 우선 인용합니다.",
    steps: [
      "'빠르게', '저렴하게' 같은 표현을 실제 수치로 교체합니다.",
      "수치에는 기준 시점이나 출처를 함께 적습니다.",
      "핵심 수치는 표로 정리하면 발췌 확률이 더 높아집니다.",
    ],
    snippet: `<p>2026년 기준 평균 조회 소요시간은 47초, 누적 조회 건수는 128,000건입니다.</p>`,
  },
  "요약 문단(첫 문단)": {
    why: "생성형 검색은 문서 앞부분을 가장 강하게 참조합니다. 첫 문단이 요약이면 그대로 답변에 인용됩니다.",
    steps: [
      "첫 문단 2~3문장 안에 '무엇을, 누구에게, 어떻게' 제공하는지 담습니다.",
      "핵심 키워드를 첫 문장에 자연스럽게 포함합니다.",
    ],
    snippet: `<p>무사고닷컴은 차량번호만으로 중고차 사고이력과 성능점검 기록을 1분 안에 확인할 수 있는 서비스입니다.</p>`,
  },
  "llms.txt 제공": {
    why: "llms.txt는 AI 모델에게 사이트의 핵심 정보와 주요 URL을 요약해 알려주는 파일입니다.",
    steps: [
      "사이트 루트에 /llms.txt 파일을 추가합니다(정적 파일로 배포).",
      "브랜드 한 줄 소개 + 주요 페이지 링크 + 연락처를 마크다운으로 적습니다.",
    ],
    snippet: `# 무사고닷컴
> 차량번호로 중고차 사고이력·성능점검을 조회하는 서비스입니다.

## 주요 페이지
- [사고이력 조회](http://mu4go.com/): 차량번호 입력 후 즉시 조회
- [이용요금](http://mu4go.com/price): 조회 항목별 요금 안내`,
  },
  "브랜드/사업자 신뢰 정보": {
    why: "상호, 사업자번호, 주소, 연락처가 명시된 사이트는 모델이 신뢰 가능한 출처로 판단합니다.",
    steps: [
      "푸터에 상호·대표자·사업자등록번호·주소·전화번호를 텍스트(이미지 아님)로 노출합니다.",
      "같은 정보를 Organization JSON-LD에도 동일하게 넣습니다.",
    ],
  },
  "본문 분량": {
    why: "내용이 너무 짧으면 인용할 문장 자체가 부족합니다.",
    steps: [
      "핵심 페이지는 최소 800~1,200자 이상으로 보강합니다.",
      "이용 절차, 자주 묻는 질문, 사례를 섹션으로 추가합니다.",
      "이 리포트의 '키워드·콘텐츠 제안'에서 초안을 자동 생성해 붙여넣으면 빠릅니다.",
    ],
  },
  "오픈그래프(og) 태그": {
    why: "공유 시 제목·설명·썸네일이 정상 노출되고, 크롤러가 페이지 요지를 파악하는 데도 쓰입니다.",
    steps: ["<head>에 og:title, og:description, og:image, og:url을 넣습니다.", "og:image는 1200x630 절대 URL을 사용합니다."],
    snippet: `<meta property="og:title" content="중고차 사고이력 조회 | 무사고닷컴" />
<meta property="og:description" content="차량번호만으로 사고이력과 성능점검 기록을 1분 안에 확인하세요." />
<meta property="og:image" content="http://mu4go.com/og.jpg" />
<meta property="og:url" content="http://mu4go.com/" />`,
  },
};
