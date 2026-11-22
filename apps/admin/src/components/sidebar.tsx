import { Logo } from "./logo";
import { NavList } from "./nav-list";
import { Version } from "./version";

/** Desktop sidebar (lg+): light-green `mint` surface, full height, sticky. */
export function Sidebar() {
  return (
    <aside className="mint sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-background lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavList />
      </div>
      <div className="border-t border-border px-5 py-4 text-xs text-muted-foreground">
        <p>Not signed in · admin login arrives in M1</p>
        <Version className="mt-1" />
      </div>
    </aside>
  );
}
