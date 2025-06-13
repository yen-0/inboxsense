/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/chat/:path*',
        destination: 'https://chat-gmail.vercel.app/:path*'
      }
    ]
  }
}

export default nextConfig;