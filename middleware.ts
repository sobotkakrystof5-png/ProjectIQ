export { default } from 'next-auth/middleware'

export const config = {
  matcher: ['/dashboard/:path*', '/alteno/:path*', '/alteno', '/hub/:path*', '/hub'],
}
