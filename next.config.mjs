import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker / IBM Cloud Code Engine deployment.
  // Produces a minimal self-contained server in .next/standalone.
  output: 'standalone',
};

export default withNextIntl(nextConfig);
