const AUTH_CHROME_HIDDEN_ROUTES = new Set([
  "/login",
  "/signup",
  "/signup/complete",
  "/forgot-password",
  "/reset-password",
]);

export function shouldHideGlobalChrome(pathname: string | null | undefined) {
  if (!pathname) return false;
  if (pathname.startsWith("/auth")) return true;
  return AUTH_CHROME_HIDDEN_ROUTES.has(pathname);
}

export { AUTH_CHROME_HIDDEN_ROUTES };
