import toTaipeiDateTime from "../util.ts";

interface DemoMenuFetchPageProps {
  generatedAt: string;
}

export default function DemoMenuFetchPage({
  generatedAt,
}: DemoMenuFetchPageProps) {
  const generatedAtTaipei = toTaipeiDateTime(generatedAt);
  const scriptVersion = encodeURIComponent(generatedAtTaipei);

  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Elysia JSX Menu Fetch Demo</title>
        <link rel="stylesheet" href="/public/css/demo-jsx-page.css" />
      </head>
      <body>
        <main>
          <h1>前端 API 抓取 Menu 示範</h1>
          <p>
            這個頁面先由 JSX 輸出骨架，接著在瀏覽器端呼叫 <code>/api/menu</code>
            並渲染列表。
          </p>
          <p>
            示範路由：<code>/demo-jsx-menu</code>
          </p>
          <div id="menu-fetch-root">載入中...</div>
          <p className="meta">頁面產生時間（台北）：{generatedAtTaipei}</p>
        </main>
        <script
          type="module"
          src={`/public/js/demo-menu-fetch.js?v=${scriptVersion}`}
          defer
        />
      </body>
    </html>
  );
}