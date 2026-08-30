import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "딜러마스터",
  description:
    "노리밋 홀덤 딜러 교육 시뮬레이터 — 판정을 배우는 게 아니라 판정력을 기른다",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistMono.variable} h-full antialiased`}
    >
      {/*
       * Pretendard 동적 서브셋. 한글 웹폰트라 next/font/google 로는 못 가져온다
       * (구글 폰트가 아니다). 동적 서브셋은 유니코드 범위별로 92개 청크를 쪼개 두고
       * 브라우저가 화면에 실제로 쓰인 글자의 청크만 받는다 — 전체 2MB 대신 수십 KB.
       * 버전을 핀으로 고정한다: 자동 업데이트되면 자간이 조용히 바뀐다.
       */}
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
