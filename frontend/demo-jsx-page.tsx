interface DemoJsxPageProps {
  menuCount: number;
  orderCount: number;
  generatedAt: string;
}

export default function DemoJsxPage({
  menuCount,
  orderCount,
  generatedAt,
}: DemoJsxPageProps) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Elysia JSX Demo</title>
        <link rel="stylesheet" href="/public/css/demo-jsx-page.css" />
      </head>
      <body>
        <main>
          <h1>JSX in Elysia</h1>
          <p>
            這個頁面是由 <code>index.ts</code> 透過 React server-side render 產生，再以
            HTML 回傳給瀏覽器。
          </p>
          <ul>
            <li>目前菜單筆數：{menuCount}</li>
            <li>目前訂單筆數：{orderCount}</li>
            <li>
              示範路由：<code>/demo-jsx</code>
            </li>
          </ul>
          <p className="meta">產生時間：{generatedAt}</p>
        </main>
      </body>
    </html>
  );
}