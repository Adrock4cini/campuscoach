export function getOnboardingRedirect({
  signedIn,
  onboarded,
  pathname,
}: {
  signedIn: boolean;
  onboarded: boolean | null;
  pathname: string;
}): "/" | "/onboarding" | null {
  if (!signedIn || pathname === "/onboarding" || onboarded === true) return null;

  // A known-incomplete account always resumes setup. An unknown setup state
  // returns to RootGate's visible retry screen instead of exposing a deep link.
  return onboarded === false ? "/onboarding" : "/";
}
