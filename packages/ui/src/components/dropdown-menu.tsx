"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Check } from "lucide-react"
import { cn } from "cn"

// Dropdown menu on Base UI's Menu (M1-F3, account menu). Keyboard and screen-reader behaviour
// (arrow keys, Escape, focus return, roles) come from Base UI.

function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-50 outline-none">
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "min-w-56 origin-(--transform-origin) rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_20px_60px_-20px_rgba(8,34,43,0.35)] outline-none",
            "transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

const itemClass =
  "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm outline-none select-none data-highlighted:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.5]"

function DropdownMenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return <MenuPrimitive.Item data-slot="dropdown-menu-item" className={cn(itemClass, className)} {...props} />
}

/** A menu item that is a link (renders <a>; pass `render={<Link …/>}` for Next links). */
// Closes on click by default (Base UI's default is false): with client-side navigation the
// layout, and so the open menu, stays mounted on the next page and blocks it.
function DropdownMenuLinkItem({ className, closeOnClick = true, ...props }: MenuPrimitive.LinkItem.Props) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="dropdown-menu-link-item"
      className={cn(itemClass, className)}
      closeOnClick={closeOnClick}
      {...props}
    />
  )
}

/** A set of mutually exclusive choices (e.g. Appearance: System / Light / Dark). */
function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

/** One choice in a radio group: a check marks the selected one. Stays open by default. */
function DropdownMenuRadioItem({ className, children, closeOnClick = false, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(itemClass, className)}
      closeOnClick={closeOnClick}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator className="ml-auto">
        <Check aria-hidden />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dropdown-menu-label" className={cn("px-3 py-2", className)} {...props} />
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-border", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
