import type { ClerkProvider } from '@clerk/nextjs'

type Appearance = NonNullable<React.ComponentProps<typeof ClerkProvider>['appearance']>

/**
 * Komponenty Clerku (přihlášení, registrace) ve vzhledu Dílků. Barvy jen přes
 * třídy Tailwindu s tokeny (`navy-*`, `ink`, `quiet`…) — proměnné existují
 * uvnitř `[data-app="ws"]`, kde SignIn/SignUp vykreslujeme. `!` je nutný:
 * Clerk vkládá vlastní styly za běhu a ty by jinak vyhrály.
 * Hlavička karty zůstává (název kroku, „Zkontrolujte e-mail“…), jen písmem Dílků.
 */
export const clerkAppearance: Appearance = {
  layout: {
    socialButtonsPlacement: 'top',
    socialButtonsVariant: 'blockButton',
  },
  variables: {
    fontFamily: 'var(--font-instrument-sans), system-ui, sans-serif',
    fontSize: '15px',
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full',
    cardBox: '!w-full !max-w-none !rounded-panel !border !border-navy-100 !shadow-none',
    card: '!rounded-none !bg-surface !px-6 !py-8 !shadow-none sm:!px-8',
    headerTitle: '!text-[24px] !font-semibold !tracking-[-0.02em] !text-ink',
    headerSubtitle: '!text-[15px] !text-quiet',
    socialButtonsBlockButton:
      '!h-11 !rounded-full !border !border-navy-100 !bg-surface !text-ink !shadow-none hover:!bg-navy-50',
    socialButtonsBlockButtonText: '!text-[15px] !font-semibold',
    dividerLine: '!bg-navy-100',
    dividerText: '!text-quiet',
    formFieldLabel: '!text-sm !font-medium !text-ink',
    formFieldInput:
      '!h-11 !rounded-chip !border !border-navy-100 !bg-surface !text-[15px] !text-ink !shadow-none focus:!border-navy-500 focus:!ring-2 focus:!ring-navy-500/30',
    formButtonPrimary:
      '!h-11 !rounded-full !bg-navy-700 after:!hidden !text-[15px] !font-semibold !normal-case !text-white !shadow-none hover:!bg-navy-800 active:!bg-navy-900',
    formFieldErrorText: '!text-danger',
    alertText: '!text-danger',
    otpCodeFieldInput: '!rounded-chip !border !border-navy-100 !text-ink',
    formResendCodeLink: '!text-navy-500',
    identityPreviewText: '!text-ink',
    identityPreviewEditButton: '!text-navy-500',
    footer: '!bg-none !bg-ground',
    footerActionText: '!text-quiet',
    footerActionLink: '!font-semibold !text-navy-500 hover:!text-navy-700',
  },
}
