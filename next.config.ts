import type { NextConfig } from "next";

const r2AccountId = process.env.R2_ACCOUNT_ID;
const r2BucketName = process.env.R2_BUCKET_NAME;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: r2AccountId && r2BucketName
      ? [
          {
            protocol: "https",
            hostname: `${r2BucketName}.${r2AccountId}.r2.cloudflarestorage.com`,
            pathname: "/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
