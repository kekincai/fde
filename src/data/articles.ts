export type Audience = 'company' | 'personal';
export type Region = 'JP' | 'GLOBAL';

export type Article = {
  id: string;
  title: string;
  source: string;
  sourceType: string;
  region: Region;
  topic: string;
  time: string;
  date: string;
  readingTime: string;
  summary: string;
  whyItMatters: string;
  companyView: string;
  personalView: string;
  url: string;
  importance: 'high' | 'normal';
};

export const articles: Article[] = [
  {
    id: 'router-migration',
    title: 'React Router v8、段階的な移行ガイドを公開',
    source: 'Publickey',
    sourceType: '日本のテックメディア',
    region: 'JP',
    topic: 'Webの変化',
    time: '8分前',
    date: '2026年8月9日',
    readingTime: '4分',
    summary: '大きな変更を一度に行わず、現在のサービスを動かしながら新しい仕組みに移るための道筋が整理されました。',
    whyItMatters: '技術の更新は、開発者だけでなく、サービスの品質や移行計画にも関わります。',
    companyView: '既存サービスの更新計画と、移行に必要な時間を見積もるときの参考になります。',
    personalView: '「新しい技術を学びたいが、何から始めるか分からない」という人にも、段階的な学び方の例になります。',
    url: 'https://www.publickey1.jp/',
    importance: 'high'
  },
  {
    id: 'mercari-platform',
    title: 'Mercariが進めるフロントエンド基盤の再設計',
    source: 'Mercari Engineering',
    sourceType: '日本企業の技術ブログ',
    region: 'JP',
    topic: '会社の実践',
    time: '1時間前',
    date: '2026年8月9日',
    readingTime: '7分',
    summary: '大きくなったサービスを支えるために、チームの仕事の進め方と技術の土台をどう見直すかが紹介されています。',
    whyItMatters: '技術選びは、組織のつくり方やユーザーへの届け方と切り離せないことが分かります。',
    companyView: '採用、チーム分け、開発のスピードを同時に考える際の具体例になります。',
    personalView: '企業がどんな考えでサービスをつくり続けているのかを知る読み物として楽しめます。',
    url: 'https://engineering.mercari.com/',
    importance: 'high'
  },
  {
    id: 'anchor-positioning',
    title: 'CSS Anchor PositioningがBaselineに追加',
    source: 'Chrome for Developers',
    sourceType: 'ブラウザの公式情報',
    region: 'GLOBAL',
    topic: 'Webの変化',
    time: '3時間前',
    date: '2026年8月9日',
    readingTime: '3分',
    summary: 'Webページ上の表示位置を、より自然に調整できる標準機能が、多くのブラウザで使える段階に入りました。',
    whyItMatters: '新しい標準機能は、使いやすさやデザインの表現に少しずつ影響します。',
    companyView: 'サイトやアプリの使い勝手を改善する選択肢として、導入時期を検討できます。',
    personalView: '毎日使うWebサービスの見た目がどう進化していくのかを、具体的に知るきっかけになります。',
    url: 'https://developer.chrome.com/blog/',
    importance: 'normal'
  },
  {
    id: 'jsconf-jp',
    title: 'JSConf JP 2026、11月22日に開催へ',
    source: 'JSConf JP',
    sourceType: '日本のコミュニティ・イベント',
    region: 'JP',
    topic: 'イベント',
    time: '昨日',
    date: '2026年8月8日',
    readingTime: '2分',
    summary: 'JavaScriptを中心に、つくる人・学ぶ人・支える人が集まる年次イベントの日程が発表されました。',
    whyItMatters: '技術の変化は、記事だけでなく、人が出会い、経験を共有する場からも広がります。',
    companyView: '社内の学習支援や採用広報、業界との接点を考える材料になります。',
    personalView: '新しいテーマを知り、同じ関心を持つ人と話す入口になります。',
    url: 'https://jsconf.jp/',
    importance: 'normal'
  },
  {
    id: 'ai-workflow',
    title: 'AIと一緒につくる仕事の進め方、日本企業の実例が増加',
    source: 'LINEヤフー Tech Blog',
    sourceType: '日本企業の技術ブログ',
    region: 'JP',
    topic: '仕事への影響',
    time: '昨日',
    date: '2026年8月8日',
    readingTime: '6分',
    summary: 'AIを導入すること自体ではなく、確認・共有・責任の持ち方まで含めた仕事の変化が紹介されています。',
    whyItMatters: 'AIの話をツールの比較だけで終わらせず、仕事の仕組みとして考える視点を与えてくれます。',
    companyView: '導入の効果だけでなく、ルールづくりや人の役割も同時に検討できます。',
    personalView: '自分の仕事や学びにAIを取り入れるときの、現実的なヒントになります。',
    url: 'https://techblog.lycorp.co.jp/ja',
    importance: 'normal'
  },
  {
    id: 'accessibility-standard',
    title: 'アクセシビリティの新しい実践ガイドが公開',
    source: 'W3C Web Accessibility Initiative',
    sourceType: '国際的な標準・ガイド',
    region: 'GLOBAL',
    topic: '暮らしとサービス',
    time: '2日前',
    date: '2026年8月7日',
    readingTime: '5分',
    summary: '年齢や環境にかかわらず使いやすいサービスを考えるための、実務に近いガイドが更新されました。',
    whyItMatters: 'Webの便利さは、使える人の多さまで含めてはじめて価値になります。',
    companyView: '品質、信頼、法令対応をひとつの改善テーマとして考える助けになります。',
    personalView: '身近なサービスの「使いやすさ」を見直す視点が得られます。',
    url: 'https://www.w3.org/WAI/',
    importance: 'normal'
  }
];

export const topics = ['すべて', '仕事への影響', '会社の実践', '暮らしとサービス', 'Webの変化', '学び方', 'イベント'];
