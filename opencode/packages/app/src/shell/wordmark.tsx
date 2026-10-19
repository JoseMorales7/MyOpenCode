import { Logo } from "@opencode/ui/logo"
import { useLanguage } from "@/runtime/i18n/language"

/** App-only branding; provider logos and the shared upstream UI assets remain intact. */
export function AppWordmark(props: { class?: string }) {
  const language = useLanguage()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 294 42"
      role="img"
      aria-label={language.t("brand.name")}
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <svg x="60" width="234" height="42" aria-hidden="true">
        <Logo />
      </svg>
      <MyWordmarkPrefix />
    </svg>
  )
}

/** Shared by the static app wordmark and the About page's existing animated lettering. */
export function MyWordmarkPrefix() {
  return (
    <g fill="var(--icon-base)">
      <path d="M0 36V6H6L12 18L18 6H24V36H18V18L12 30L6 18V36H0Z" />
      <path d="M30 6H36V24H48V6H54V36H48V42H30V36H48V30H30V6Z" />
    </g>
  )
}
