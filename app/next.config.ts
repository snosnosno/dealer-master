import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 홈 디렉토리(C:\Users\user)에 다른 프로젝트의 package-lock.json 이 있어서
  // Turbopack 이 워크스페이스 루트를 잘못 추론한다. 이 폴더로 고정.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
