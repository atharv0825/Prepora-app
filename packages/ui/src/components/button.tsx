import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

// Pill buttons (Prepora_UI_Design.md). Colours come from tokens: the primary pill is green
// (#3FC48C) with deep-teal text (#08222B) on white and on mint sections.
// Hover inverts: solid pill → outlined, outlined pill → solid.
// Sizes are mobile-first: default/lg are ≥ 44px tall (comfortable touch targets).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border font-medium whitespace-nowrap transition-colors duration-200 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        /** Primary CTA: "Start free", "Start practising free →". */
        default:
          "border-primary bg-primary text-primary-foreground hover:bg-background hover:text-foreground hover:border-foreground",
        /** Secondary CTA: "Try a speaking test". */
        outline:
          "border-foreground/25 bg-transparent text-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-accent",
        /** Text link style, e.g. "Log in" in the navbar. */
        link: "h-auto border-transparent px-0 text-foreground underline-offset-4 hover:underline",
        destructive:
          "border-destructive bg-destructive text-white hover:bg-transparent hover:text-destructive dark:text-brand-ink dark:hover:text-destructive",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        default: "h-11 px-5 text-sm",
        lg: "h-12 px-7 text-base",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    // Applied after size classes, so a link stays text-sized whatever `size` is.
    compoundVariants: [{ variant: "link", class: "h-auto px-0" }],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
